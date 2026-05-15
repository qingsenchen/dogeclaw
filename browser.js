(function () {
  const CONFIG = globalThis.OnecaiConfig || {};
  const BROWSER_CONFIG = CONFIG.browser || {};
  const BROWSER_ACTION_TIMEOUT_MS = BROWSER_CONFIG.actionTimeoutMs || 10000;
  const MAX_SNAPSHOT_ITEMS = BROWSER_CONFIG.maxSnapshotItems || 80;
  const SCREENSHOT_DATA_URL_LIMIT = BROWSER_CONFIG.screenshotDataUrlLimit || 1200000;
  const SCREENSHOT_JPEG_QUALITY = BROWSER_CONFIG.screenshotJpegQuality || 90;
  const MAX_ARTIFACTS = BROWSER_CONFIG.maxArtifacts || 20;
  const CONTENT_SCRIPT_FILES = CONFIG.content?.scriptFiles || ["config.js", "pet.js", "ui.js", "content.js"];
  const browserArtifacts = [];

  function assertChromeApi(name, value) {
    if (!value) {
      throw new Error(`Chrome API unavailable: ${name}`);
    }
  }

  function withTimeout(promise, timeoutMs = BROWSER_ACTION_TIMEOUT_MS) {
    let timerId = 0;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error("browser action timed out")), timeoutMs);
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
    assertChromeApi("chrome.tabs.query", chrome.tabs?.query);
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    if (!tabs.length) {
      tabs = await chrome.tabs.query({ active: true });
    }
    const tab = tabs.find((item) => /^https?:\/\//i.test(item.url || item.pendingUrl || "")) || tabs[0];
    if (!tab?.id) {
      throw new Error("No active tab found");
    }
    return tab;
  }

  async function getTargetTab(args = {}) {
    const tabId = Number(args.tabId || args.id || 0);
    if (Number.isInteger(tabId) && tabId > 0) {
      assertChromeApi("chrome.tabs.get", chrome.tabs?.get);
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.id) {
        throw new Error(`Tab not found: ${tabId}`);
      }
      return tab;
    }
    return getActiveTab();
  }

  async function activateTab(tab) {
    assertChromeApi("chrome.tabs.update", chrome.tabs?.update);
    if (!tab?.id) {
      throw new Error("tab id is required");
    }
    if (!tab.active) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    if (tab.windowId && chrome.windows?.update) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => null);
    }
    return chrome.tabs.get(tab.id);
  }

  async function waitForTabComplete(tabId, timeoutMs = BROWSER_ACTION_TIMEOUT_MS) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") {
        return tab;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return chrome.tabs.get(tabId);
  }

  function canAccessTabUrl(url) {
    return Boolean(url && /^https?:\/\//i.test(url));
  }

  async function ensureTabScript(tab) {
    if (!tab?.id) {
      throw new Error("tab id is required");
    }
    if (!canAccessTabUrl(tab.url)) {
      throw new Error(`Cannot control this page: ${tab.url || "unknown url"}`);
    }

    try {
      const existing = await chrome.tabs.sendMessage(tab.id, { type: "onecaiBrowserPing" });
      if (existing?.ok) {
        return true;
      }
    } catch {}

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPT_FILES
    });
    return true;
  }

  async function sendToTab(tab, payload) {
    await ensureTabScript(tab);
    const result = await withTimeout(chrome.tabs.sendMessage(tab.id, payload));
    if (result?.ok === false) {
      throw new Error(result.error || "browser action failed");
    }
    return result;
  }

  async function listTabs() {
    assertChromeApi("chrome.tabs.query", chrome.tabs?.query);
    const tabs = await chrome.tabs.query({});
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

  async function navigate(args = {}) {
    const url = String(args.url || "").trim();
    if (!url) {
      throw new Error("url is required");
    }

    const tab = await getActiveTab();
    const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await chrome.tabs.update(tab.id, { url: targetUrl });
    return { tabId: tab.id, url: targetUrl };
  }

  async function newTab(args = {}) {
    assertChromeApi("chrome.tabs.create", chrome.tabs?.create);
    const rawUrl = String(args.url || "").trim();
    const createProperties = {
      active: args.active !== false
    };

    if (rawUrl) {
      createProperties.url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    }

    const tab = await chrome.tabs.create(createProperties);
    return {
      id: tab.id,
      title: tab.title || "",
      url: tab.url || createProperties.url || "",
      active: Boolean(tab.active),
      windowId: tab.windowId
    };
  }

  async function go(args = {}) {
    const tab = await getActiveTab();
    const direction = String(args.direction || "back").toLowerCase();
    if (direction === "forward") {
      await chrome.tabs.goForward(tab.id);
      return { tabId: tab.id, direction: "forward" };
    }
    await chrome.tabs.goBack(tab.id);
    return { tabId: tab.id, direction: "back" };
  }

  async function reload() {
    const tab = await getActiveTab();
    await chrome.tabs.reload(tab.id);
    return { tabId: tab.id };
  }

  async function snapshot(args = {}) {
    const tab = await getActiveTab();
    const result = await sendToTab(tab, {
      type: "onecaiBrowserAction",
      action: "snapshot",
      maxItems: Math.min(Number(args.maxItems) || MAX_SNAPSHOT_ITEMS, MAX_SNAPSHOT_ITEMS)
    });
    return {
      tab: await currentTab(),
      ...result
    };
  }

  async function setCaptureMode(tab, hidden) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "onecaiCaptureMode",
        hidden: Boolean(hidden)
      });
    } catch {}
  }

  async function showScreenshotInChat(tab, artifact) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "onecaiToolArtifact",
        artifact
      });
      return Boolean(response?.ok);
    } catch {
      return false;
    }
  }

  async function screenshot(args = {}) {
    assertChromeApi("chrome.tabs.captureVisibleTab", chrome.tabs?.captureVisibleTab);

    let tab = await getTargetTab(args);
    if (!tab?.id || !tab.windowId) {
      throw new Error("No capturable tab found");
    }

    tab = await activateTab(tab);
    if (args.waitForLoad !== false) {
      tab = await waitForTabComplete(tab.id);
    }
    const pageUrl = tab.url || tab.pendingUrl || "";
    if (!/^https?:\/\//i.test(pageUrl)) {
      throw new Error(`Cannot capture this page: ${pageUrl || "unknown url"}`);
    }

    const format = String(args.format || "png").toLowerCase() === "jpeg" ? "jpeg" : "png";
    const captureOptions = { format };
    if (format === "jpeg") {
      const quality = Math.min(100, Math.max(1, Number(args.quality) || SCREENSHOT_JPEG_QUALITY));
      captureOptions.quality = quality;
    }

    if (args.includeOnecaiUi !== true) {
      await setCaptureMode(tab, true);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    let dataUrl = "";
    try {
      dataUrl = await withTimeout(chrome.tabs.captureVisibleTab(tab.windowId, captureOptions));
    } finally {
      if (args.includeOnecaiUi !== true) {
        await setCaptureMode(tab, false);
      }
    }

    const artifact = {
      type: "image",
      title: args.title || "页面截图",
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
        ? { dataUrlOmittedReason: "screenshot data URL is too large for the configured limit" }
        : {})
    };
  }

  async function click(args = {}) {
    const tab = await getActiveTab();
    return sendToTab(tab, {
      type: "onecaiBrowserAction",
      action: "click",
      ref: args.ref || "",
      selector: args.selector || "",
      text: args.text || ""
    });
  }

  async function typeText(args = {}) {
    const tab = await getActiveTab();
    return sendToTab(tab, {
      type: "onecaiBrowserAction",
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
    return sendToTab(tab, {
      type: "onecaiBrowserAction",
      action: "scroll",
      x: Number(args.x) || 0,
      y: Number(args.y) || 600
    });
  }

  async function execute(args = {}) {
    const action = String(args.action || "").trim();
    if (action === "list_tabs") return listTabs();
    if (action === "current_tab") return currentTab();
    if (action === "new_tab") return newTab(args);
    if (action === "navigate") return navigate(args);
    if (action === "back" || action === "forward") return go({ direction: action });
    if (action === "reload") return reload();
    if (action === "snapshot") return snapshot(args);
    if (action === "screenshot") return screenshot(args);
    if (action === "click") return click(args);
    if (action === "type") return typeText(args);
    if (action === "scroll") return scroll(args);
    throw new Error(`Unknown browser action: ${action || "(empty)"}`);
  }

  globalThis.OnecaiBrowser = {
    execute,
    drainArtifacts
  };
})();
