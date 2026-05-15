(function () {
  if (window.top !== window.self) {
    return;
  }

  const CONTENT_CONFIG = globalThis.OnecaiConfig?.content || {};
  const ROOT_ID = CONTENT_CONFIG.rootId || "onecai-root";
  const STYLE_ID = CONTENT_CONFIG.styleId || "onecai-style";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAX_HOVER_MESSAGES = CONTENT_CONFIG.maxHoverMessages || 6;
  const MOUNT_WATCHDOG_INTERVAL = CONTENT_CONFIG.mountWatchdogIntervalMs || 1000;
  const POSITION_KEY = `${CONTENT_CONFIG.positionKeyPrefix || "onecai-position:"}${location.host}`;
  const LLM_DEFAULT_CONFIG = globalThis.OnecaiConfig?.llm?.defaultConfig || {};
  const FLOATING_BUTTON_COMPACT_WIDTH = 132;
  const FLOATING_BUTTON_EDGE_PADDING = 8;
  const DRAG_START_THRESHOLD = 4;

  [ROOT_ID, ...(CONTENT_CONFIG.legacyRootIds || [])].forEach((id) => {
    const existingRoot = document.getElementById(id);
    if (existingRoot) {
      existingRoot.remove();
    }
  });

  injectStyles();

	  const state = {
	    floatingEnabled: true,
	    syncQueued: false,
	    drag: {
	      active: false,
	      moved: false,
	      pointerId: null,
	      startX: 0,
	      startY: 0,
	      startLeft: 0,
	      startTop: 0
	    },
	    hoverMessages: [],
	    chatVisible: false,
	    chatHideTimer: 0,
	    chatCollapseTimer: 0,
	    chatHoldExpanded: false,
	    llmConfig: {
      checked: false,
      providerConfigured: false,
      visible: false,
      saving: false,
      error: "",
      values: {
        apiBase: "",
        apiKey: "",
        model: ""
      }
    },
    channelConfig: {
      visible: false,
      channel: "wechat",
      loading: false,
      error: "",
      autoCheckTimer: 0,
      autoCheckUntil: 0,
      login: null,
      config: null
    },
    thinkingActive: false,
    thinkingDisplayText: "",
    remoteDisplayText: "",
    remoteDisplayResetTimer: 0
  };
  state.pageConversationId = getPageConversationId();
  const browserRefs = new Map();
  let browserRefCounter = 0;

  function getPageConversationId() {
    try {
      const url = new URL(location.href);
      url.hash = "";
      return `page:${url.href}`;
    } catch {
      return `page:${location.href || "unknown"}`;
    }
  }

  function syncPageConversationId() {
    const nextId = getPageConversationId();
    if (state.pageConversationId === nextId) {
      return false;
    }

    state.pageConversationId = nextId;
    return true;
  }

  function isElementNode(node) {
    return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
  }

  function isHtmlElement(node) {
    return isElementNode(node) && typeof node.tagName === "string";
  }

  function getBrowserElementRole(element) {
    const explicitRole = element.getAttribute("role");
    if (explicitRole) {
      return explicitRole;
    }

    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "input") return element.type || "input";
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    if (element.isContentEditable) return "editable";
    return tag;
  }

  function getBrowserElementText(element) {
    const ariaLabel = element.getAttribute("aria-label") || "";
    const label = element.getAttribute("title") || element.getAttribute("alt") || "";
    const placeholder = element.getAttribute("placeholder") || "";
    const value = ["button", "submit", "reset"].includes(element.type) ? element.value || "" : "";
    const text = element.innerText || element.textContent || "";
    return [ariaLabel, label, placeholder, value, text]
      .map((item) => String(item || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)[0] || "";
  }

  function getBrowserRef(element) {
    const existing = element.getAttribute("data-onecai-browser-ref");
    if (existing) {
      browserRefs.set(existing, element);
      return existing;
    }

    const ref = `b${++browserRefCounter}`;
    element.setAttribute("data-onecai-browser-ref", ref);
    browserRefs.set(ref, element);
    return ref;
  }

  function isBrowserElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0
    );
  }

  function findBrowserElement({ ref, selector, text } = {}) {
    if (ref && browserRefs.has(ref)) {
      const element = browserRefs.get(ref);
      if (element?.isConnected) {
        return element;
      }
    }

    if (selector) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    const queryText = String(text || "").trim().toLowerCase();
    if (queryText) {
      const candidates = collectBrowserInteractives(120);
      const item = candidates.find((candidate) => candidate.text.toLowerCase().includes(queryText));
      if (item?.ref) {
        return browserRefs.get(item.ref) || null;
      }
    }

    return null;
  }

  function collectBrowserInteractives(maxItems = 80) {
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => isHtmlElement(element) && isBrowserElementVisible(element))
      .slice(0, maxItems)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          ref: getBrowserRef(element),
          role: getBrowserElementRole(element),
          tag: element.tagName.toLowerCase(),
          text: getBrowserElementText(element).slice(0, 180),
          href: element.href || "",
          value: element.value && element.type !== "password" ? String(element.value).slice(0, 120) : "",
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      });
  }

  function getBrowserPageText() {
    const text = document.body?.innerText || "";
    return text.replace(/\s+/g, " ").trim().slice(0, 3000);
  }

  function dispatchBrowserInput(element, text, { clear = true, submit = false } = {}) {
    element.focus();

    if (element.isContentEditable) {
      if (clear) {
        element.textContent = "";
      }
      element.textContent = `${clear ? "" : element.textContent || ""}${text}`;
    } else if ("value" in element) {
      if (clear) {
        element.value = "";
      }
      element.value = `${clear ? "" : element.value || ""}${text}`;
    } else {
      throw new Error("Target is not editable");
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    if (submit) {
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
      element.form?.requestSubmit?.();
    }
  }

  function handleBrowserAction(message) {
    const action = String(message?.action || "");
    if (action === "snapshot") {
      return {
        ok: true,
        title: document.title || "",
        url: location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY)
        },
        text: getBrowserPageText(),
        elements: collectBrowserInteractives(message.maxItems || 80)
      };
    }

    if (action === "click") {
      const element = findBrowserElement(message);
      if (!element) {
        throw new Error("Target element not found");
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return { ok: true, action: "click", ref: getBrowserRef(element), text: getBrowserElementText(element) };
    }

    if (action === "type") {
      const element = findBrowserElement(message);
      if (!element) {
        throw new Error("Target element not found");
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      dispatchBrowserInput(element, String(message.text || ""), {
        clear: message.clear !== false,
        submit: Boolean(message.submit)
      });
      return { ok: true, action: "type", ref: getBrowserRef(element) };
    }

    if (action === "scroll") {
      window.scrollBy({ left: Number(message.x) || 0, top: Number(message.y) || 0, behavior: "smooth" });
      return {
        ok: true,
        action: "scroll",
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
      };
    }

    throw new Error(`Unknown browser action: ${action || "(empty)"}`);
  }

  function isRuntimeContextValid() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  async function safeSendRuntimeMessage(payload) {
    if (!isRuntimeContextValid()) {
      return null;
    }

    try {
      return await chrome.runtime.sendMessage(payload);
    } catch {
      return null;
    }
  }

  async function reportError(context, error, details = {}) {
    return false;
  }

  let elements;
  elements = createUI();
  const petController = window.OnecaiPet.createController({
    elements,
    state,
    scheduleSync
  });
  document.addEventListener("mousemove", (event) => {
    petController.updateEyes(event.clientX, event.clientY);
  });
  if (isRuntimeContextValid()) {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === "setFloatingButtonVisible") {
          setFloatingButtonVisible(message.enabled);
          sendResponse?.({ ok: true, enabled: state.floatingEnabled });
          return false;
        }

        if (message?.type === "getFloatingButtonVisible") {
          sendResponse?.({ ok: true, enabled: state.floatingEnabled });
          return false;
        }

        if (message?.type === "onecaiBrowserPing") {
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "onecaiCaptureMode") {
          if (elements?.root) {
            elements.root.style.visibility = message.hidden ? "hidden" : "";
          }
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "onecaiToolArtifact" && message.artifact?.type === "image") {
          const dataUrl = String(message.artifact.dataUrl || "");
          if (dataUrl.startsWith("data:image/")) {
            const title = String(message.artifact.title || "页面截图").replace(/[\]\n\r]/g, " ").trim() || "页面截图";
            addHoverMessage(`![${title}](${dataUrl})`, "left", { includeInHistory: false });
            setChatVisible(true);
            sendResponse?.({ ok: true });
            return false;
          }
          sendResponse?.({ ok: false, error: "invalid image artifact" });
          return false;
        }

        if (message?.type === "onecaiBrowserAction") {
          try {
            sendResponse?.(handleBrowserAction(message));
          } catch (error) {
            sendResponse?.({ ok: false, error: error?.message || String(error) });
          }
          return false;
        }

        if (message?.type === "sendSelectionToOnecai") {
          sendResponse?.({ ok: fillTextToOnecaiInput(message.text) });
          return false;
        }

        if (message?.type === "openLlmProviderConfig") {
          showLlmProviderConfigForm()
            .then((opened) => sendResponse?.({ ok: true, opened }))
            .catch((error) => sendResponse?.({ ok: false, error: error?.message || String(error) }));
          return true;
        }

        if (message?.type === "openChannelConfig") {
          openChannelConfig(message.channel || "wechat")
            .then((opened) => sendResponse?.({ ok: true, opened }))
            .catch((error) => sendResponse?.({ ok: false, error: error?.message || String(error) }));
          return true;
        }

        if (message?.type === "channelConversationMessages" && Array.isArray(message.messages)) {
          // Channel sessions are maintained in the background and must not be merged
          // into this page's local chat session.
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "channelConfigStatus") {
          if (message.channel === state.channelConfig.channel && message.status?.status === "confirmed") {
            state.channelConfig.login = message.status;
            refreshChannelConfig(message.channel).catch(() => null);
            stopChannelAutoCheck();
            closeConfigPanel("channel");
            addHoverMessage("微信频道已配置完成。", "left");
            renderHoverMessages();
            scheduleSync();
          }
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type !== "remotePetCommands" || !Array.isArray(message.commands)) {
          return false;
        }

        ensureUiMounted();
        let handled = false;
        message.commands.forEach((command) => {
          handled = petController.handleRemoteCommand(command) || handled;
        });
        if (handled) {
          scheduleSync();
        }
        sendResponse?.({ ok: true, handled });
        return false;
      });
    } catch {}
  }

  function ensureUiMounted() {
    if (!state.floatingEnabled) {
      return;
    }

    injectStyles();

    const mountTarget = document.body || document.documentElement;
    if (mountTarget && !elements.root.isConnected) {
      mountTarget.append(elements.root);
      applySavedPosition();
    }
  }

  function setFloatingButtonVisible(enabled) {
    state.floatingEnabled = enabled !== false;

    if (!state.floatingEnabled) {
      setChatVisible(false);
      elements.root.hidden = true;
      return;
    }

    elements.root.hidden = false;
    ensureUiMounted();
    scheduleSync();
  }

  async function loadFloatingButtonVisibility() {
    const response = await safeSendRuntimeMessage({
      type: "getFloatingButtonEnabled",
      url: location.href
    });

    setFloatingButtonVisible(response?.ok ? response.enabled : true);
  }

  function syncUI() {
    elements.buttonStatus.textContent = "";
    refreshButtonStatusMarquee();
    elements.button.classList.toggle("is-open", false);
    elements.button.classList.toggle("is-dragging", state.drag.active && state.drag.moved);
    elements.button.classList.toggle("is-thinking", state.thinkingActive);
    elements.button.classList.toggle("is-chat-holding", state.chatHoldExpanded);
    elements.button.classList.toggle("has-status-text", false);
    elements.button.classList.toggle("has-remote-text", Boolean(state.remoteDisplayText));
    if (!elements.hoverMessages.hidden) {
      updateHoverMessagesBounds();
    }
    petController.sync({
      count: 0,
      isScanning: false,
      isOpen: false,
      isDragging: state.drag.active
    });
  }

  function refreshButtonStatusMarquee() {
    if (!elements?.buttonStatus || !elements?.buttonStatusViewport) {
      return;
    }

    const textEl = elements.buttonStatus;
    const viewportEl = elements.buttonStatusViewport;
    textEl.classList.remove("is-marquee");
    textEl.style.removeProperty("--pig-marquee-start");
    textEl.style.removeProperty("--pig-marquee-end");
    textEl.style.removeProperty("--pig-marquee-duration");
    textEl.style.transform = "translateX(0)";

    window.requestAnimationFrame(() => {
      const hasDisplayText = Boolean(state.thinkingDisplayText || state.remoteDisplayText);
      if (!hasDisplayText) {
        return;
      }

      const viewportWidth = viewportEl.clientWidth || 0;
      const textWidth = textEl.scrollWidth || 0;
      if (!viewportWidth || textWidth <= viewportWidth + 4) {
        return;
      }

      const distance = Math.max(0, textWidth - viewportWidth + 24);
      const durationSeconds = Math.max(4, distance / 18);
      textEl.style.setProperty("--pig-marquee-start", "0px");
      textEl.style.setProperty("--pig-marquee-end", `${distance}px`);
      textEl.style.setProperty("--pig-marquee-duration", `${durationSeconds}s`);
      textEl.classList.add("is-marquee");

      if (state.thinkingActive) {
        return;
      }

      if (state.remoteDisplayResetTimer) {
        window.clearTimeout(state.remoteDisplayResetTimer);
      }
      state.remoteDisplayResetTimer = window.setTimeout(() => {
        state.remoteDisplayResetTimer = 0;
        if (state.remoteDisplayText) {
          state.remoteDisplayText = "";
          scheduleSync();
        }
      }, Math.ceil(durationSeconds * 2000));
    });
  }

  function setThinkingStatus(text) {
    state.thinkingActive = Boolean(text);
    state.thinkingDisplayText = "";
    if (state.thinkingActive && state.remoteDisplayResetTimer) {
      window.clearTimeout(state.remoteDisplayResetTimer);
      state.remoteDisplayResetTimer = 0;
    }
    scheduleSync();
  }

  function getToolStepText(step) {
    const calls = Array.isArray(step?.calls) ? step.calls : [];
    const firstCall = calls[0] || {};
    const toolName = firstCall.name || "工具";
    const args = firstCall.arguments || {};

    if (toolName === "get_weather") {
      return `正在查询天气：${args.location || "目标地点"}...`;
    }

    if (toolName === "browser_control") {
      const action = args.action ? ` ${args.action}` : "";
      return `正在控制浏览器${action}...`;
    }

    if (toolName === "system_config") {
      const action = args.action ? ` ${args.action}` : "";
      return `正在更新系统配置${action}...`;
    }

    return `正在执行 ${toolName}...`;
  }

  function handleAgentStep(step) {
    if (!step?.type) {
      return;
    }

    if (step.type === "llm_start") {
      setThinkingStatus(step.iteration > 0 ? "工具结果已返回，正在继续思考..." : "正在理解你的消息...");
      return;
    }

    if (step.type === "tool_start") {
      setThinkingStatus(getToolStepText(step));
      return;
    }

    if (step.type === "tool_done") {
      setThinkingStatus("工具执行完成，正在整理回复...");
      return;
    }

    if (step.type === "llm_done") {
      setThinkingStatus("");
    }
  }

  function scheduleSync() {
    if (state.syncQueued) {
      return;
    }

    state.syncQueued = true;
    window.requestAnimationFrame(() => {
      state.syncQueued = false;
      ensureUiMounted();
      syncUI();
    });
  }

  async function handlePetButtonClick(event) {
    if (state.drag.moved) {
      state.drag.moved = false;
      return;
    }

    petController.handlePrimaryAction(event?.clientX, event?.clientY);

    if (await showLlmConfigIfNeeded()) {
      return;
    }

    state.chatVisible = true;
    state.chatHoldExpanded = true;
    updateButtonExpansionSide();
    scheduleSync();
    window.requestAnimationFrame(() => {
      elements.buttonHoverInput?.focus?.();
    });
  }

  function applySavedPosition() {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) {
        return;
      }

      const pos = JSON.parse(raw);
      if (typeof pos.left === "number" && typeof pos.top === "number") {
        const next = clampPosition(pos.left, pos.top);
        elements.root.style.left = `${next.left}px`;
        elements.root.style.top = `${next.top}px`;
        elements.root.style.right = "auto";
        elements.root.style.bottom = "auto";
        persistPosition(next.left, next.top);
      }
    } catch {}
  }

  function persistPosition(left, top) {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ left, top }));
    } catch {}
  }

  function getButtonVisualRect() {
    if (!elements?.button || !elements?.root) {
      return { left: 0, top: 0 };
    }

    const rect = elements.button.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top
    };
  }

  function getCompactAnchorLeft() {
    if (!elements?.button || !elements?.root) {
      return 0;
    }

    const rootLeft = Number.parseFloat(elements.root.style.left);
    if (Number.isFinite(rootLeft)) {
      return rootLeft;
    }

    const buttonRect = elements.button.getBoundingClientRect();
    if (elements.button.classList.contains("is-expand-left")) {
      return buttonRect.right - FLOATING_BUTTON_COMPACT_WIDTH;
    }

    return buttonRect.left;
  }

  function clampPosition(left, top) {
    const rootRect = elements.root.getBoundingClientRect();
    const width = state.drag.active ? FLOATING_BUTTON_COMPACT_WIDTH : rootRect.width;
    const maxLeft = Math.max(FLOATING_BUTTON_EDGE_PADDING, window.innerWidth - width - FLOATING_BUTTON_EDGE_PADDING);
    const maxTop = Math.max(FLOATING_BUTTON_EDGE_PADDING, window.innerHeight - rootRect.height - FLOATING_BUTTON_EDGE_PADDING);

    return {
      left: Math.min(Math.max(FLOATING_BUTTON_EDGE_PADDING, left), maxLeft),
      top: Math.min(Math.max(FLOATING_BUTTON_EDGE_PADDING, top), maxTop)
    };
  }

  function updateButtonExpansionSide() {
    if (!elements?.button || !elements?.root) {
      return;
    }

    const edgePadding = FLOATING_BUTTON_EDGE_PADDING;
    const compactWidth = FLOATING_BUTTON_COMPACT_WIDTH;
    const desiredWidth = Math.min(280, Math.max(compactWidth, window.innerWidth - edgePadding * 2));
    const anchorLeft = getCompactAnchorLeft();
    const compactRight = anchorLeft + compactWidth;
    const rightSpace = Math.max(0, window.innerWidth - edgePadding - compactRight);
    const leftSpace = Math.max(0, anchorLeft - edgePadding);
    const desiredGrowth = Math.max(0, desiredWidth - compactWidth);
    const shouldExpandLeft = rightSpace < desiredGrowth && leftSpace > rightSpace;
    const availableGrowth = shouldExpandLeft ? leftSpace : rightSpace;
    const expandedWidth = compactWidth + Math.min(desiredGrowth, availableGrowth);
    const offset = shouldExpandLeft ? compactWidth - expandedWidth : 0;

    elements.button.classList.toggle("is-expand-left", shouldExpandLeft);
    elements.button.style.setProperty("--pig-expanded-width", `${expandedWidth}px`);
    elements.button.style.setProperty("--pig-expand-offset", `${offset}px`);
  }

  function updateHoverMessagesBounds() {
    if (!elements?.hoverMessages || !elements?.button) {
      return 0;
    }

    const buttonRect = elements.button.getBoundingClientRect();
    elements.hoverMessages.style.removeProperty("--pig-chat-max-height");
    elements.hoverMessages.classList.toggle("is-compact-vertical", false);
    return Math.max(0, Math.floor(buttonRect.top));
  }

  function setChatVisible(visible) {
    syncPageConversationId();
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }

    if (visible) {
      state.chatHoldExpanded = false;
      if (state.chatCollapseTimer) {
        window.clearTimeout(state.chatCollapseTimer);
        state.chatCollapseTimer = 0;
      }
    }
    state.chatVisible = Boolean(visible);
    scheduleSync();
    renderHoverMessages();
  }

  function collapseTransientChat() {
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }

    if (!state.thinkingActive && !state.hoverMessages.some((message) => message.pending)) {
      state.chatVisible = false;
      state.chatHoldExpanded = false;
    }

    elements.buttonHoverInput?.blur?.();
    renderHoverMessages();
    scheduleSync();
  }

  function hideChatIfCollapsed(event) {
    const nextTarget = event?.relatedTarget;
    if (nextTarget && elements?.button?.contains?.(nextTarget)) {
      return;
    }

    if (state.thinkingActive || state.hoverMessages.some((message) => message.pending)) {
      setChatVisible(true);
      return;
    }

    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
    }

    state.chatHoldExpanded = true;
    scheduleSync();
    state.chatHideTimer = window.setTimeout(() => {
      state.chatHideTimer = 0;
      if (!state.thinkingActive && !state.hoverMessages.some((message) => message.pending)) {
        state.chatHoldExpanded = false;
        setChatVisible(false);
      }
    }, 6000);
  }

  function setActiveConfigPanel(panel) {
    const activePanel = panel ? String(panel) : "";
    if (activePanel !== "channel") {
      stopChannelAutoCheck();
    }
    state.llmConfig.visible = activePanel === "llm";
    state.channelConfig.visible = activePanel === "channel";
  }

  function openConfigPanel(panel) {
    setActiveConfigPanel(panel);
    state.chatVisible = true;
    state.chatHoldExpanded = true;
    updateButtonExpansionSide();
  }

  function closeConfigPanel(panel) {
    const activePanel = panel ? String(panel) : "";
    if (!activePanel || activePanel === "llm") {
      state.llmConfig.visible = false;
    }
    if (!activePanel || activePanel === "channel") {
      state.channelConfig.visible = false;
    }
  }

  async function refreshLlmConfigStatus() {
    const response = await safeSendRuntimeMessage({ type: "getLlmConfig" });
    const config = response?.config || {};
    state.llmConfig.checked = true;
    state.llmConfig.providerConfigured = Boolean(
      response?.userConfigured &&
      config.apiBase &&
      config.model &&
      config.apiKey === "configured"
    );
    state.llmConfig.values = {
      apiBase: config.apiBase || LLM_DEFAULT_CONFIG.apiBase || "https://ai.gitee.com/v1",
      apiKey: "",
      model: config.model || LLM_DEFAULT_CONFIG.model || "Qwen3.6-27B"
    };
    return state.llmConfig.providerConfigured;
  }

  async function saveLlmConfig() {
    const apiBase = state.llmConfig.values.apiBase.trim();
    const model = state.llmConfig.values.model.trim();
    const apiKey = state.llmConfig.values.apiKey.trim();
    if (!apiBase || !model) {
      state.llmConfig.error = "请填写 Base URL 和 Model";
      renderHoverMessages();
      return;
    }

    state.llmConfig.saving = true;
    state.llmConfig.error = "";
    renderHoverMessages();

    const config = {
      apiBase,
      model,
      ...(apiKey ? { apiKey } : {})
    };
    const response = await safeSendRuntimeMessage({ type: "setLlmConfig", config });
    state.llmConfig.saving = false;
    if (!response?.ok) {
      state.llmConfig.error = response?.error || "保存失败";
      renderHoverMessages();
      return;
    }

    state.llmConfig.providerConfigured = true;
    closeConfigPanel("llm");
    state.chatVisible = true;
    state.chatHoldExpanded = true;
    addHoverMessage("LLM Provider 已保存，可以开始聊天了。", "left");
    renderHoverMessages();
    scheduleSync();
  }

  async function showLlmConfigIfNeeded() {
    if (!state.llmConfig.checked) {
      try {
        await refreshLlmConfigStatus();
      } catch {
        state.llmConfig.checked = true;
        state.llmConfig.providerConfigured = false;
      }
    }

    if (state.llmConfig.providerConfigured) {
      return false;
    }

    openConfigPanel("llm");
    renderHoverMessages();
    scheduleSync();
    return true;
  }

  async function showLlmProviderConfigForm() {
    try {
      await refreshLlmConfigStatus();
    } catch {
      state.llmConfig.checked = true;
    }

    openConfigPanel("llm");
    setFloatingButtonVisible(true);
    ensureUiMounted();
    renderHoverMessages();
    scheduleSync();
    return true;
  }

  async function refreshChannelConfig(channel = "wechat") {
    const response = await safeSendRuntimeMessage({
      type: "channelConfig",
      action: "get_config",
      channel
    });
    if (!response?.ok) {
      throw new Error(response?.error || "频道配置读取失败");
    }
    state.channelConfig.config = response.result || null;
    return state.channelConfig.config;
  }

  async function refreshChannelLoginState(channel = "wechat") {
    const response = await safeSendRuntimeMessage({
      type: "channelConfig",
      action: "get_login_state",
      channel
    });
    if (response?.ok) {
      state.channelConfig.login = response.result || null;
    }
    return state.channelConfig.login;
  }

  function stopChannelAutoCheck() {
    if (state.channelConfig.autoCheckTimer) {
      window.clearTimeout(state.channelConfig.autoCheckTimer);
      state.channelConfig.autoCheckTimer = 0;
    }
    state.channelConfig.autoCheckUntil = 0;
  }

  function scheduleChannelAutoCheck(channel = "wechat") {
    if (state.channelConfig.autoCheckTimer) {
      window.clearTimeout(state.channelConfig.autoCheckTimer);
    }
    if (!state.channelConfig.autoCheckUntil) {
      state.channelConfig.autoCheckUntil = Date.now() + 5 * 60 * 1000;
    }

    state.channelConfig.autoCheckTimer = window.setTimeout(async () => {
      state.channelConfig.autoCheckTimer = 0;
      if (!state.channelConfig.visible || Date.now() > state.channelConfig.autoCheckUntil) {
        stopChannelAutoCheck();
        return;
      }

      await checkChannelConfig(channel, { auto: true }).catch(() => null);
      if (state.channelConfig.login?.status !== "confirmed" && state.channelConfig.visible) {
        scheduleChannelAutoCheck(channel);
      }
    }, 2200);
  }

  async function startChannelConfig(channel = "wechat") {
    state.channelConfig.loading = true;
    state.channelConfig.error = "";
    renderHoverMessages();
    const response = await safeSendRuntimeMessage({
      type: "channelConfig",
      action: "start_config",
      channel
    });
    state.channelConfig.loading = false;
    if (!response?.ok) {
      state.channelConfig.error = response?.error || "二维码获取失败";
      renderHoverMessages();
      return;
    }
    state.channelConfig.login = response.result || null;
    state.chatVisible = true;
    state.chatHoldExpanded = true;
    renderHoverMessages();
    state.channelConfig.autoCheckUntil = Date.now() + 5 * 60 * 1000;
    scheduleChannelAutoCheck(channel);
  }

  async function checkChannelConfig(channel = "wechat", options = {}) {
    const isAuto = Boolean(options.auto);
    if (!isAuto) {
      state.channelConfig.loading = true;
    }
    state.channelConfig.error = "";
    renderHoverMessages();
    const response = await safeSendRuntimeMessage({
      type: "channelConfig",
      action: "check_config",
      channel
    });
    if (!isAuto) {
      state.channelConfig.loading = false;
    }
    if (!response?.ok) {
      state.channelConfig.error = response?.error || "登录状态检查失败";
      renderHoverMessages();
      return;
    }
    state.channelConfig.login = response.result || null;
    if (state.channelConfig.login?.status === "confirmed") {
      await refreshChannelConfig(channel).catch(() => null);
      addHoverMessage("微信频道已配置完成。", "left");
      closeConfigPanel("channel");
      stopChannelAutoCheck();
    }
    renderHoverMessages();
  }

  async function openChannelConfig(channel = "wechat") {
    openConfigPanel("channel");
    state.channelConfig.channel = channel;
    state.channelConfig.error = "";
    setFloatingButtonVisible(true);
    ensureUiMounted();
    await refreshChannelConfig(channel).catch((error) => {
      state.channelConfig.error = error?.message || String(error);
    });
    await refreshChannelLoginState(channel).catch(() => null);
    if (
      !state.channelConfig.config?.enabled &&
      (!state.channelConfig.login?.qrcode || state.channelConfig.login?.fresh === false || state.channelConfig.login?.status === "expired")
    ) {
      await startChannelConfig(channel);
      return true;
    }
    renderHoverMessages();
    scheduleSync();
    return true;
  }

  function renderHoverMessages() {
    if (!elements?.hoverMessages) {
      return;
    }

    elements.hoverMessages.replaceChildren();
    let componentRow = null;
    if (state.llmConfig.visible) {
      componentRow = window.OnecaiUI.renderLlmConfigForm({
        state,
        onSave: saveLlmConfig
      });
    } else if (state.channelConfig.visible) {
      componentRow = window.OnecaiUI.renderChannelConfigForm({
        state,
        onStart: () => startChannelConfig(state.channelConfig.channel),
        onCheck: () => checkChannelConfig(state.channelConfig.channel),
        onClose: () => {
          closeConfigPanel("channel");
          stopChannelAutoCheck();
          renderHoverMessages();
        }
      });
    }

    const componentAfterIndex = componentRow
      ? state.hoverMessages.reduce((latestIndex, message, index) => (message.side === "right" ? index : latestIndex), -1)
      : -1;
    let componentInserted = false;

    state.hoverMessages.forEach((message, index) => {
      const row = document.createElement("div");
      row.className = `pig-chat-row is-${message.side}${message.pending ? " is-pending" : ""}`;

      row.append(window.OnecaiUI.createChatBubble(message.text));
      elements.hoverMessages.append(row);

      if (componentRow && index === componentAfterIndex) {
        elements.hoverMessages.append(componentRow);
        componentInserted = true;
      }
    });

    if (componentRow && !componentInserted) {
      elements.hoverMessages.append(componentRow);
    }

    const visible =
      state.llmConfig.visible ||
      state.channelConfig.visible ||
      ((state.chatVisible || state.hoverMessages.some((message) => message.pending)) && state.hoverMessages.length > 0);
    if (visible) {
      if (state.chatCollapseTimer) {
        window.clearTimeout(state.chatCollapseTimer);
        state.chatCollapseTimer = 0;
      }
      elements.hoverMessages.hidden = false;
      elements.hoverMessages.classList.remove("is-collapsing");
      elements.hoverMessages.classList.add("is-visible");
      updateHoverMessagesBounds();
      window.requestAnimationFrame(pruneOverflowingHoverMessages);
      return;
    }

    elements.hoverMessages.classList.remove("is-visible");
    elements.hoverMessages.classList.add("is-collapsing");
    if (state.chatCollapseTimer) {
      window.clearTimeout(state.chatCollapseTimer);
    }
    state.chatCollapseTimer = window.setTimeout(() => {
      state.chatCollapseTimer = 0;
      if (
        !state.llmConfig.visible &&
        !state.channelConfig.visible &&
        !state.chatVisible &&
        !state.hoverMessages.some((message) => message.pending)
      ) {
        elements.hoverMessages.hidden = true;
        elements.hoverMessages.classList.remove("is-collapsing");
      }
    }, 180);
  }

  function trimHoverMessagesToLimit() {
    if (state.hoverMessages.length <= MAX_HOVER_MESSAGES) {
      return;
    }

    state.hoverMessages = state.hoverMessages.slice(-MAX_HOVER_MESSAGES);
  }

  function pruneOverflowingHoverMessages() {
    if (!elements?.hoverMessages || elements.hoverMessages.hidden) {
      return;
    }

    updateHoverMessagesBounds();

    let changed = false;
    while (
      state.hoverMessages.length > 1 &&
      elements.hoverMessages.scrollHeight > elements.hoverMessages.clientHeight + 2
    ) {
      const removableIndex = state.hoverMessages.findIndex((message, index) => index < state.hoverMessages.length - 1 && !message.pending);
      if (removableIndex < 0) {
        break;
      }

      state.hoverMessages.splice(removableIndex, 1);
      changed = true;
      renderHoverMessages();
      return;
    }

    if (!changed) {
      elements.hoverMessages.scrollTop = elements.hoverMessages.scrollHeight;
    }
  }

  function addHoverMessage(message, side = "right", options = {}) {
    const text = String(message || "").trim();
    if (!text) {
      return null;
    }

    const item = {
      id: options.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId: options.sessionId || state.pageConversationId,
      source: options.source || "page",
      side: side === "left" ? "left" : "right",
      text,
      pending: Boolean(options.pending),
      includeInHistory: options.includeInHistory !== false
    };

    state.hoverMessages.push(item);

    trimHoverMessagesToLimit();
    state.chatVisible = true;
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    renderHoverMessages();
    return item.id;
  }

  function updateHoverMessage(id, text, options = {}) {
    const item = state.hoverMessages.find((message) => message.id === id);
    if (!item) {
      return;
    }

    item.text = String(text || "").trim() || item.text;
    item.pending = options.pending ?? false;
    if (item.pending) {
      state.chatVisible = true;
      if (state.chatHideTimer) {
        window.clearTimeout(state.chatHideTimer);
        state.chatHideTimer = 0;
      }
    }
    renderHoverMessages();
  }

  function getLlmHistory() {
    return state.hoverMessages
      .filter((message) => !message.pending && message.source !== "channel" && message.includeInHistory !== false)
      .map((message) => ({
        role: message.side === "left" ? "assistant" : "user",
        content: message.text
      }))
      .slice(-8);
  }

  function requestPetReply(message, history) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    setThinkingStatus("正在理解你的消息...");
    const replyId = addHoverMessage("正在想...", "left", { pending: true });
    let fullText = "";
    let settled = false;
    let port = null;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      setThinkingStatus("");
      updateHoverMessage(replyId, fullText || "我刚刚没想出来：LLM 请求超时");
      try {
        port?.disconnect();
      } catch {}
    }, 125000);

    function finish() {
      settled = true;
      window.clearTimeout(timeoutId);
      setThinkingStatus("");
      updateHoverMessage(replyId, fullText || "我刚刚没想出来：LLM 返回为空");
    }

    try {
      port = chrome.runtime.connect({ name: "chatWithPetStream" });
      port.onMessage.addListener((payload) => {
        if (settled) {
          return;
        }

        if (payload?.type === "delta") {
          fullText += payload.delta || "";
          if (fullText.trim()) {
            setThinkingStatus("正在生成回复...");
          }
          updateHoverMessage(replyId, fullText || "正在想...", { pending: true });
          return;
        }

        if (payload?.type === "step") {
          handleAgentStep(payload.step);
          return;
        }

        if (payload?.type === "done") {
          finish();
          return;
        }

        if (payload?.type === "error") {
          settled = true;
          window.clearTimeout(timeoutId);
          setThinkingStatus("");
          const errorText = payload.error || "";
          const needsConfig = errorText.includes("API key");
          const interrupted = /aborted|body stream buffer|流式响应已中断/i.test(errorText);
          updateHoverMessage(
            replyId,
            needsConfig
              ? "还没配置 LLM API key，我暂时只能先陪你到这里。"
              : interrupted
                ? fullText || "刚刚的回复被中断了，可以再发一次。"
                : `我刚刚没想出来：${errorText || "LLM 请求失败"}`
          );
          reportError("chat_with_pet_stream", new Error(errorText || "LLM request failed"));
        }
      });
      port.onDisconnect.addListener(() => {
        if (!settled) {
          finish();
        }
      });
      port.postMessage({
        type: "start",
        message: text,
        history
      });
    } catch (error) {
      settled = true;
      window.clearTimeout(timeoutId);
      setThinkingStatus("");
      updateHoverMessage(replyId, `我刚刚没想出来：${error?.message || String(error)}`);
      reportError("chat_with_pet_stream", error);
    }
  }

  function fillTextToOnecaiInput(text) {
    const value = String(text || "").trim();
    if (!value) {
      return false;
    }

    syncPageConversationId();
    ensureUiMounted();
    setFloatingButtonVisible(true);
    updateButtonExpansionSide();
    state.chatHoldExpanded = true;
    scheduleSync();

    const content = value.length > 12000 ? `${value.slice(0, 12000)}\n\n[内容过长，已截断]` : value;
    elements.buttonHoverInput.value = content;
    window.requestAnimationFrame(() => {
      elements.buttonHoverInput.focus();
      elements.buttonHoverInput.setSelectionRange(content.length, content.length);
    });
    return true;
  }

  function sendTextToOnecai(text) {
    const value = String(text || "").trim();
    if (!value) {
      return false;
    }

    syncPageConversationId();
    const history = getLlmHistory();
    addHoverMessage(value, "right", { sessionId: state.pageConversationId, source: "page" });
    requestPetReply(value, history);
    return true;
  }

  async function handleHoverInputKeydown(event) {
    if (event.key !== "Enter" || event.isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const input = event.currentTarget;
    const value = input.value.trim();
    if (!value) {
      return;
    }

    input.value = "";
    if (await showLlmConfigIfNeeded()) {
      addHoverMessage(value, "right");
      return;
    }

    sendTextToOnecai(value);
  }

  function onPointerDown(event) {
    if (event.target?.closest?.(".pig-hover-input")) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    state.drag.active = true;
    state.drag.moved = false;
    state.drag.pointerId = event.pointerId;
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    const visualRect = getButtonVisualRect();
    state.drag.startLeft = visualRect.left;
    state.drag.startTop = visualRect.top;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.drag.startX;
    const deltaY = event.clientY - state.drag.startY;

    if (!state.drag.moved && (Math.abs(deltaX) > DRAG_START_THRESHOLD || Math.abs(deltaY) > DRAG_START_THRESHOLD)) {
      state.drag.moved = true;
      elements.root.style.left = `${state.drag.startLeft}px`;
      elements.root.style.top = `${state.drag.startTop}px`;
      elements.root.style.right = "auto";
      elements.root.style.bottom = "auto";
      elements.button.classList.add("is-dragging");
      collapseTransientChat();
    }

    if (!state.drag.moved) {
      return;
    }

    const next = clampPosition(state.drag.startLeft + deltaX, state.drag.startTop + deltaY);
    elements.root.style.left = `${next.left}px`;
    elements.root.style.top = `${next.top}px`;
    elements.root.style.right = "auto";
    elements.root.style.bottom = "auto";
    updateHoverMessagesBounds();
  }

  function onPointerUp(event) {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
      return;
    }

    const persistedLeft = Number.parseFloat(elements.root.style.left);
    const persistedTop = Number.parseFloat(elements.root.style.top);
    state.drag.active = false;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    elements.button.classList.remove("is-dragging");

    if (state.drag.moved) {
      persistPosition(
        Number.isFinite(persistedLeft) ? persistedLeft : state.drag.startLeft,
        Number.isFinite(persistedTop) ? persistedTop : elements.root.getBoundingClientRect().top
      );
      updateButtonExpansionSide();
      scheduleSync();
    }
  }

  function handleWindowResize() {
    updateButtonExpansionSide();
    updateHoverMessagesBounds();

    const rect = elements.root.getBoundingClientRect();
    const next = clampPosition(rect.left, rect.top);
    elements.root.style.left = `${next.left}px`;
    elements.root.style.top = `${next.top}px`;
    elements.root.style.right = "auto";
    elements.root.style.bottom = "auto";
    persistPosition(next.left, next.top);
  }

  function createUI() {
    function svgElement(name, attributes = {}) {
      const node = document.createElementNS(SVG_NS, name);
      Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
      });
      return node;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const button = document.createElement("div");
    button.className = "pig-floating-button";

    const buttonAura = document.createElement("span");
    buttonAura.className = "pig-fab-aura";

    const buttonIconWrap = document.createElement("span");
    buttonIconWrap.className = "pig-icon-wrap";
    buttonIconWrap.setAttribute("role", "button");
    buttonIconWrap.tabIndex = 0;
    buttonIconWrap.title = "拖动移动按钮，点击展开聊天";

    const buttonMascot = document.createElement("span");
    buttonMascot.className = "pig-mascot";

    const mascotSvg = svgElement("svg", {
      class: "pig-icon",
      viewBox: "0 0 24 24",
      "shape-rendering": "crispEdges",
      "aria-hidden": "true"
    });

    const headGroup = svgElement("g", { class: "pig-head-group" });
    const earLeft = svgElement("g", { class: "pig-ear pig-ear-left" });
    earLeft.append(
      svgElement("rect", { x: 4, y: 2, width: 4, height: 4, fill: "#f6a623" }),
      svgElement("rect", { x: 5, y: 3, width: 2, height: 2, fill: "#d97d00" })
    );
    const earRight = svgElement("g", { class: "pig-ear pig-ear-right" });
    earRight.append(
      svgElement("rect", { x: 16, y: 2, width: 4, height: 4, fill: "#f6a623" }),
      svgElement("rect", { x: 17, y: 3, width: 2, height: 2, fill: "#d97d00" })
    );
    const blushLeft = svgElement("rect", { x: 6, y: 12, width: 2, height: 2, fill: "#ff8ea1", class: "pig-blush pig-blush-left" });
    const blushRight = svgElement("rect", { x: 16, y: 12, width: 2, height: 2, fill: "#ff8ea1", class: "pig-blush pig-blush-right" });
    const browLeft = svgElement("rect", { x: 8, y: 7, width: 3, height: 1, fill: "#8a4b11", opacity: ".35", class: "pig-brow pig-brow-left" });
    const browRight = svgElement("rect", { x: 14, y: 7, width: 3, height: 1, fill: "#8a4b11", opacity: ".35", class: "pig-brow pig-brow-right" });

    const leftEye = svgElement("g", { class: "pig-eye pig-eye-left" });
    const leftPupil = svgElement("rect", { x: 9, y: 9, width: 1, height: 1, fill: "#000", class: "pig-pupil pig-pupil-left" });
    leftEye.append(
      svgElement("rect", { x: 8, y: 8, width: 3, height: 3, fill: "#fff" }),
      leftPupil
    );

    const rightEye = svgElement("g", { class: "pig-eye pig-eye-right" });
    const rightPupil = svgElement("rect", { x: 15, y: 9, width: 1, height: 1, fill: "#000", class: "pig-pupil pig-pupil-right" });
    rightEye.append(
      svgElement("rect", { x: 14, y: 8, width: 3, height: 3, fill: "#fff" }),
      rightPupil
    );

    const nose = svgElement("rect", { x: 11, y: 11, width: 2, height: 1, fill: "#3a2a1f", class: "pig-nose" });
    const mouth = svgElement("path", {
      d: "M10 13 Q12 15 14 13",
      stroke: "#7a3b2b",
      "stroke-width": 1.1,
      fill: "none",
      class: "pig-mouth",
      "stroke-linecap": "round"
    });
    const tongue = svgElement("rect", {
      x: 11,
      y: 14,
      width: 2,
      height: 2,
      fill: "#e85d5d",
      class: "pig-tongue",
      opacity: 0
    });

    headGroup.append(
      earLeft,
      earRight,
      svgElement("rect", { x: 4, y: 4, width: 16, height: 10, fill: "#f6a623" }),
      svgElement("rect", { x: 5, y: 5, width: 14, height: 8, fill: "#ffb53d" }),
      svgElement("rect", { x: 5, y: 11, width: 14, height: 7, fill: "#f4e9d8" }),
      svgElement("rect", { x: 8, y: 10, width: 8, height: 2, fill: "#f4e9d8" }),
      blushLeft,
      blushRight,
      browLeft,
      browRight,
      leftEye,
      rightEye,
      nose,
      mouth,
      tongue
    );
    mascotSvg.append(headGroup);
    buttonMascot.append(mascotSvg);

    const bubbleLayer = document.createElement("span");
    bubbleLayer.className = "pig-bubble-layer";

    function createBubbleSvg(type, viewBox, rects) {
      const bubble = svgElement("svg", {
        class: "pig-pixel-bubble",
        viewBox,
        "shape-rendering": "crispEdges",
        "aria-hidden": "true",
        "data-bubble": type
      });
      rects.forEach((rect) => {
        bubble.append(svgElement("rect", rect));
      });
      return bubble;
    }

    const buttonBubbles = {
      heart: createBubbleSvg("heart", "0 0 10 9", [
        { x: 1, y: 0, width: 2, height: 1, fill: "#ff5c8a" },
        { x: 4, y: 0, width: 2, height: 1, fill: "#ff5c8a" },
        { x: 7, y: 0, width: 2, height: 1, fill: "#ff5c8a" },
        { x: 0, y: 1, width: 3, height: 1, fill: "#ff5c8a" },
        { x: 3, y: 1, width: 4, height: 1, fill: "#ff5c8a" },
        { x: 7, y: 1, width: 3, height: 1, fill: "#ff5c8a" },
        { x: 0, y: 2, width: 10, height: 1, fill: "#ff5c8a" },
        { x: 1, y: 3, width: 8, height: 1, fill: "#ff5c8a" },
        { x: 2, y: 4, width: 6, height: 1, fill: "#ff5c8a" },
        { x: 3, y: 5, width: 4, height: 1, fill: "#ff5c8a" },
        { x: 4, y: 6, width: 2, height: 1, fill: "#ff5c8a" },
        { x: 4, y: 7, width: 2, height: 1, fill: "#ff5c8a" }
      ]),
      star: createBubbleSvg("star", "0 0 9 9", [
        { x: 4, y: 0, width: 1, height: 2, fill: "#ffd54f" },
        { x: 0, y: 4, width: 2, height: 1, fill: "#ffd54f" },
        { x: 7, y: 4, width: 2, height: 1, fill: "#ffd54f" },
        { x: 4, y: 7, width: 1, height: 2, fill: "#ffd54f" },
        { x: 2, y: 2, width: 1, height: 1, fill: "#ffd54f" },
        { x: 6, y: 2, width: 1, height: 1, fill: "#ffd54f" },
        { x: 2, y: 6, width: 1, height: 1, fill: "#ffd54f" },
        { x: 6, y: 6, width: 1, height: 1, fill: "#ffd54f" },
        { x: 3, y: 3, width: 3, height: 3, fill: "#ffca28" }
      ]),
      sweat: createBubbleSvg("sweat", "0 0 8 10", [
        { x: 3, y: 0, width: 1, height: 1, fill: "#5bbcff" },
        { x: 2, y: 1, width: 2, height: 1, fill: "#5bbcff" },
        { x: 1, y: 2, width: 3, height: 1, fill: "#5bbcff" },
        { x: 1, y: 3, width: 4, height: 1, fill: "#5bbcff" },
        { x: 1, y: 4, width: 4, height: 1, fill: "#5bbcff" },
        { x: 2, y: 5, width: 3, height: 1, fill: "#5bbcff" },
        { x: 2, y: 6, width: 2, height: 1, fill: "#5bbcff" },
        { x: 2, y: 7, width: 2, height: 1, fill: "#5bbcff" }
      ]),
      alert: createBubbleSvg("alert", "0 0 6 10", [
        { x: 2, y: 0, width: 2, height: 5, fill: "#ffb300" },
        { x: 2, y: 6, width: 2, height: 2, fill: "#ffb300" }
      ]),
      question: createBubbleSvg("question", "0 0 8 10", [
        { x: 2, y: 0, width: 3, height: 1, fill: "#8a7dff" },
        { x: 1, y: 1, width: 1, height: 1, fill: "#8a7dff" },
        { x: 5, y: 1, width: 1, height: 1, fill: "#8a7dff" },
        { x: 4, y: 2, width: 1, height: 1, fill: "#8a7dff" },
        { x: 3, y: 3, width: 1, height: 1, fill: "#8a7dff" },
        { x: 3, y: 5, width: 1, height: 1, fill: "#8a7dff" },
        { x: 3, y: 7, width: 1, height: 2, fill: "#8a7dff" }
      ]),
      sleep: createBubbleSvg("sleep", "0 0 14 10", [
        { x: 0, y: 0, width: 5, height: 1, fill: "#80cbc4" },
        { x: 3, y: 1, width: 1, height: 1, fill: "#80cbc4" },
        { x: 2, y: 2, width: 1, height: 1, fill: "#80cbc4" },
        { x: 1, y: 3, width: 5, height: 1, fill: "#80cbc4" },
        { x: 7, y: 2, width: 4, height: 1, fill: "#4db6ac" },
        { x: 9, y: 3, width: 1, height: 1, fill: "#4db6ac" },
        { x: 8, y: 4, width: 1, height: 1, fill: "#4db6ac" },
        { x: 7, y: 5, width: 4, height: 1, fill: "#4db6ac" }
      ]),
      anger: createBubbleSvg("anger", "0 0 10 10", [
        { x: 4, y: 0, width: 2, height: 2, fill: "#ff5252" },
        { x: 2, y: 2, width: 2, height: 2, fill: "#ff5252" },
        { x: 6, y: 2, width: 2, height: 2, fill: "#ff5252" },
        { x: 4, y: 4, width: 2, height: 2, fill: "#ff5252" },
        { x: 0, y: 4, width: 2, height: 2, fill: "#ff5252" },
        { x: 8, y: 4, width: 2, height: 2, fill: "#ff5252" },
        { x: 2, y: 6, width: 2, height: 2, fill: "#ff5252" },
        { x: 6, y: 6, width: 2, height: 2, fill: "#ff5252" }
      ])
    };

    bubbleLayer.append(...Object.values(buttonBubbles));
    buttonIconWrap.append(buttonMascot, bubbleLayer);

    const buttonCopy = document.createElement("span");
    buttonCopy.className = "pig-button-copy";

    const buttonStatus = document.createElement("span");
    buttonStatus.className = "pig-button-status";

    const buttonStatusDot = document.createElement("span");
    buttonStatusDot.className = "pig-status-dot";

    const buttonStatusViewport = document.createElement("span");
    buttonStatusViewport.className = "pig-status-viewport";

    const buttonStatusText = document.createElement("span");
    buttonStatusText.className = "pig-status-text";
    buttonStatusText.textContent = "";

    const buttonHoverInput = document.createElement("input");
    buttonHoverInput.type = "text";
    buttonHoverInput.className = "pig-hover-input";
    buttonHoverInput.placeholder = "输入文字";
    buttonHoverInput.setAttribute("aria-label", "悬浮按钮文字输入");
    buttonHoverInput.autocomplete = "off";

    const hoverMessages = document.createElement("div");
    hoverMessages.className = "pig-chat-messages";
    hoverMessages.hidden = true;

    buttonStatusViewport.append(buttonStatusText);
    buttonStatus.append(buttonStatusViewport, buttonStatusDot);
    buttonCopy.append(buttonHoverInput, buttonStatus);

    const tailTip = document.createElement("span");
    tailTip.className = "pig-tail-tip";

    button.append(hoverMessages, buttonAura, buttonIconWrap, buttonCopy, tailTip);
    root.append(button);
    (document.body || document.documentElement).append(root);

    buttonIconWrap.addEventListener("click", handlePetButtonClick);
    buttonIconWrap.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlePetButtonClick(event);
      }
    });
    button.addEventListener("pointerenter", () => {
      updateButtonExpansionSide();
      setChatVisible(true);
    });
    button.addEventListener("pointerleave", hideChatIfCollapsed);
    button.addEventListener("focusin", () => {
      updateButtonExpansionSide();
      setChatVisible(true);
    });
    button.addEventListener("focusout", hideChatIfCollapsed);
    buttonIconWrap.addEventListener("pointerdown", onPointerDown);
    buttonIconWrap.addEventListener("pointermove", onPointerMove);
    buttonIconWrap.addEventListener("pointerup", onPointerUp);
    buttonIconWrap.addEventListener("pointercancel", onPointerUp);
    buttonHoverInput.addEventListener("keydown", handleHoverInputKeydown);
    window.addEventListener("resize", handleWindowResize);

    return {
      root,
      button,
      buttonLabel: null,
      buttonHoverInput,
      buttonStatus: buttonStatusText,
      buttonStatusViewport,
      hoverMessages,
      buttonPupils: [leftPupil, rightPupil],
      buttonEyes: [leftEye, rightEye],
      buttonNose: nose,
      buttonMouth: mouth,
      buttonTongue: tongue,
      buttonBlushes: [blushLeft, blushRight],
      buttonTailTip: tailTip,
      buttonEarLeft: earLeft,
      buttonEarRight: earRight,
      buttonHeadGroup: headGroup,
      buttonBrowLeft: browLeft,
      buttonBrowRight: browRight,
      buttonBubbles
    };
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        all: initial;
      }

      #${ROOT_ID}, #${ROOT_ID} * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${ROOT_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
      }

      #${ROOT_ID}[hidden] {
        display: none !important;
      }

      #${ROOT_ID} [hidden] {
        display: none !important;
      }

      .pig-floating-button {
        --pig-compact-width: 132px;
        --pig-expanded-width: min(280px, calc(100vw - 16px));
        --pig-expand-offset: 0px;
        position: relative;
        left: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: var(--pig-compact-width);
        min-width: var(--pig-compact-width);
        max-width: var(--pig-expanded-width);
        height: 52px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 10px 14px 10px 12px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
        cursor: default;
        user-select: none;
        touch-action: none;
        overflow: visible;
        transition: left 180ms ease, width 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
      }

      .pig-floating-button.is-thinking {
        animation: pig-float 3.2s ease-in-out infinite;
      }

      .pig-floating-button:hover,
      .pig-floating-button:focus-within,
      .pig-floating-button.is-thinking,
      .pig-floating-button.is-chat-holding {
        width: var(--pig-expanded-width);
        box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
      }

      .pig-floating-button.is-expand-left:hover,
      .pig-floating-button.is-expand-left:focus-within,
      .pig-floating-button.is-expand-left.is-thinking,
      .pig-floating-button.is-expand-left.is-chat-holding {
        left: var(--pig-expand-offset);
      }

      .pig-icon-wrap:active {
        cursor: grabbing;
      }

	      .pig-floating-button.is-dragging {
	        width: var(--pig-compact-width);
	        left: 0;
	        animation-play-state: paused;
	        transform: scale(0.98);
	        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
	        transition:
	          left 0ms linear,
	          width 140ms ease,
	          box-shadow 140ms ease,
	          transform 140ms ease,
	          background-color 140ms ease;
	      }

      .pig-floating-button.is-expand-left.is-dragging {
        left: 0;
      }

      .pig-floating-button.is-open {
        background: rgba(16, 16, 16, 0.96);
      }

      .pig-fab-aura {
        position: absolute;
        inset: -8px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 24% 50%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 34%),
          radial-gradient(circle at 76% 50%, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0) 40%);
        opacity: 0;
        transform: scale(0.94);
        transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: none;
      }

      .pig-icon-wrap {
        position: relative;
        display: inline-flex;
        width: 32px;
        height: 32px;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        margin-left: -2px;
        cursor: grab;
      }

      .pig-icon-wrap:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.58);
        outline-offset: 4px;
        border-radius: 999px;
      }

      .pig-mascot {
        position: relative;
        display: inline-flex;
        width: 32px;
        height: 32px;
        align-items: center;
        justify-content: center;
      }

      .pig-icon {
        width: 32px;
        height: 32px;
        image-rendering: pixelated;
        overflow: visible;
      }

      .pig-head-group {
        transform-origin: center center;
        transition: transform 180ms ease;
      }

      .pig-ear {
        transform-origin: center bottom;
      }

      .pig-eye {
        transform-origin: center;
      }

      .pig-pupil {
        transition: transform 80ms linear;
        transform-box: fill-box;
        transform-origin: center;
      }

      .pig-brow {
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .pig-nose,
      .pig-mouth,
      .pig-tongue {
        transform-box: fill-box;
        transform-origin: center;
      }

      .pig-blush {
        transform-box: fill-box;
        transform-origin: center;
        opacity: 0;
        transition: opacity 140ms ease;
      }

      .pig-bubble-layer {
        position: absolute;
        left: 0;
        top: -14px;
        width: 22px;
        height: 18px;
        pointer-events: none;
        z-index: 3;
      }

      .pig-pixel-bubble {
        position: absolute;
        left: 0;
        top: 0;
        width: 16px;
        height: 16px;
        opacity: 0;
        transform: translateY(6px) scale(0.7);
        image-rendering: pixelated;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12));
      }

      .pig-chat-messages {
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + 10px);
        display: flex;
        flex-direction: column;
        gap: 8px;
	        max-height: none;
	        overflow-x: visible;
	        overflow-y: visible;
	        scrollbar-width: none;
	        opacity: 0;
	        pointer-events: none;
	        transform: translateY(5px) scale(0.985);
	        transform-origin: bottom center;
	        transition:
	          opacity 180ms ease,
	          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	        z-index: 5;
	      }

      .pig-chat-messages::-webkit-scrollbar {
        display: none;
      }

	      .pig-chat-messages.is-visible {
	        opacity: 1;
	        pointer-events: auto;
	        transform: translateY(0) scale(1);
	      }

	      .pig-chat-messages.is-collapsing {
	        opacity: 0;
	        pointer-events: none;
	        transform: translateY(4px) scale(0.985);
	      }

      .pig-chat-messages.is-compact-vertical {
        gap: 6px;
      }

      .pig-chat-row {
        display: flex;
        width: 100%;
      }

      .pig-chat-row.is-left {
        justify-content: flex-start;
      }

      .pig-chat-row.is-right {
        justify-content: flex-end;
      }

      .pig-chat-bubble {
        display: inline-block;
        max-width: min(220px, calc(100vw - 48px));
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.35;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      .pig-chat-bubble:has(.pig-chat-image) {
        max-width: min(320px, calc(100vw - 48px));
        padding: 6px;
      }

      .pig-chat-bubble,
      .pig-chat-bubble p,
      .pig-chat-bubble li,
      .pig-chat-bubble strong,
      .pig-chat-bubble em {
        color: #ffffff;
      }

      .pig-chat-bubble p,
      .pig-chat-bubble ul,
      .pig-chat-bubble ol,
      .pig-chat-bubble blockquote,
      .pig-chat-bubble pre {
        margin: 0;
      }

      .pig-chat-bubble p + p,
      .pig-chat-bubble p + ul,
      .pig-chat-bubble p + ol,
      .pig-chat-bubble ul + p,
      .pig-chat-bubble ol + p,
      .pig-chat-bubble pre + p,
      .pig-chat-bubble p + pre {
        margin-top: 6px;
      }

      .pig-chat-bubble ul,
      .pig-chat-bubble ol {
        padding-left: 18px;
      }

      .pig-chat-bubble li + li {
        margin-top: 3px;
      }

      .pig-chat-bubble code {
        padding: 1px 4px;
        border-radius: 4px;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.12);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }

      .pig-chat-bubble pre {
        max-width: 100%;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        overflow-x: auto;
        white-space: pre;
      }

      .pig-chat-bubble pre code {
        padding: 0;
        background: transparent;
      }

      .pig-chat-bubble blockquote {
        padding-left: 8px;
        border-left: 2px solid rgba(255, 255, 255, 0.28);
        color: rgba(255, 255, 255, 0.82);
      }

      .pig-chat-bubble a {
        color: #93c5fd;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .pig-chat-bubble .pig-chat-image {
        display: block;
        width: 100%;
        max-width: 100%;
        max-height: min(260px, 45vh);
        object-fit: contain;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.08);
      }

      .pig-chat-row.is-left .pig-chat-bubble {
        border-color: rgba(255, 255, 255, 0.1);
        border-bottom-left-radius: 5px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
      }

      .pig-chat-row.is-right .pig-chat-bubble {
        border-bottom-right-radius: 5px;
        background: rgba(24, 24, 24, 0.96);
      }

      .pig-chat-row.is-pending .pig-chat-bubble {
        opacity: 0.72;
      }

      .pig-chat-row.is-component {
        justify-content: flex-start;
      }

      .pig-component-card {
        width: min(260px, calc(100vw - 48px));
      }

      .pig-llm-config-form {
        display: grid;
        gap: 8px;
      }

      .pig-channel-config-form {
        display: grid;
        gap: 8px;
      }

      .pig-channel-config-body {
        display: grid;
        gap: 8px;
      }

      .pig-channel-status,
      .pig-channel-hint {
        color: rgba(255, 255, 255, 0.82);
        font-size: 12px;
        line-height: 1.35;
      }

      .pig-channel-qr {
        display: flex;
        justify-content: center;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
      }

      .pig-channel-qr img {
        width: 168px;
        height: 168px;
        object-fit: contain;
        display: block;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-config-form,
      .pig-chat-messages.is-compact-vertical .pig-channel-config-body {
        gap: 6px;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-qr {
        padding: 6px;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-qr img {
        width: 128px;
        height: 128px;
      }

      .pig-channel-qr-fallback {
        max-width: 168px;
        color: #111827;
        font-size: 12px;
        line-height: 1.35;
        text-align: center;
      }

      .pig-config-title {
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
      }

      .pig-config-field {
        display: grid;
        gap: 4px;
      }

      .pig-config-label {
        color: rgba(255, 255, 255, 0.68);
        font-size: 11px;
        font-weight: 600;
      }

      .pig-config-input {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 0 9px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
        line-height: 30px;
        outline: 0 !important;
        -webkit-appearance: none;
        appearance: none;
      }

      .pig-config-input:focus {
        border-color: rgba(96, 165, 250, 0.72);
        outline: 0 !important;
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18) !important;
      }

      .pig-config-input::placeholder {
        color: rgba(255, 255, 255, 0.38);
      }

      .pig-config-error {
        color: #fca5a5;
        font-size: 12px;
        line-height: 1.35;
      }

      .pig-config-actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 6px;
      }

      .pig-config-button {
        min-width: 0;
        min-height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 6px 10px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        overflow-wrap: anywhere;
        white-space: normal;
        cursor: pointer;
      }

      .pig-channel-config-form .pig-config-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        justify-content: stretch;
      }

      .pig-channel-config-form .pig-config-button {
        width: 100%;
        padding-left: 6px;
        padding-right: 6px;
      }

      .pig-channel-config-form .pig-config-button:first-child {
        grid-column: 1 / -1;
      }

      .pig-config-button.is-primary {
        border-color: rgba(96, 165, 250, 0.52);
        background: rgba(37, 99, 235, 0.72);
      }

      .pig-config-button:disabled {
        cursor: default;
        opacity: 0.62;
      }

      .pig-button-copy {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
        max-width: 100%;
        overflow: visible;
      }

      .pig-button-status {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        margin-left: 2px;
        min-width: 18px;
        width: 18px;
        max-width: 18px;
        padding: 5px;
        overflow: visible;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }

      .pig-floating-button.has-status-text .pig-button-status {
        flex: 1 1 auto;
        max-width: 100%;
      }

      .pig-status-viewport {
        display: none;
        align-items: center;
        justify-content: flex-start;
        overflow: hidden;
        width: 0;
        min-width: 0;
        max-width: 0;
      }

      .pig-floating-button.has-status-text .pig-status-viewport {
        display: inline-flex;
        flex: 1 1 auto;
        width: auto;
        max-width: 100%;
      }

      .pig-status-text {
        display: inline-block;
        white-space: nowrap;
        text-align: left;
      }

      .pig-hover-input {
        all: unset;
        box-sizing: border-box;
        width: 0;
        min-width: 0;
        height: 30px;
        flex: 1 1 auto;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 0;
	        color: #ffffff;
	        background: rgba(24, 24, 24, 0.94);
	        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
	        font-size: 13px;
	        line-height: 30px;
	        opacity: 0;
	        outline: 0 !important;
	        pointer-events: none;
	        cursor: text;
	        user-select: text;
	        -webkit-appearance: none;
	        appearance: none;
	        transition: width 180ms ease, padding 180ms ease, opacity 120ms ease;
      }

      .pig-hover-input:focus {
        outline: 0 !important;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.08),
          0 0 0 2px rgba(96, 165, 250, 0.16) !important;
      }

      .pig-hover-input::placeholder {
        color: rgba(255, 255, 255, 0.62);
      }

      .pig-floating-button:hover .pig-hover-input,
      .pig-floating-button:focus-within .pig-hover-input,
      .pig-floating-button.is-chat-holding .pig-hover-input {
        width: 150px;
        padding: 0 10px;
        opacity: 1;
        pointer-events: auto;
      }

      .pig-floating-button.is-thinking .pig-hover-input {
        width: 0;
        padding: 0;
        opacity: 0;
        pointer-events: none;
      }

      .pig-floating-button.is-dragging .pig-hover-input {
        width: 0;
        padding: 0;
        opacity: 0;
        pointer-events: none;
      }

      .pig-status-text.is-marquee {
        animation: pig-status-marquee var(--pig-marquee-duration, 5s) linear infinite;
      }

      @keyframes pig-status-marquee {
        from {
          transform: translateX(var(--pig-marquee-start, 0px));
        }

        to {
          transform: translateX(calc(-1 * var(--pig-marquee-end, 0px)));
        }
      }

      .pig-status-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        display: block;
        border-radius: 999px;
        background: #94a3b8;
        box-shadow: 0 0 10px rgba(148, 163, 184, 0.38);
      }

      .pig-floating-button.has-remote-text .pig-status-dot {
        background: #22c55e;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.42);
      }

      .pig-floating-button.is-thinking .pig-status-dot {
        background: #60a5fa;
        box-shadow: 0 0 12px rgba(96, 165, 250, 0.55);
        animation: pig-pulse 1.4s infinite;
      }

      .pig-tail-tip {
        position: absolute;
        right: -4px;
        top: 50%;
        width: 8px;
        height: 8px;
        border: 2px solid rgba(255, 255, 255, 0.14);
        border-left: none;
        border-bottom: none;
        border-radius: 0 6px 0 0;
        transform: translateY(-50%) rotate(30deg);
        opacity: 0.78;
      }
        50% {
          opacity: 1;
          transform: scale(1.03);
        }
      }

      @keyframes pig-float {
        0%, 100% {
          transform: translateY(0);
        }

        50% {
          transform: translateY(-6px);
        }
      }

      @keyframes pig-pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }

        50% {
          transform: scale(1.45);
          opacity: 0.58;
        }

        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .blink {
        animation: pig-blink 0.18s ease;
      }

      @keyframes pig-blink {
        0%, 100% {
          transform: scaleY(1);
        }

        50% {
          transform: scaleY(0.08);
        }
      }

      .double-blink {
        animation: pig-double-blink 0.42s ease;
      }

      @keyframes pig-double-blink {
        0%, 100% {
          transform: scaleY(1);
        }

        20% {
          transform: scaleY(0.08);
        }

        40% {
          transform: scaleY(1);
        }

        65% {
          transform: scaleY(0.08);
        }

        85% {
          transform: scaleY(1);
        }
      }

      .sniff {
        animation: pig-sniff 0.55s ease-in-out 2;
      }

      @keyframes pig-sniff {
        0%, 100% {
          transform: scale(1);
        }

        50% {
          transform: scale(1.28);
        }
      }

      .smile {
        animation: pig-smile 0.55s ease;
      }

      @keyframes pig-smile {
        0%, 100% {
          transform: scaleX(1);
        }

        50% {
          transform: scaleX(1.35) translateY(0.2px);
        }
      }

      .open-mouth {
        animation: pig-open-mouth 0.62s ease;
      }

      @keyframes pig-open-mouth {
        0%, 100% {
          transform: scaleY(1);
        }

        50% {
          transform: scaleY(1.9);
        }
      }

      .pout {
        animation: pig-pout 0.45s ease;
      }

      @keyframes pig-pout {
        0%, 100% {
          transform: scale(1);
        }

        50% {
          transform: scale(0.72);
        }
      }

      .tongue {
        animation: pig-tongue 0.82s ease-out;
      }

      @keyframes pig-tongue {
        0% {
          transform: translateY(-1px) scaleY(0.7);
          opacity: 0;
        }

        35% {
          transform: translateY(1px) scaleY(1);
          opacity: 1;
        }

        100% {
          transform: translateY(0) scaleY(0.9);
          opacity: 0;
        }
      }

      .show-blush {
        animation: pig-show-blush 0.95s ease;
      }

      @keyframes pig-show-blush {
        0% {
          opacity: 0;
        }

        30%, 70% {
          opacity: 0.95;
        }

        100% {
          opacity: 0;
        }
      }

      .wag {
        animation: pig-wag 0.38s ease-in-out 4;
        transform-origin: left center;
      }

      @keyframes pig-wag {
        0%, 100% {
          transform: translateY(-50%) rotate(30deg);
        }

        50% {
          transform: translateY(-50%) rotate(58deg);
        }
      }

      .ear-flap-left {
        animation: pig-ear-left 0.46s ease;
      }

      .ear-flap-right {
        animation: pig-ear-right 0.46s ease;
      }

      @keyframes pig-ear-left {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(-10deg);
        }
      }

      @keyframes pig-ear-right {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(10deg);
        }
      }

      .ear-drop-left {
        animation: pig-ear-drop-left 0.65s ease;
      }

      .ear-drop-right {
        animation: pig-ear-drop-right 0.65s ease;
      }

      @keyframes pig-ear-drop-left {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(12deg);
        }
      }

      @keyframes pig-ear-drop-right {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(-12deg);
        }
      }

      .tilt-left {
        animation: pig-tilt-left 0.52s ease;
      }

      .tilt-right {
        animation: pig-tilt-right 0.52s ease;
      }

      @keyframes pig-tilt-left {
        0%, 100% {
          transform: rotate(0deg) translateX(0);
        }

        50% {
          transform: rotate(-8deg) translateX(-0.5px);
        }
      }

      @keyframes pig-tilt-right {
        0%, 100% {
          transform: rotate(0deg) translateX(0);
        }

        50% {
          transform: rotate(8deg) translateX(0.5px);
        }
      }

      .nuzzle {
        animation: pig-nuzzle 0.55s ease;
      }

      @keyframes pig-nuzzle {
        0%, 100% {
          transform: translateX(0);
        }

        30% {
          transform: translateX(-2px);
        }

        65% {
          transform: translateX(1px);
        }
      }

      .shake {
        animation: pig-shake 0.42s ease;
      }

      @keyframes pig-shake {
        0%, 100% {
          transform: translateX(0);
        }

        20% {
          transform: translateX(-1.5px);
        }

        40% {
          transform: translateX(1.5px);
        }

        60% {
          transform: translateX(-1px);
        }

        80% {
          transform: translateX(1px);
        }
      }

      .look-left .pig-pupil {
        transform: translate(-1.6px, 0) !important;
      }

      .look-right .pig-pupil {
        transform: translate(1.6px, 0) !important;
      }

      .bubble-pop {
        animation: pig-bubble-pop 1s ease forwards;
      }

      @keyframes pig-bubble-pop {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.6);
        }

        20% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        75% {
          opacity: 1;
          transform: translateY(-8px) scale(1);
        }

        100% {
          opacity: 0;
          transform: translateY(-16px) scale(1.08);
        }
      }

    `;

    (document.head || document.documentElement).append(style);
  }

  function startMountWatchdog() {
    window.setInterval(() => {
      ensureUiMounted();
      if (state.chatVisible || state.thinkingActive || state.llmConfig.visible || state.channelConfig.visible) {
        syncUI();
      }
    }, MOUNT_WATCHDOG_INTERVAL);
  }

  function installGlobalErrorHandlers() {
    window.addEventListener("error", (event) => {
      reportError("global_error", event.error || new Error(event.message || "Unknown content error"), {
        filename: event.filename || "",
        lineno: event.lineno || 0,
        colno: event.colno || 0
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      reportError("unhandled_rejection", reason, {
        reasonType: typeof reason
      });
    });
  }

  async function start() {
    await loadFloatingButtonVisibility();
    ensureUiMounted();
    applySavedPosition();
    installGlobalErrorHandlers();
    startMountWatchdog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
