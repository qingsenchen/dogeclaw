(function () {
  const CONFIG = globalThis.DogeclawConfig || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const BROWSER_CONFIG = CONFIG.browser || {};
  const BROWSER_ACTION_TIMEOUT_MS = BROWSER_CONFIG.actionTimeoutMs || 10000;
  const MAX_SNAPSHOT_ITEMS = BROWSER_CONFIG.maxSnapshotItems || 80;
  const SCREENSHOT_DATA_URL_LIMIT = BROWSER_CONFIG.screenshotDataUrlLimit || 1200000;
  const SCREENSHOT_JPEG_QUALITY = BROWSER_CONFIG.screenshotJpegQuality || 90;
  const MAX_ARTIFACTS = BROWSER_CONFIG.maxArtifacts || 20;
  const CONTENT_SCRIPT_FILES = CONFIG.content?.scriptFiles || [
    "config.js",
    "pet.js",
    "ui.js",
    "content/styles.js",
    "content/browser-actions.js",
    "content/game.js",
    "content/index.js"
  ];
  const browserArtifacts = [];

  function assertExtensionApi(name, value) {
    if (!value) {
      throw new Error(t("runtime.extensionApiUnavailable", { name }));
    }
  }

  function withTimeout(promise, timeoutMs = BROWSER_ACTION_TIMEOUT_MS) {
    let timerId = 0;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error(t("browser.actionTimedOut"))), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
  }

  function storeArtifact(artifact, scope = "") {
    const id = `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    browserArtifacts.push({
      ...artifact,
      id,
      scope: String(scope || "")
    });
    while (browserArtifacts.length > MAX_ARTIFACTS) {
      browserArtifacts.shift();
    }
    return id;
  }

  function drainArtifacts(options = {}) {
    const scope = String(options.scope || "");
    const drained = [];
    for (let i = browserArtifacts.length - 1; i >= 0; i -= 1) {
      if (!scope || browserArtifacts[i].scope === scope) {
        drained.unshift(browserArtifacts[i]);
        browserArtifacts.splice(i, 1);
      }
    }
    return drained;
  }

  async function getActiveTab() {
    assertExtensionApi("tabs.query", PLATFORM.tabs?.query);
    let tabs = await PLATFORM.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      tabs = await PLATFORM.tabs.query({ active: true, lastFocusedWindow: true });
    }
    if (!tabs.length) {
      tabs = await PLATFORM.tabs.query({ active: true });
    }
    const tab = tabs.find((item) => /^https?:\/\//i.test(item.url || item.pendingUrl || "")) || tabs[0];
    if (!tab?.id) {
      throw new Error(t("browser.noActiveTab"));
    }
    return tab;
  }

  async function getTargetTab(args = {}) {
    const tabId = Number(args.tabId || args.id || 0);
    if (Number.isInteger(tabId) && tabId > 0) {
      assertExtensionApi("tabs.get", PLATFORM.tabs?.get);
      const tab = await PLATFORM.tabs.get(tabId);
      if (!tab?.id) {
        throw new Error(t("browser.tabNotFound", { tabId }));
      }
      return tab;
    }
    return getActiveTab();
  }

  async function activateTab(tab) {
    assertExtensionApi("tabs.update", PLATFORM.tabs?.update);
    if (!tab?.id) {
      throw new Error(t("browser.tabIdRequired"));
    }
    if (!tab.active) {
      await PLATFORM.tabs.update(tab.id, { active: true });
    }
    if (tab.windowId && PLATFORM.windows?.update) {
      await PLATFORM.windows.update(tab.windowId, { focused: true }).catch(() => null);
    }
    return PLATFORM.tabs.get(tab.id);
  }

  async function waitForTabComplete(tabId, timeoutMs = BROWSER_ACTION_TIMEOUT_MS) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const tab = await PLATFORM.tabs.get(tabId);
      if (tab.status === "complete") {
        return tab;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return PLATFORM.tabs.get(tabId);
  }

  function canAccessTabUrl(url) {
    return Boolean(url && /^https?:\/\//i.test(url));
  }

  async function ensureTabScript(tab) {
    if (!tab?.id) {
      throw new Error(t("browser.tabIdRequired"));
    }
    if (!canAccessTabUrl(tab.url)) {
      throw new Error(t("browser.cannotControlPage", { url: tab.url || t("common.unknownUrl") }));
    }

    try {
      const existing = await PLATFORM.tabs.sendMessage(tab.id, { type: "dogeclawBrowserPing" });
      if (existing?.ok) {
        return true;
      }
    } catch {}

    assertExtensionApi("scripting.executeScript", PLATFORM.scripting?.executeScript);
    await PLATFORM.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPT_FILES
    });
    return true;
  }

  async function sendToTab(tab, payload) {
    await ensureTabScript(tab);
    const result = await withTimeout(PLATFORM.tabs.sendMessage(tab.id, payload));
    if (result?.ok === false) {
      throw new Error(result.error || t("browser.actionFailed"));
    }
    return result;
  }

  async function prepareTabForNavigation(tab) {
    if (!tab?.id || !canAccessTabUrl(tab.url)) {
      return;
    }

    try {
      await withTimeout(PLATFORM.tabs.sendMessage(tab.id, { type: "dogeclawPrepareForNavigation" }), 800);
    } catch {}
  }

  async function listTabs() {
    assertExtensionApi("tabs.query", PLATFORM.tabs?.query);
    const tabs = await PLATFORM.tabs.query({});
    return tabs.map((tab) => ({
      id: tab.id,
      active: Boolean(tab.active),
      title: tab.title || "",
      url: tab.url || "",
      windowId: tab.windowId
    }));
  }

  async function currentTab() {
    const tab = await getActiveTab();
    return {
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      active: Boolean(tab.active),
      windowId: tab.windowId
    };
  }

  function markDetachedNavigation(tab, context = {}) {
    if (Number(context.tabId || 0) === Number(tab?.id || 0)) {
      context.keepRunningAfterDisconnect = true;
    }
  }

  async function navigate(args = {}, context = {}) {
    const url = String(args.url || "").trim();
    if (!url) {
      throw new Error(t("browser.urlRequired"));
    }

    const tab = await getActiveTab();
    const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await prepareTabForNavigation(tab);
    markDetachedNavigation(tab, context);
    await PLATFORM.tabs.update(tab.id, { url: targetUrl });
    return { tabId: tab.id, url: targetUrl };
  }

  async function newTab(args = {}) {
    assertExtensionApi("tabs.create", PLATFORM.tabs?.create);
    const rawUrl = String(args.url || "").trim();
    const createProperties = {
      active: args.active !== false
    };

    if (rawUrl) {
      createProperties.url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    }

    const tab = await PLATFORM.tabs.create(createProperties);
    return {
      id: tab.id,
      title: tab.title || "",
      url: tab.url || createProperties.url || "",
      active: Boolean(tab.active),
      windowId: tab.windowId
    };
  }

  async function go(args = {}, context = {}) {
    const tab = await getActiveTab();
    const direction = String(args.direction || "back").toLowerCase();
    if (direction === "forward") {
      await prepareTabForNavigation(tab);
      markDetachedNavigation(tab, context);
      await PLATFORM.tabs.goForward(tab.id);
      return { tabId: tab.id, direction: "forward" };
    }
    await prepareTabForNavigation(tab);
    markDetachedNavigation(tab, context);
    await PLATFORM.tabs.goBack(tab.id);
    return { tabId: tab.id, direction: "back" };
  }

  async function reload(args = {}, context = {}) {
    const tab = await getActiveTab();
    await prepareTabForNavigation(tab);
    markDetachedNavigation(tab, context);
    await PLATFORM.tabs.reload(tab.id);
    return { tabId: tab.id };
  }

  async function snapshot(args = {}) {
    const tab = await getActiveTab();
    const requestedMaxItems = Number(args.maxItems);
    const maxItems = Math.min(
      Number.isFinite(requestedMaxItems) && requestedMaxItems > 0 ? requestedMaxItems : MAX_SNAPSHOT_ITEMS,
      MAX_SNAPSHOT_ITEMS
    );
    const result = await sendToTab(tab, {
      type: "dogeclawBrowserAction",
      action: "snapshot",
      snapshotFormat: args.snapshotFormat || args.format || "compact",
      scope: args.scope || args.snapshotScope || "viewport",
      maxItems,
      maxTextChars: args.maxTextChars,
      includeUnchanged: args.includeUnchanged === true
    });
    return {
      tab: await currentTab(),
      ...result
    };
  }

  async function setCaptureMode(tab, hidden) {
    try {
      await PLATFORM.tabs.sendMessage(tab.id, {
        type: "dogeclawCaptureMode",
        hidden: Boolean(hidden)
      });
    } catch {}
  }

  async function showScreenshotInChat(tab, artifact) {
    try {
      const response = await PLATFORM.tabs.sendMessage(tab.id, {
        type: "dogeclawToolArtifact",
        artifact
      });
      return Boolean(response?.ok);
    } catch {
      return false;
    }
  }

  async function screenshot(args = {}) {
    assertExtensionApi("tabs.captureVisibleTab", PLATFORM.tabs?.captureVisibleTab);

    let tab = await getTargetTab(args);
    if (!tab?.id || !tab.windowId) {
      throw new Error(t("browser.noCapturableTab"));
    }

    tab = await activateTab(tab);
    if (args.waitForLoad !== false) {
      tab = await waitForTabComplete(tab.id);
    }
    const pageUrl = tab.url || tab.pendingUrl || "";
    if (!/^https?:\/\//i.test(pageUrl)) {
      throw new Error(t("browser.cannotCapturePage", { url: pageUrl || t("common.unknownUrl") }));
    }

    const format = String(args.format || "png").toLowerCase() === "jpeg" ? "jpeg" : "png";
    const captureOptions = { format };
    if (format === "jpeg") {
      const quality = Math.min(100, Math.max(1, Number(args.quality) || SCREENSHOT_JPEG_QUALITY));
      captureOptions.quality = quality;
    }

    if (args.includeDogeclawUi !== true) {
      await setCaptureMode(tab, true);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    let dataUrl = "";
    try {
      dataUrl = await withTimeout(PLATFORM.tabs.captureVisibleTab(tab.windowId, captureOptions));
    } finally {
      if (args.includeDogeclawUi !== true) {
        await setCaptureMode(tab, false);
      }
    }

    const artifact = {
      type: "image",
      title: args.title || t("browser.screenshotTitle"),
      dataUrl,
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      url: pageUrl,
      tabId: tab.id,
      capturedAt: new Date().toISOString()
    };
    const artifactId = storeArtifact(artifact, args.artifactScope || "");
    const displayedInChat = args.showInChat === true ? await showScreenshotInChat(tab, artifact) : false;
    const includeDataUrl = args.includeDataUrl === true && dataUrl.length <= SCREENSHOT_DATA_URL_LIMIT;

    return {
      action: "screenshot",
      captured: true,
      artifactId,
      displayedInChat,
      tab: {
        id: tab.id,
        title: tab.title || "",
        url: pageUrl,
        active: Boolean(tab.active),
        windowId: tab.windowId
      },
      format,
      mimeType: artifact.mimeType,
      dataUrlLength: dataUrl.length,
      dataUrlIncluded: includeDataUrl,
      ...(includeDataUrl ? { dataUrl } : {}),
      ...(args.includeDataUrl === true && !includeDataUrl
        ? { dataUrlOmittedReason: t("browser.dataUrlTooLarge") }
        : {})
    };
  }

  async function click(args = {}) {
    const tab = await getActiveTab();
    return sendToTab(tab, {
      type: "dogeclawBrowserAction",
      action: "click",
      ref: args.ref || "",
      selector: args.selector || "",
      text: args.text || ""
    });
  }

  async function typeText(args = {}) {
    const tab = await getActiveTab();
    return sendToTab(tab, {
      type: "dogeclawBrowserAction",
      action: "type",
      ref: args.ref || "",
      selector: args.selector || "",
      text: String(args.text || ""),
      clear: args.clear !== false,
      submit: Boolean(args.submit)
    });
  }

  async function scroll(args = {}) {
    const tab = await getActiveTab();
    const x = Number(args.x);
    const y = Number(args.y);
    return sendToTab(tab, {
      type: "dogeclawBrowserAction",
      action: "scroll",
      ref: args.ref || "",
      selector: args.selector || "",
      text: args.text || "",
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 600
    });
  }

  async function execute(args = {}, context = {}) {
    const action = String(args.action || "").trim();
    if (action === "list_tabs") return listTabs();
    if (action === "current_tab") return currentTab();
    if (action === "new_tab") return newTab(args);
    if (action === "navigate") return navigate(args, context);
    if (action === "back" || action === "forward") return go({ direction: action }, context);
    if (action === "reload") return reload(args, context);
    if (action === "snapshot") return snapshot(args);
    if (action === "screenshot") return screenshot(args);
    if (action === "click") return click(args);
    if (action === "type") return typeText(args);
    if (action === "scroll") return scroll(args);
    throw new Error(t("browser.unknownAction", { action: action || t("common.empty") }));
  }

  globalThis.DogeclawBrowser = {
    execute,
    drainArtifacts
  };
})();
