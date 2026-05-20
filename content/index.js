(function () {
  if (window.top !== window.self) {
    return;
  }

  const CONTENT_CONFIG = globalThis.DogeclawConfig?.content || {};
  const ROOT_ID = CONTENT_CONFIG.rootId || "dogeclaw-root";
  const STYLE_ID = CONTENT_CONFIG.styleId || "dogeclaw-style";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAX_HOVER_MESSAGES = CONTENT_CONFIG.maxHoverMessages || 24;
  const MOUNT_WATCHDOG_INTERVAL = CONTENT_CONFIG.mountWatchdogIntervalMs || 1000;
  const POSITION_KEY = `${CONTENT_CONFIG.positionKeyPrefix || "dogeclaw-position:"}${location.host}`;
  const LLM_CONFIG = globalThis.DogeclawConfig?.llm || {};
  const LLM_DEFAULT_CONFIG = LLM_CONFIG.defaultConfig || {};
  const LLM_CONTEXT_WINDOW_DEFAULT = LLM_CONFIG.contextWindowDefault || 32000;
  const LLM_CONTEXT_WINDOWS = LLM_CONFIG.contextWindows || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const FLOATING_BUTTON_COMPACT_WIDTH = 132;
  const FLOATING_BUTTON_EDGE_PADDING = 8;
  const CHAT_MESSAGES_BUTTON_GAP = 10;
  const DRAG_START_THRESHOLD = 4;
  const LLM_CONFIG_TIP_ID = "dogeclaw-llm-config-tip";
  const IMAGE_LIMIT_TIP_ID = "dogeclaw-image-limit-tip";
  const TRANSIENT_TIP_DISMISS_MS = CONTENT_CONFIG.transientTipDismissMs || 10000;
  const TAB_HISTORY_SAVE_DELAY_MS = 80;
  const INPUT_IMAGE_MAX_COUNT = CONTENT_CONFIG.inputImageMaxCount || 5;
  const INPUT_IMAGE_MAX_DIMENSION = CONTENT_CONFIG.inputImageMaxDimension || 1536;
  const INPUT_IMAGE_COMPRESS_QUALITY = CONTENT_CONFIG.inputImageCompressQuality || 0.82;
  const INPUT_IMAGE_DATA_URL_MAX_LENGTH = CONTENT_CONFIG.inputImageDataUrlMaxLength || 1200000;
  const INPUT_IMAGES_TOTAL_DATA_URL_MAX_LENGTH = CONTENT_CONFIG.inputImagesTotalDataUrlMaxLength || 3600000;
  const INPUT_IMAGE_DRAG_RESET_MS = 900;
  const IMAGE_FILE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;
  const DATA_IMAGE_MARKDOWN_RE = /!\[([^\]\n\r]*)]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/;
  const DATA_IMAGE_MARKDOWN_PREFIX_RE = /!\[[^\]\n\r]*]\(data:image\//;
  const SLASH_COMMAND_IDS = {
    NEW: "new",
    MODEL: "model"
  };
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);

  function isImageInputUnsupportedError(error) {
    const message = String(error || "");
    return /(image_url|image input|vision|multimodal)/i.test(message)
      && /(unknown variant|expected text|unsupported|not support|does not support|invalid type|only text)/i.test(message);
  }

  function formatLlmErrorMessage(error, fallbackText = "") {
    const errorText = String(error || "");
    if (errorText.includes("API key")) {
      return t("llm.missingKey");
    }
    if (isImageInputUnsupportedError(errorText)) {
      return t("llm.imageUnsupported");
    }
    if (/aborted|body stream buffer|流式响应已中断/i.test(errorText)) {
      return fallbackText || t("llm.interrupted");
    }
    return t("llm.failed", { error: errorText || t("llm.requestFailed") });
  }

  const injectContentStyles = () => {
    if (!globalThis.DogeclawContentStyles?.injectStyles) {
      throw new Error("Dogeclaw content styles unavailable");
    }
    globalThis.DogeclawContentStyles.injectStyles({ rootId: ROOT_ID, styleId: STYLE_ID });
  };

  [ROOT_ID, ...(CONTENT_CONFIG.legacyRootIds || [])].forEach((id) => {
    const existingRoot = document.getElementById(id);
    if (existingRoot) {
      existingRoot.remove();
    }
  });

  injectContentStyles();

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
    inputImageDrag: {
      active: false,
      overDropTarget: false,
      resetTimer: 0,
      imageUrl: "",
      restoreChatHoldExpanded: false
    },
	    hoverUserScrolled: false,
	    hoverScrollToBottomRequested: false,
    hoverScrollDrag: {
      active: false,
      moved: false,
      suppressClick: false,
      pointerId: null,
      startY: 0,
      startScrollTop: 0
    },
    commandMenu: {
      visible: false,
      query: "",
      activeIndex: 0
    },
    chatVisible: false,
	    chatHideTimer: 0,
	    chatCollapseTimer: 0,
	    chatHoldExpanded: false,
	    inputImages: [],
	    navigationInProgress: false,
	    navigationResetTimer: 0,
	    llmConfig: {
      checked: false,
      providerConfigured: false,
      imageInputSupported: false,
      imageInputStatus: "unknown",
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
    contextUsage: {
      usage: null,
      model: "",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      limitTokens: 0,
      ratio: 0,
      updatedAt: 0
    }
  };
  state.pageConversationId = getPageConversationId();
  let tabHistorySaveTimer = 0;
  let tabHistorySavePromise = Promise.resolve();
  let activeReplyStop = null;
  const hoverTipDismissTimers = new Map();

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

  function getSlashCommands() {
    return [
      {
        id: SLASH_COMMAND_IDS.NEW,
        name: "/new",
        description: t("command.new.description")
      },
      {
        id: SLASH_COMMAND_IDS.MODEL,
        name: "/model",
        description: t("command.model.description")
      }
    ];
  }

  function getVisibleSlashCommands() {
    const query = String(state.commandMenu.query || "").toLowerCase();
    return getSlashCommands().filter((command) => command.name.slice(1).startsWith(query));
  }

  const browserActions = globalThis.DogeclawContentBrowserActions?.createController?.();
  if (!browserActions) {
    throw new Error("Dogeclaw content browser actions unavailable");
  }

  function isRuntimeContextValid() {
    try {
      return Boolean(PLATFORM.runtime?.id || globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function consumeRuntimeLastError() {
    try {
      return globalThis.chrome?.runtime?.lastError?.message || PLATFORM.api?.runtime?.lastError?.message || "";
    } catch {
      return "";
    }
  }

  async function safeSendRuntimeMessage(payload) {
    if (!isRuntimeContextValid()) {
      return null;
    }

    try {
      if (PLATFORM.runtime?.sendMessage) {
        return await PLATFORM.runtime.sendMessage(payload);
      }
      const runtime = globalThis.chrome?.runtime;
      return runtime ? runtime.sendMessage(payload) : null;
    } catch {
      return null;
    }
  }

  function serializeHoverMessages() {
    return state.hoverMessages
      .filter((message) => message?.text)
      .map((message) => ({
        id: String(message.id || ""),
        type: message.type === "tip" ? "tip" : "message",
        sessionId: String(message.sessionId || ""),
        source: String(message.source || "page"),
	        side: message.side === "left" ? "left" : "right",
	        text: String(message.text || ""),
	        historyText: String(message.historyText || ""),
	        icon: message.icon ?? "logo",
        action: message.action || "",
        actionLabel: message.actionLabel || "",
        pending: Boolean(message.pending),
        includeInHistory: message.includeInHistory !== false
      }));
  }

  function normalizeRestoredHoverMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages
      .map((message) => {
        const text = String(message?.text || "").trim();
        const id = String(message?.id || "").trim();
        if (!text || !id) {
          return null;
        }
        if (DATA_IMAGE_MARKDOWN_PREFIX_RE.test(text) && !DATA_IMAGE_MARKDOWN_RE.test(text)) {
          return null;
        }
        return {
          id,
          type: message.type === "tip" ? "tip" : "message",
          sessionId: String(message.sessionId || state.pageConversationId),
          source: String(message.source || "page"),
	          side: message.side === "left" ? "left" : "right",
	          text,
	          historyText: String(message.historyText || ""),
	          icon: message.icon ?? "logo",
          action: String(message.action || ""),
          actionLabel: String(message.actionLabel || ""),
          pending: Boolean(message.pending),
          includeInHistory: message.includeInHistory !== false
        };
      })
      .filter(Boolean)
      .slice(-MAX_HOVER_MESSAGES);
  }

  async function loadTabConversationHistory() {
    const response = await safeSendRuntimeMessage({ type: "getTabConversation" });
    if (!response?.ok || !response.conversation) {
      return false;
    }

    const restoredMessages = normalizeRestoredHoverMessages(response.conversation.messages);
    if (!restoredMessages.length) {
      return false;
    }

    state.hoverMessages = restoredMessages;
    state.chatVisible = Boolean(response.conversation.chatVisible);
    state.chatHoldExpanded = Boolean(response.conversation.chatHoldExpanded);
    restoreContextUsage(response.conversation);
    return true;
  }

  function buildTabConversationPayload() {
    syncPageConversationId();
    return {
      url: location.href,
      pageConversationId: state.pageConversationId,
      chatVisible: state.chatVisible,
      chatHoldExpanded: state.chatHoldExpanded,
      usage: state.contextUsage.usage || null,
      contextUsage: state.contextUsage.promptTokens ? state.contextUsage : null,
      savedAt: Date.now(),
      messages: serializeHoverMessages()
    };
  }

  async function persistTabConversationNow() {
    if (tabHistorySaveTimer) {
      window.clearTimeout(tabHistorySaveTimer);
      tabHistorySaveTimer = 0;
    }

    const conversation = buildTabConversationPayload();
    tabHistorySavePromise = safeSendRuntimeMessage({
      type: "setTabConversation",
      conversation
    }).catch(() => null);
    await tabHistorySavePromise;
  }

  function scheduleTabConversationPersist() {
    if (tabHistorySaveTimer) {
      window.clearTimeout(tabHistorySaveTimer);
    }
    tabHistorySaveTimer = window.setTimeout(() => {
      tabHistorySaveTimer = 0;
      persistTabConversationNow().catch(() => null);
    }, TAB_HISTORY_SAVE_DELAY_MS);
  }

  function holdChatOpenForNavigation() {
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    if (state.chatCollapseTimer) {
      window.clearTimeout(state.chatCollapseTimer);
      state.chatCollapseTimer = 0;
    }

    state.chatVisible = true;
    state.chatHoldExpanded = true;
    renderHoverMessages();
    scheduleSync();
  }

  function waitForNextPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  let elements;
  elements = createUI();
  anchorRootToCurrentPosition();
  const petController = window.DogeclawPet.createController({
    elements,
    state,
    scheduleSync
  });
  document.addEventListener("mousemove", (event) => {
    petController.updateEyes(event.clientX, event.clientY);
  });
  if (isRuntimeContextValid()) {
    try {
      const runtime = PLATFORM.runtime || globalThis.chrome?.runtime;
      runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
        if (message?.type === "setFloatingButtonVisible") {
          setFloatingButtonVisible(message.enabled);
          sendResponse?.({ ok: true, enabled: state.floatingEnabled });
          return false;
        }

        if (message?.type === "getFloatingButtonVisible") {
          sendResponse?.({ ok: true, enabled: state.floatingEnabled });
          return false;
        }

        if (message?.type === "dogeclawBrowserPing") {
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "dogeclawPrepareForNavigation") {
          state.navigationInProgress = true;
          holdChatOpenForNavigation();
          if (state.navigationResetTimer) {
            window.clearTimeout(state.navigationResetTimer);
          }
          state.navigationResetTimer = window.setTimeout(() => {
            state.navigationInProgress = false;
            state.navigationResetTimer = 0;
          }, 10000);
          waitForNextPaint()
            .then(() => persistTabConversationNow())
            .then(() => sendResponse?.({ ok: true }))
            .catch((error) => sendResponse?.({ ok: false, error: error?.message || String(error) }));
          return true;
        }

        if (message?.type === "dogeclawAgentUpdate") {
          applyAgentUpdate(message);
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "dogeclawCaptureMode") {
          if (elements?.root) {
            elements.root.style.visibility = message.hidden ? "hidden" : "";
          }
          sendResponse?.({ ok: true });
          return false;
        }

        if (message?.type === "dogeclawToolArtifact" && message.artifact?.type === "image") {
          const dataUrl = String(message.artifact.dataUrl || "");
          if (dataUrl.startsWith("data:image/")) {
            const title = String(message.artifact.title || t("browser.screenshotTitle")).replace(/[\]\n\r]/g, " ").trim() || t("browser.screenshotTitle");
            addHoverMessage(`![${title}](${dataUrl})`, "left", { includeInHistory: false });
            setChatVisible(true);
            sendResponse?.({ ok: true });
            return false;
          }
          sendResponse?.({ ok: false, error: t("image.artifactInvalid") });
          return false;
        }

        if (message?.type === "dogeclawBrowserAction") {
          try {
            sendResponse?.(browserActions.handleAction(message));
          } catch (error) {
            sendResponse?.({ ok: false, error: error?.message || String(error) });
          }
          return false;
        }

        if (message?.type === "sendSelectionToDogeclaw") {
          sendResponse?.({ ok: fillTextToDogeclawInput(message.text) });
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
            addHoverMessage(t("channel.wechatConfigured"), "left");
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

    injectContentStyles();

    const mountTarget = document.body || document.documentElement;
    if (mountTarget && !elements.root.isConnected) {
      mountTarget.append(elements.root);
      applySavedPosition();
      anchorRootToCurrentPosition();
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

  function normalizeModelKey(model) {
    return String(model || "").trim().toLowerCase();
  }

  function getContextWindowLimit(model) {
    const raw = normalizeModelKey(model || state.llmConfig.values.model || LLM_DEFAULT_CONFIG.model);
    const candidates = [
      raw,
      raw.replace(/^openai\//, ""),
      raw.replace(/^deepseek\//, ""),
      raw.replace(/^gemini\//, ""),
      raw.split("/").pop()
    ].filter(Boolean);

    for (const candidate of candidates) {
      const value = Number(LLM_CONTEXT_WINDOWS[candidate]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    return Number(LLM_CONTEXT_WINDOW_DEFAULT) || 32000;
  }

  function getUsageNumber(usage, names) {
    for (const name of names) {
      const value = Number(usage?.[name]);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
    return 0;
  }

  function normalizeUsage(usage = null) {
    if (!usage || typeof usage !== "object") {
      return null;
    }

    const completionTokens = getUsageNumber(usage, ["completion_tokens", "completionTokens", "output_tokens", "outputTokens"]);
    const totalTokens = getUsageNumber(usage, ["total_tokens", "totalTokens"]);
    let promptTokens = getUsageNumber(usage, ["prompt_tokens", "promptTokens", "input_tokens", "inputTokens"]);
    if (!promptTokens && totalTokens && completionTokens) {
      promptTokens = Math.max(0, totalTokens - completionTokens);
    }

    if (!promptTokens && !completionTokens && !totalTokens) {
      return null;
    }

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens || promptTokens + completionTokens
    };
  }

  function formatTokenCount(value) {
    const count = Number(value) || 0;
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
    }
    return String(Math.round(count));
  }

  function resetContextUsage() {
    state.contextUsage = {
      usage: null,
      model: "",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      limitTokens: 0,
      ratio: 0,
      updatedAt: 0
    };
  }

  function applyContextUsage(usage, options = {}) {
    const normalized = normalizeUsage(usage);
    if (!normalized?.prompt_tokens) {
      return false;
    }

    const model = String(options.model || state.llmConfig.values.model || LLM_DEFAULT_CONFIG.model || "").trim();
    const limitTokens = getContextWindowLimit(model);
    const ratio = Math.min(1, normalized.prompt_tokens / Math.max(1, limitTokens));
    state.contextUsage = {
      usage: normalized,
      model,
      promptTokens: normalized.prompt_tokens,
      completionTokens: normalized.completion_tokens,
      totalTokens: normalized.total_tokens,
      limitTokens,
      ratio,
      updatedAt: Date.now()
    };
    scheduleSync();
    scheduleTabConversationPersist();
    return true;
  }

  function restoreContextUsage(conversation = {}) {
    if (applyContextUsage(conversation.usage, { model: conversation.contextUsage?.model || state.llmConfig.values.model })) {
      return true;
    }

    const contextUsage = conversation.contextUsage || {};
    if (!contextUsage.promptTokens || !contextUsage.limitTokens) {
      return false;
    }

    state.contextUsage = {
      usage: normalizeUsage(contextUsage.usage),
      model: String(contextUsage.model || ""),
      promptTokens: Number(contextUsage.promptTokens) || 0,
      completionTokens: Number(contextUsage.completionTokens) || 0,
      totalTokens: Number(contextUsage.totalTokens) || 0,
      limitTokens: Number(contextUsage.limitTokens) || getContextWindowLimit(contextUsage.model),
      ratio: Math.min(1, Math.max(0, Number(contextUsage.ratio) || 0)),
      updatedAt: Number(contextUsage.updatedAt) || Date.now()
    };
    return true;
  }

  function getContextUsageTitle() {
    const usage = state.contextUsage;
    if (!usage.promptTokens || !usage.limitTokens) {
      return "";
    }

    return t("chat.contextUsage", {
      percent: Math.round(usage.ratio * 100),
      used: formatTokenCount(usage.promptTokens),
      limit: formatTokenCount(usage.limitTokens)
    });
  }

  function setNativeTooltip(element, text) {
    if (!element) {
      return;
    }

    const value = String(text || "").trim();
    if (value) {
      element.setAttribute("title", value);
    } else {
      element.removeAttribute("title");
    }
  }

  function setButtonStatusTooltip(text) {
    setNativeTooltip(elements.buttonStatus, text);
    setNativeTooltip(elements.buttonStatusDot, text);
  }

  function syncUI() {
    const canStop = Boolean(state.thinkingActive && activeReplyStop);
    const contextKnown = !state.thinkingActive && state.contextUsage.promptTokens > 0 && state.contextUsage.limitTokens > 0;
    const dragTitle = t("chat.dragHint");
    const statusTitle = canStop ? t("chat.stopGenerating") : contextKnown ? getContextUsageTitle() : "";
    setNativeTooltip(elements.button, dragTitle);
    setNativeTooltip(elements.buttonIconWrap, dragTitle);
    setButtonStatusTooltip(statusTitle);
    elements.button.classList.toggle("is-open", false);
	    elements.button.classList.toggle("is-dragging", state.drag.active && state.drag.moved);
	    elements.button.classList.toggle("is-thinking", state.thinkingActive);
    elements.button.classList.toggle("is-stoppable", canStop);
    elements.button.classList.toggle("has-context-usage", contextKnown);
	    elements.button.classList.toggle("is-chat-holding", state.chatHoldExpanded);
	    elements.button.classList.toggle("supports-input-image", state.llmConfig.imageInputSupported === true);
	    elements.button.classList.toggle("has-input-image", state.llmConfig.imageInputSupported === true && state.inputImages.length > 0);
    elements.button.style.setProperty("--pig-context-ratio", `${Math.round(state.contextUsage.ratio * 100)}%`);
    elements.buttonStatus.tabIndex = canStop ? 0 : -1;
    elements.buttonStatus.setAttribute("role", canStop ? "button" : "presentation");
    if (canStop) {
      elements.buttonStatus.setAttribute("aria-label", t("chat.stopGenerating"));
      elements.buttonStatus.removeAttribute("data-tooltip");
    } else {
      elements.buttonStatus.removeAttribute("aria-label");
      elements.buttonStatus.removeAttribute("data-tooltip");
    }
    renderInputImageDragState();
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

  function setThinkingStatus(text) {
    state.thinkingActive = Boolean(String(text || ""));
    scheduleSync();
  }

  function getToolStepText(step) {
    const calls = Array.isArray(step?.calls) ? step.calls : [];
    const firstCall = calls[0] || {};
    const toolName = firstCall.name || t("tool.generic");
    const args = firstCall.arguments || {};

    if (toolName === "browser_control") {
      const action = args.action ? ` ${args.action}` : "";
      return t("tool.browser", { action });
    }

    if (toolName === "curl") {
      return t("tool.http");
    }

    if (toolName === "system_config") {
      const action = args.action ? ` ${args.action}` : "";
      return t("tool.system", { action });
    }

    return t("tool.running", { tool: toolName });
  }

  function handleAgentStep(step) {
    if (!step?.type) {
      return;
    }

    if (step.type === "llm_start") {
      setThinkingStatus(step.iteration > 0 ? t("status.toolReturned") : t("status.understanding"));
      return;
    }

    if (step.type === "tool_start") {
      setThinkingStatus(getToolStepText(step));
      return;
    }

    if (step.type === "tool_done") {
      setThinkingStatus(t("status.toolDone"));
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

    if (
      state.chatVisible &&
      state.hoverMessages.length > 0 &&
      !state.commandMenu.visible &&
      !state.llmConfig.visible &&
      !state.channelConfig.visible
    ) {
      collapseTransientChat();
      return;
    }

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

  function anchorRootToCurrentPosition() {
    if (!elements?.root?.isConnected) {
      return;
    }

    const currentLeft = Number.parseFloat(elements.root.style.left);
    const currentTop = Number.parseFloat(elements.root.style.top);
    if (Number.isFinite(currentLeft) && Number.isFinite(currentTop)) {
      return;
    }

    const rect = elements.root.getBoundingClientRect();
    const next = clampPosition(rect.left, rect.top);
    elements.root.style.left = `${next.left}px`;
    elements.root.style.top = `${next.top}px`;
    elements.root.style.right = "auto";
    elements.root.style.bottom = "auto";
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
    const gap = CHAT_MESSAGES_BUTTON_GAP;
    const minHeight = Math.min(120, Math.max(64, Math.floor(window.innerHeight * 0.36)));
    const aboveHeight = Math.max(0, Math.floor(buttonRect.top - FLOATING_BUTTON_EDGE_PADDING - gap));
    const belowHeight = Math.max(0, Math.floor(window.innerHeight - buttonRect.bottom - FLOATING_BUTTON_EDGE_PADDING - gap));
    const shouldPlaceBelow = aboveHeight < minHeight && belowHeight > aboveHeight;
    const availableHeight = shouldPlaceBelow ? belowHeight : aboveHeight;
    const viewportCap = Math.max(64, Math.floor(window.innerHeight - FLOATING_BUTTON_EDGE_PADDING * 2));
    const maxHeight = Math.min(viewportCap, Math.max(minHeight, availableHeight));

    elements.hoverMessages.style.setProperty("--pig-chat-max-height", `${maxHeight}px`);
    elements.hoverMessages.classList.toggle("is-below-button", shouldPlaceBelow);
    elements.hoverMessages.classList.toggle("is-compact-vertical", maxHeight < 260);
    return maxHeight;
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
    scheduleTabConversationPersist();
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
    scheduleTabConversationPersist();
  }

  function hideChatImmediatelyForDrag() {
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    if (state.chatCollapseTimer) {
      window.clearTimeout(state.chatCollapseTimer);
      state.chatCollapseTimer = 0;
    }

    if (!state.thinkingActive && !state.hoverMessages.some((message) => message.pending)) {
      state.chatVisible = false;
      state.chatHoldExpanded = false;
    }

    if (elements?.hoverMessages) {
      elements.hoverMessages.hidden = true;
      elements.hoverMessages.classList.remove("is-visible", "is-collapsing", "is-scrollable", "is-drag-scrolling");
    }
    elements.buttonHoverInput?.blur?.();
    scheduleSync();
    scheduleTabConversationPersist();
  }

  function hideChatIfCollapsed(event) {
    const nextTarget = event?.relatedTarget;
    if (nextTarget && elements?.button?.contains?.(nextTarget)) {
      return;
    }

    if (event?.type === "focusout" && state.commandMenu.visible) {
      hideSlashCommandMenu();
    } else if (state.commandMenu.visible) {
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
    scheduleTabConversationPersist();
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

  function restoreChatRecordsAfterConfig() {
    const hasRecords = state.hoverMessages.length > 0;
    state.chatVisible = hasRecords;
    state.chatHoldExpanded = hasRecords;
    if (hasRecords) {
      requestHoverMessagesScrollToBottom();
    }
  }

  function closeLlmProviderConfigForm() {
    closeConfigPanel("llm");
    restoreChatRecordsAfterConfig();
    renderHoverMessages();
    scheduleSync();
    scheduleTabConversationPersist();
  }

  function applyLlmCapabilities(config = {}) {
    const capabilities = config.capabilities || {};
    state.llmConfig.imageInputSupported = capabilities.imageInput === true;
    state.llmConfig.imageInputStatus = capabilities.imageInputStatus || "unknown";
    if (!state.llmConfig.imageInputSupported && state.inputImages.length) {
      state.inputImages = [];
    }
    renderInputImageState();
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
      apiBase: config.apiBase || LLM_DEFAULT_CONFIG.apiBase || "https://api.openai.com/v1",
      apiKey: "",
      model: config.model || LLM_DEFAULT_CONFIG.model || "gpt-4o-mini"
    };
    if (state.contextUsage.usage) {
      applyContextUsage(state.contextUsage.usage, { model: state.llmConfig.values.model });
    }
    applyLlmCapabilities(config);
    return state.llmConfig.providerConfigured;
  }

  async function saveLlmConfig() {
    const apiBase = state.llmConfig.values.apiBase.trim();
    const model = state.llmConfig.values.model.trim();
    const apiKey = state.llmConfig.values.apiKey.trim();
    if (!apiBase || !model) {
      state.llmConfig.error = t("llm.required");
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
      state.llmConfig.error = response?.error || t("llm.saveFailed");
      renderHoverMessages();
      return;
    }

    state.llmConfig.providerConfigured = Boolean(
      response?.userConfigured &&
      response.config?.apiBase &&
      response.config?.model &&
      response.config?.apiKey === "configured"
    );
    applyLlmCapabilities(response.config || {});
    if (!state.llmConfig.providerConfigured) {
      state.llmConfig.error = t("llm.apiKeyRequired");
      renderHoverMessages();
      return;
    }

    closeConfigPanel("llm");
    state.chatVisible = true;
    state.chatHoldExpanded = true;
    addHoverMessage(state.llmConfig.imageInputSupported ? t("llm.saved") : t("llm.savedImageUnavailable"), "left");
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

    showLlmProviderConfigTip();
    scheduleSync();
    return true;
  }

  function showLlmProviderConfigTip() {
    addHoverTip({
      id: LLM_CONFIG_TIP_ID,
      text: t("llm.configTip"),
      actionLabel: t("llm.configTipAction"),
      action: "open_llm_config",
      icon: "logo"
    });
    state.chatHoldExpanded = true;
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
      throw new Error(response?.error || t("channel.readFailed"));
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
      state.channelConfig.error = response?.error || t("channel.qrFetchFailed");
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
      state.channelConfig.error = response?.error || t("channel.loginCheckFailed");
      renderHoverMessages();
      return;
    }
    state.channelConfig.login = response.result || null;
    if (state.channelConfig.login?.status === "confirmed") {
      await refreshChannelConfig(channel).catch(() => null);
      addHoverMessage(t("channel.wechatConfigured"), "left");
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

  function hideSlashCommandMenu(options = {}) {
    if (!state.commandMenu.visible && !state.commandMenu.query && state.commandMenu.activeIndex === 0) {
      return false;
    }

    state.commandMenu.visible = false;
    state.commandMenu.query = "";
    state.commandMenu.activeIndex = 0;
    if (options.render !== false) {
      renderHoverMessages();
      scheduleSync();
    }
    return true;
  }

  function updateSlashCommandMenuFromInput(value) {
    const text = String(value || "");
    if (!text.startsWith("/") || /\s/.test(text)) {
      hideSlashCommandMenu();
      return false;
    }

    const query = text.slice(1).toLowerCase();
    const commands = getSlashCommands().filter((command) => command.name.slice(1).startsWith(query));
    if (!commands.length) {
      hideSlashCommandMenu();
      return false;
    }

    const queryChanged = state.commandMenu.query !== query;
    state.commandMenu.visible = true;
    state.commandMenu.query = query;
    state.commandMenu.activeIndex = queryChanged ? 0 : Math.min(state.commandMenu.activeIndex, commands.length - 1);
    state.chatHoldExpanded = true;
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    updateButtonExpansionSide();
    renderHoverMessages();
    scheduleSync();
    return true;
  }

  function clearConversationInfo() {
    if (typeof activeReplyStop === "function") {
      activeReplyStop();
    }

    hoverTipDismissTimers.forEach((timerId) => window.clearTimeout(timerId));
    hoverTipDismissTimers.clear();
    stopChannelAutoCheck();
    closeConfigPanel();
    state.hoverMessages = [];
    state.inputImages = [];
    state.hoverUserScrolled = false;
    state.hoverScrollToBottomRequested = false;
    state.chatVisible = false;
    state.chatHoldExpanded = true;
    resetContextUsage();
    setThinkingStatus("");
    renderInputImageState();
    renderHoverMessages();
    void persistTabConversationNow();
    scheduleSync();
  }

  async function executeSlashCommand(commandId) {
    hideSlashCommandMenu({ render: false });
    if (elements.buttonHoverInput) {
      elements.buttonHoverInput.value = "";
    }
    state.inputImages = [];
    renderInputImageState();

    if (commandId === SLASH_COMMAND_IDS.NEW) {
      clearConversationInfo();
      window.requestAnimationFrame(() => elements.buttonHoverInput?.focus?.());
      return true;
    }

    if (commandId === SLASH_COMMAND_IDS.MODEL) {
      await showLlmProviderConfigForm();
      return true;
    }

    renderHoverMessages();
    scheduleSync();
    return false;
  }

  function handleSlashCommandKeydown(event) {
    if (event.isComposing) {
      return false;
    }

    if (event.key === "Escape" && state.commandMenu.visible) {
      event.preventDefault();
      event.stopPropagation();
      hideSlashCommandMenu();
      return true;
    }

    if (!state.commandMenu.visible) {
      return false;
    }

    const commands = getVisibleSlashCommands();
    if (!commands.length) {
      hideSlashCommandMenu();
      return false;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      state.commandMenu.activeIndex = (state.commandMenu.activeIndex + direction + commands.length) % commands.length;
      renderHoverMessages();
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const command = commands[state.commandMenu.activeIndex] || commands[0];
      void executeSlashCommand(command.id);
      return true;
    }

    return false;
  }

  function handleHoverInputChange(event) {
    updateSlashCommandMenuFromInput(event.currentTarget?.value || "");
  }

  function handleHoverInputFocus(event) {
    updateSlashCommandMenuFromInput(event.currentTarget?.value || "");
  }

  function renderSlashCommandMenu() {
    const commands = getVisibleSlashCommands();
    const row = document.createElement("div");
    row.className = "pig-chat-row is-tip is-command-menu";

    const menu = document.createElement("div");
    menu.className = "pig-chat-bubble pig-tip-message pig-command-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", t("command.menuAria"));

    commands.forEach((command, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `pig-command-item${index === state.commandMenu.activeIndex ? " is-active" : ""}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === state.commandMenu.activeIndex ? "true" : "false");
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.commandMenu.activeIndex = index;
        void executeSlashCommand(command.id);
      });

      const name = document.createElement("span");
      name.className = "pig-command-name";
      name.textContent = command.name;

      const description = document.createElement("span");
      description.className = "pig-command-description";
      description.textContent = command.description;

      item.append(name, description);
      menu.append(item);
    });

    row.append(menu);
    return row;
  }

  function renderHoverMessages() {
    if (!elements?.hoverMessages) {
      return;
    }

    const scrollSnapshot = getHoverMessagesScrollSnapshot();
    elements.hoverMessages.replaceChildren();
    let componentRow = null;
    if (state.commandMenu.visible) {
      componentRow = renderSlashCommandMenu();
    } else if (state.llmConfig.visible) {
      componentRow = window.DogeclawUI.renderLlmConfigForm({
        state,
        onSave: saveLlmConfig,
        onClose: closeLlmProviderConfigForm
      });
    } else if (state.channelConfig.visible) {
      componentRow = window.DogeclawUI.renderChannelConfigForm({
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

    if (state.commandMenu.visible || state.llmConfig.visible) {
      elements.hoverMessages.append(componentRow);
      componentInserted = true;
    } else {
      state.hoverMessages.forEach((message, index) => {
        const row =
          message.type === "tip"
            ? window.DogeclawUI.renderTipMessage({
                message,
                onAction: () => handleTipAction(message),
                onClose: () => removeHoverMessage(message.id)
              })
            : renderChatMessageRow(message);
        elements.hoverMessages.append(row);

        if (componentRow && index === componentAfterIndex) {
          elements.hoverMessages.append(componentRow);
          componentInserted = true;
        }
      });

      if (componentRow && !componentInserted) {
        elements.hoverMessages.append(componentRow);
      }
    }

    const visible =
      state.commandMenu.visible ||
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
      window.requestAnimationFrame(() => syncHoverMessagesScroll(scrollSnapshot));
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
        !state.commandMenu.visible &&
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

  function renderChatMessageRow(message) {
    const row = document.createElement("div");
    row.className = `pig-chat-row is-${message.side}${message.pending ? " is-pending" : ""}`;
    row.append(window.DogeclawUI.createChatBubble(message.text));
    return row;
  }

  function trimHoverMessagesToLimit() {
    if (state.hoverMessages.length <= MAX_HOVER_MESSAGES) {
      return;
    }

    state.hoverMessages = state.hoverMessages.slice(-MAX_HOVER_MESSAGES);
  }

  function requestHoverMessagesScrollToBottom() {
    state.hoverScrollToBottomRequested = true;
    state.hoverUserScrolled = false;
  }

  function getHoverMessagesScrollSnapshot() {
    const pinToBottomRequested = Boolean(state.hoverScrollToBottomRequested);
    state.hoverScrollToBottomRequested = false;

    if (!elements?.hoverMessages || elements.hoverMessages.hidden) {
      return { pinToBottom: true, scrollTop: 0 };
    }

    const maxScrollTop = Math.max(0, elements.hoverMessages.scrollHeight - elements.hoverMessages.clientHeight);
    return {
      pinToBottom:
        pinToBottomRequested ||
        (!state.hoverUserScrolled && (maxScrollTop <= 2 || maxScrollTop - elements.hoverMessages.scrollTop <= 24)),
      scrollTop: elements.hoverMessages.scrollTop
    };
  }

  function syncHoverMessagesScroll(scrollSnapshot = null) {
    if (!elements?.hoverMessages || elements.hoverMessages.hidden) {
      return;
    }

    updateHoverMessagesBounds();
    const maxScrollTop = Math.max(0, elements.hoverMessages.scrollHeight - elements.hoverMessages.clientHeight);
    elements.hoverMessages.classList.toggle("is-scrollable", maxScrollTop > 2);

    if (maxScrollTop <= 2) {
      elements.hoverMessages.scrollTop = 0;
      state.hoverUserScrolled = false;
      return;
    }

    if (!scrollSnapshot || scrollSnapshot.pinToBottom) {
      elements.hoverMessages.scrollTop = maxScrollTop;
      state.hoverUserScrolled = false;
      return;
    }

    elements.hoverMessages.scrollTop = Math.min(scrollSnapshot.scrollTop, maxScrollTop);
    state.hoverUserScrolled = maxScrollTop - elements.hoverMessages.scrollTop > 24;
  }

  function handleHoverMessagesScroll() {
    const scroller = elements?.hoverMessages;
    if (!scroller || scroller.hidden) {
      return;
    }

    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.classList.toggle("is-scrollable", maxScrollTop > 2);
    state.hoverUserScrolled = maxScrollTop > 2 && maxScrollTop - scroller.scrollTop > 24;
  }

  function isInteractiveHoverScrollTarget(target) {
    return Boolean(
      target?.closest?.(
        'a, button, input, textarea, select, option, label, [contenteditable="true"], [role="button"], .pig-config-button, .pig-config-input'
      )
    );
  }

  function stopHoverScrollDrag(event = null) {
    const drag = state.hoverScrollDrag;
    if (!drag.active) {
      return;
    }

    if (event?.currentTarget?.releasePointerCapture && event.pointerId === drag.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }

    drag.active = false;
    drag.pointerId = null;
    elements.hoverMessages?.classList.remove("is-drag-scrolling");
  }

  function handleHoverMessagesPointerDown(event) {
    const scroller = elements?.hoverMessages;
    const bubble = event.target?.closest?.(".pig-chat-bubble");
    if (!scroller || scroller.hidden || !bubble || !scroller.contains(bubble) || isInteractiveHoverScrollTarget(event.target)) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxScrollTop <= 2) {
      return;
    }

    const drag = state.hoverScrollDrag;
    drag.active = true;
    drag.moved = false;
    drag.pointerId = event.pointerId;
    drag.startY = event.clientY;
    drag.startScrollTop = scroller.scrollTop;
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {}
  }

  function handleHoverMessagesPointerMove(event) {
    const drag = state.hoverScrollDrag;
    const scroller = elements?.hoverMessages;
    if (!drag.active || !scroller || event.pointerId !== drag.pointerId) {
      return;
    }

    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < DRAG_START_THRESHOLD) {
      return;
    }

    drag.moved = true;
    drag.suppressClick = true;
    scroller.classList.add("is-drag-scrolling");

    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.min(maxScrollTop, Math.max(0, drag.startScrollTop - deltaY));
    state.hoverUserScrolled = maxScrollTop > 2 && maxScrollTop - scroller.scrollTop > 24;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleHoverMessagesPointerUp(event) {
    const drag = state.hoverScrollDrag;
    if (!drag.active || event.pointerId !== drag.pointerId) {
      return;
    }

    if (drag.moved) {
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => {
        state.hoverScrollDrag.suppressClick = false;
      }, 80);
    }
    stopHoverScrollDrag(event);
  }

  function handleHoverMessagesClick(event) {
    if (!state.hoverScrollDrag.suppressClick) {
      return;
    }

    state.hoverScrollDrag.suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
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
	      historyText: String(options.historyText || ""),
	      pending: Boolean(options.pending),
      includeInHistory: options.includeInHistory !== false
    };

    state.hoverMessages.push(item);

    trimHoverMessagesToLimit();
    requestHoverMessagesScrollToBottom();
    state.chatVisible = true;
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    renderHoverMessages();
    scheduleTabConversationPersist();
    return item.id;
  }

  function addHoverTip(options = {}) {
    const text = String(options.text || "").trim();
    if (!text) {
      return null;
    }

    const id = options.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const dismissAfterMs = Math.max(0, Number(options.dismissAfterMs) || 0);
    if (hoverTipDismissTimers.has(id)) {
      window.clearTimeout(hoverTipDismissTimers.get(id));
      hoverTipDismissTimers.delete(id);
    }

    const existing = state.hoverMessages.find((message) => message.id === id);
    const item = {
      id,
      type: "tip",
      sessionId: options.sessionId || state.pageConversationId,
      source: options.source || "page",
      side: "left",
      text,
      icon: options.icon ?? "logo",
      action: options.action || "",
      actionLabel: options.actionLabel || "",
      pending: false,
      includeInHistory: false
    };

    if (existing) {
      Object.assign(existing, item);
    } else {
      state.hoverMessages.push(item);
      trimHoverMessagesToLimit();
    }

    requestHoverMessagesScrollToBottom();
    state.chatVisible = true;
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    renderHoverMessages();
    scheduleTabConversationPersist();
    if (dismissAfterMs > 0) {
      const timerId = window.setTimeout(() => {
        hoverTipDismissTimers.delete(id);
        removeHoverMessage(id);
      }, dismissAfterMs);
      hoverTipDismissTimers.set(id, timerId);
    }
    return id;
  }

  function removeHoverMessage(id, options = {}) {
    if (hoverTipDismissTimers.has(id)) {
      window.clearTimeout(hoverTipDismissTimers.get(id));
      hoverTipDismissTimers.delete(id);
    }

    const index = state.hoverMessages.findIndex((message) => message.id === id);
    if (index < 0) {
      return false;
    }

    state.hoverMessages.splice(index, 1);
    if (!state.hoverMessages.length && !state.thinkingActive) {
      state.chatVisible = false;
      state.chatHoldExpanded = false;
    }
    if (options.render !== false) {
      renderHoverMessages();
      scheduleSync();
    }
    scheduleTabConversationPersist();
    return true;
  }

  function handleTipAction(message) {
    if (message.action === "open_llm_config") {
      removeHoverMessage(message.id, { render: false });
      openConfigPanel("llm");
      state.chatVisible = true;
      state.chatHoldExpanded = true;
      renderHoverMessages();
      scheduleSync();
    }
  }

  function updateHoverMessage(id, text, options = {}) {
    const item = state.hoverMessages.find((message) => message.id === id);
    if (!item) {
      return;
    }

    const wasPending = Boolean(item.pending);
    item.text = String(text || "").trim() || item.text;
    item.pending = options.pending ?? false;
    if (wasPending || item.pending) {
      requestHoverMessagesScrollToBottom();
    }
    if (item.pending) {
      state.chatVisible = true;
      if (state.chatHideTimer) {
        window.clearTimeout(state.chatHideTimer);
        state.chatHideTimer = 0;
      }
    }
    renderHoverMessages();
    scheduleTabConversationPersist();
  }

  function applyAgentUpdate(payload = {}) {
    const replyId = String(payload.replyId || "");
    const text = String(payload.text || "").trim();
    if (!replyId || !text) {
      return false;
    }

    applyContextUsage(payload.usage, { model: payload.model });
    const existing = state.hoverMessages.find((message) => message.id === replyId);
    state.chatVisible = true;
    state.chatHoldExpanded = true;
    if (payload.pending) {
      setThinkingStatus(t("status.generating"));
    } else {
      setThinkingStatus("");
    }

    if (existing) {
      updateHoverMessage(replyId, text, { pending: Boolean(payload.pending) });
      return true;
    }

    addHoverMessage(text, "left", {
      id: replyId,
      pending: Boolean(payload.pending),
      sessionId: state.pageConversationId,
      source: "page"
    });
    return true;
  }

  function getLlmHistory() {
    return state.hoverMessages
      .filter((message) => !message.pending && message.source !== "channel" && message.includeInHistory !== false)
      .map((message) => ({
        role: message.side === "left" ? "assistant" : "user",
        content: message.historyText || message.text
      }))
      .slice(-8);
  }

  function getImageAltText(image) {
    return String(image?.name || t("image.alt")).replace(/[\]\n\r]/g, " ").trim() || t("image.alt");
  }

  function normalizeInputImages(images) {
    return Array.isArray(images)
      ? images.filter((image) => image?.dataUrl && String(image.dataUrl).startsWith("data:image/"))
      : [];
  }

  function buildImageDisplayMessage(text, images = []) {
    const body = String(text || "").trim();
    const imageMarkdown = normalizeInputImages(images)
      .map((image) => `![${getImageAltText(image)}](${image.dataUrl})`)
      .join("\n\n");
    return [imageMarkdown, body].filter(Boolean).join("\n\n");
  }

  function buildImageHistoryText(text, images = []) {
    const body = String(text || "").trim();
    const selectedImages = normalizeInputImages(images);
    if (!selectedImages.length) {
      return body;
    }
    const imageHint = selectedImages.length === 1
      ? t("chat.imageHistory", { name: getImageAltText(selectedImages[0]) })
      : t("chat.imagesHistory", {
          count: selectedImages.length,
          names: selectedImages.map(getImageAltText).join(", ")
        });
    return [body, imageHint].filter(Boolean).join("\n\n");
  }

  function buildUserRequestContent(text, images = []) {
    const body = String(text || "").trim();
    const selectedImages = normalizeInputImages(images);
    if (!selectedImages.length) {
      return body;
    }

    return [
      {
        type: "text",
        text: body || (selectedImages.length === 1 ? t("chat.imageOnlyPrompt") : t("chat.imagesOnlyPrompt", { count: selectedImages.length }))
      },
      ...selectedImages.map((image) => ({
        type: "image_url",
        image_url: {
          url: image.dataUrl
        }
      }))
    ];
  }

  function hasRequestContent(content) {
    if (Array.isArray(content)) {
      return content.some((part) => {
        if (part?.type === "text") {
          return Boolean(String(part.text || "").trim());
        }
        if (part?.type === "image_url") {
          return Boolean(String(part.image_url?.url || "").trim());
        }
        return false;
      });
    }
    return Boolean(String(content || "").trim());
  }

  function restoreInputAfterReply() {
    state.chatHoldExpanded = true;
    if (state.chatHideTimer) {
      window.clearTimeout(state.chatHideTimer);
      state.chatHideTimer = 0;
    }
    scheduleSync();
  }

  function clearActiveReplyStop(stopReply) {
    if (activeReplyStop === stopReply) {
      activeReplyStop = null;
      scheduleSync();
    }
  }

  function stopCurrentReply(event = null) {
    if (!state.thinkingActive || typeof activeReplyStop !== "function") {
      return false;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    activeReplyStop();
    return true;
  }

  async function requestPetReply(message, history) {
    if (!hasRequestContent(message)) {
      return;
    }

    setThinkingStatus(t("status.understanding"));
    const replyId = addHoverMessage(t("chat.thinking"), "left", { pending: true });
    const requestId = `agent-${replyId}`;
    await persistTabConversationNow();
    let fullText = "";
    let settled = false;
    let port = null;
    let stopReply = null;
    const timeoutId = window.setTimeout(() => {
      completeReply(t("llm.timeout"));
      try {
        port?.disconnect();
      } catch {}
    }, 125000);

    function completeReply(fallbackText) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      setThinkingStatus("");
      restoreInputAfterReply();
      clearActiveReplyStop(stopReply);
      updateHoverMessage(replyId, fullText || fallbackText);
    }

    function finish() {
      completeReply(t("llm.empty"));
    }

    stopReply = () => {
      completeReply(t("llm.interrupted"));
      try {
        port?.disconnect();
      } catch {}
    };
    activeReplyStop = stopReply;
    scheduleSync();

    try {
      port = PLATFORM.runtime?.connect
        ? PLATFORM.runtime.connect({ name: "dogeclawChatStream" })
        : globalThis.chrome?.runtime?.connect({ name: "dogeclawChatStream" });
      if (!port) {
        throw new Error(t("runtime.portUnavailable"));
      }
      port.onMessage.addListener((payload) => {
        if (settled) {
          return;
        }

        if (payload?.type === "delta") {
          fullText += payload.delta || "";
          if (fullText.trim()) {
            setThinkingStatus(t("status.generating"));
          }
          updateHoverMessage(replyId, fullText || t("chat.thinking"), { pending: true });
          return;
        }

        if (payload?.type === "step") {
          handleAgentStep(payload.step);
          return;
        }

        if (payload?.type === "done") {
          applyContextUsage(payload.result?.usage, { model: payload.result?.model });
          finish();
          return;
        }

        if (payload?.type === "error") {
          completeReply(formatLlmErrorMessage(payload.error, fullText));
        }
      });
      port.onDisconnect.addListener(() => {
        consumeRuntimeLastError();
        if (!settled && !state.navigationInProgress) {
          finish();
        }
      });
      port.postMessage({
        type: "start",
        message,
        history,
        requestId,
        replyId
      });
    } catch (error) {
      completeReply(formatLlmErrorMessage(error?.message || String(error)));
    }
  }

  function fillTextToDogeclawInput(text) {
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

    const content = value.length > 12000 ? `${value.slice(0, 12000)}\n\n${t("chat.contentTruncated")}` : value;
    elements.buttonHoverInput.value = content;
    window.requestAnimationFrame(() => {
      elements.buttonHoverInput.focus();
      elements.buttonHoverInput.setSelectionRange(content.length, content.length);
    });
    return true;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) {
      return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }
    if (value >= 1024) {
      return `${Math.ceil(value / 1024)} KB`;
    }
    return `${value} B`;
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error(t("chat.imageReadFailed"))), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) {
      throw new Error(t("chat.imageReadFailed"));
    }
    const mimeType = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const body = isBase64 ? atob(match[3] || "") : decodeURIComponent(match[3] || "");
    const bytes = new Uint8Array(body.length);
    for (let index = 0; index < body.length; index += 1) {
      bytes[index] = body.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function createNamedImageFile(blob, name) {
    const fileName = String(name || t("image.alt")).trim() || t("image.alt");
    try {
      return new File([blob], fileName, { type: blob.type || "image/jpeg" });
    } catch {
      blob.name = fileName;
      return blob;
    }
  }

  function getImageFileNameFromUrl(url, mimeType = "") {
    try {
      const pathname = new URL(url).pathname;
      const name = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      if (name) {
        return name.slice(0, 160);
      }
    } catch {}
    const extension = String(mimeType || "").split("/")[1] || "jpg";
    return `image.${extension.replace(/[^a-z0-9.+-]/gi, "") || "jpg"}`;
  }

  function getImageDataUrlTotalLength(images) {
    return normalizeInputImages(images).reduce((total, image) => total + String(image.dataUrl || "").length, 0);
  }

  function getCompressedImageSize(width, height) {
    const sourceWidth = Math.max(1, Number(width) || 1);
    const sourceHeight = Math.max(1, Number(height) || 1);
    const scale = Math.min(1, INPUT_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale))
    };
  }

  function canvasToBlob(canvas, options) {
    if (canvas?.convertToBlob) {
      return canvas.convertToBlob(options);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(t("chat.imageReadFailed")));
        }
      }, options.type, options.quality);
    });
  }

  async function loadImageSource(file) {
    if (window.createImageBitmap) {
      const bitmap = await window.createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.()
      };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.addEventListener("load", () => resolve(element), { once: true });
        element.addEventListener("error", () => reject(new Error(t("chat.imageReadFailed"))), { once: true });
        element.src = objectUrl;
      });
      return {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function compressImageFile(file) {
      const loaded = await loadImageSource(file);
    try {
      const size = getCompressedImageSize(loaded.width, loaded.height);
      const canvas = window.OffscreenCanvas
        ? new window.OffscreenCanvas(size.width, size.height)
        : Object.assign(document.createElement("canvas"), size);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error(t("chat.imageReadFailed"));
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(loaded.source, 0, 0, size.width, size.height);

      const blob = await canvasToBlob(canvas, {
        type: "image/jpeg",
        quality: INPUT_IMAGE_COMPRESS_QUALITY
      });
      const dataUrl = await readBlobAsDataUrl(blob);
      return {
        dataUrl,
        name: file.name || t("image.alt"),
        mimeType: blob.type || "image/jpeg",
        size: blob.size || dataUrl.length,
        originalSize: file.size || 0,
        width: size.width,
        height: size.height
      };
    } finally {
      loaded.cleanup?.();
    }
  }

	  function renderInputImageState() {
	    if (!elements?.button) {
	      return;
	    }

    const supportsImageInput = state.llmConfig.imageInputSupported === true;
    if (!supportsImageInput && state.inputImages.length) {
      state.inputImages = [];
    }

    const images = supportsImageInput ? normalizeInputImages(state.inputImages).slice(0, INPUT_IMAGE_MAX_COUNT) : [];
    if (images.length !== state.inputImages.length) {
      state.inputImages = images;
    }

    elements.button.classList.toggle("supports-input-image", supportsImageInput);
    elements.button.classList.toggle("has-input-image", images.length > 0);
    if (elements.inputImagePreview) {
      elements.inputImagePreview.textContent = images.length ? String(images.length) : "";
      elements.inputImagePreview.title = images.length ? t("chat.imagesSelected", { count: images.length }) : "";
    }
    if (elements.inputImageChip) {
      elements.inputImageChip.title = images.map(getImageAltText).join(", ");
      elements.inputImageChip.setAttribute("aria-label", images.length ? t("chat.imagesSelected", { count: images.length }) : "");
    }
	    if (elements.inputImageFile) {
	      elements.inputImageFile.value = "";
	    }
    renderInputImageDragState();
	  }

  function isImageFile(file) {
    return Boolean(file && (/^image\//i.test(file.type || "") || IMAGE_FILE_EXTENSION_RE.test(file.name || "")));
  }

  function getImageFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return [];
    }

    const files = [];
    const seen = new Set();
    const appendFile = (file) => {
      if (!isImageFile(file)) {
        return;
      }
      const key = `${file.name || ""}:${file.size || 0}:${file.lastModified || 0}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      files.push(file);
    };

    Array.from(dataTransfer.items || []).forEach((item) => {
      if (item?.kind !== "file") {
        return;
      }
      try {
        appendFile(item.getAsFile?.());
      } catch {}
    });

    Array.from(dataTransfer.files || []).forEach(appendFile);
    return files;
  }

  function getImageUrlFromDataTransfer(dataTransfer) {
    if (!dataTransfer?.getData) {
      return "";
    }

    const customUrl = String(dataTransfer.getData("application/x-dogeclaw-image-url") || "").trim();
    if (customUrl) {
      return customUrl;
    }

    const uriList = String(dataTransfer.getData("text/uri-list") || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"));
    if (uriList) {
      return uriList;
    }

    const html = String(dataTransfer.getData("text/html") || "");
    const htmlUrl = html.match(/<img\b[^>]*\bsrc=["']([^"']+)/i)?.[1] || "";
    if (htmlUrl) {
      return htmlUrl;
    }

    const text = String(dataTransfer.getData("text/plain") || "").trim();
    return /^(https?:|data:image\/|blob:)/i.test(text) ? text : "";
  }

  function hasImageDragData(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }

    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item?.kind === "file" && (!item.type || /^image\//i.test(item.type || "")))) {
      return true;
    }

    const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
    return types.includes("files") || Array.from(dataTransfer.files || []).some(isImageFile);
  }

  function isImageUploadAvailable() {
    return Boolean(state.floatingEnabled && state.llmConfig.imageInputSupported === true && elements?.button);
  }

  function isInputImageDropTarget(target) {
    return Boolean(target && elements?.buttonInputShell?.contains?.(target));
  }

  function getDraggedPageImageUrl(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    const image = element?.closest?.("img, picture source, a[href]");
    if (!image) {
      return "";
    }

    const isImageElement = image.matches?.("img, picture source");
    const rawUrl =
      image.currentSrc ||
      image.src ||
      image.srcset?.split?.(",")?.[0]?.trim?.().split(/\s+/)[0] ||
      image.href ||
      "";
    const url = String(rawUrl || "").trim();
    return url && (isImageElement || /^data:image\//i.test(url) || IMAGE_FILE_EXTENSION_RE.test(url.split(/[?#]/)[0] || "")) ? url : "";
  }

  async function imageUrlToFile(url) {
    const imageUrl = String(url || "").trim();
    if (!imageUrl) {
      throw new Error(t("chat.imageReadFailed"));
    }

    if (/^data:image\//i.test(imageUrl)) {
      const blob = dataUrlToBlob(imageUrl);
      return createNamedImageFile(blob, getImageFileNameFromUrl("image", blob.type));
    }

    if (/^blob:/i.test(imageUrl)) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      if (!/^image\//i.test(blob.type || "")) {
        throw new Error(t("chat.imageInvalid"));
      }
      return createNamedImageFile(blob, getImageFileNameFromUrl(imageUrl, blob.type));
    }

    const response = await safeSendRuntimeMessage({ type: "fetchImageAsDataUrl", url: imageUrl });
    if (!response?.ok || !response.result?.dataUrl) {
      throw new Error(response?.error || t("chat.imageReadFailed"));
    }

    const blob = dataUrlToBlob(response.result.dataUrl);
    return createNamedImageFile(blob, response.result.fileName || getImageFileNameFromUrl(imageUrl, response.result.mimeType || blob.type));
  }

  function renderInputImageDragState() {
    if (!elements?.button) {
      return;
    }

    const active = state.inputImageDrag.active && isImageUploadAvailable();
    const overDropTarget = active && state.inputImageDrag.overDropTarget;
    elements.button.classList.toggle("is-input-image-dragging", active);
    elements.button.classList.toggle("is-input-image-drop-target", overDropTarget);
    if (elements.buttonHoverInput) {
      elements.buttonHoverInput.placeholder = active
        ? t(overDropTarget ? "chat.dropImageReadyPlaceholder" : "chat.dropImagePlaceholder")
        : t("chat.inputPlaceholder");
    }
  }

  function scheduleInputImageDragReset() {
    if (state.inputImageDrag.resetTimer) {
      window.clearTimeout(state.inputImageDrag.resetTimer);
    }
    state.inputImageDrag.resetTimer = window.setTimeout(() => {
      state.inputImageDrag.resetTimer = 0;
      setInputImageDragState(false);
    }, INPUT_IMAGE_DRAG_RESET_MS);
  }

  function setInputImageDragState(active, options = {}) {
    const nextActive = Boolean(active && isImageUploadAvailable());
    const nextOverDropTarget = Boolean(nextActive && options.overDropTarget);
    const changed =
      state.inputImageDrag.active !== nextActive ||
      state.inputImageDrag.overDropTarget !== nextOverDropTarget;

    if (nextActive && !state.inputImageDrag.active) {
      state.inputImageDrag.restoreChatHoldExpanded = state.chatHoldExpanded;
      state.chatHoldExpanded = true;
      updateButtonExpansionSide();
    }

    if (!nextActive && state.inputImageDrag.active) {
      state.chatHoldExpanded = state.inputImageDrag.restoreChatHoldExpanded;
      state.inputImageDrag.restoreChatHoldExpanded = false;
      state.inputImageDrag.overDropTarget = false;
      state.inputImageDrag.imageUrl = "";
      if (state.inputImageDrag.resetTimer) {
        window.clearTimeout(state.inputImageDrag.resetTimer);
        state.inputImageDrag.resetTimer = 0;
      }
    }

    state.inputImageDrag.active = nextActive;
    state.inputImageDrag.overDropTarget = nextOverDropTarget;
    if (nextActive && options.imageUrl) {
      state.inputImageDrag.imageUrl = String(options.imageUrl || "").trim();
    }
    renderInputImageDragState();
    if (changed) {
      scheduleSync();
    }
  }

  function isLeavingViewport(event) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    return Number.isFinite(x) && Number.isFinite(y) && (x <= 0 || y <= 0 || x >= window.innerWidth || y >= window.innerHeight);
  }

  function clearInputImages() {
    state.inputImages = [];
    renderInputImageState();
    scheduleSync();
  }

  function showImageLimitTip() {
    addHoverTip({
      id: IMAGE_LIMIT_TIP_ID,
      text: t("chat.imageLimit", { count: INPUT_IMAGE_MAX_COUNT }),
      icon: false,
      dismissAfterMs: TRANSIENT_TIP_DISMISS_MS
    });
  }

  function showTransientTip(id, text) {
    addHoverTip({
      id,
      text,
      icon: false,
      dismissAfterMs: TRANSIENT_TIP_DISMISS_MS
    });
  }

	  async function addInputImageFiles(files) {
	    files = Array.from(files || []);
	    if (!files.length) {
	      return;
	    }

    if (state.llmConfig.imageInputSupported !== true) {
      state.inputImages = [];
      addHoverMessage(t("llm.imageUnsupported"), "left", { includeInHistory: false });
      renderInputImageState();
      return;
    }

    const existingImages = normalizeInputImages(state.inputImages);
    const availableCount = Math.max(0, INPUT_IMAGE_MAX_COUNT - existingImages.length);
    if (!availableCount) {
      showImageLimitTip();
      renderInputImageState();
      return;
    }

    const selectedFiles = files.slice(0, availableCount);
    if (files.length > availableCount) {
      showImageLimitTip();
    }

    const nextImages = [];
    let totalDataUrlLength = getImageDataUrlTotalLength(existingImages);
    for (const file of selectedFiles) {
      if (!/^image\//i.test(file.type || "")) {
        addHoverMessage(t("chat.imageInvalid"), "left", { includeInHistory: false });
        continue;
      }

      try {
        const image = await compressImageFile(file);
        if (!image.dataUrl.startsWith("data:image/")) {
          throw new Error(t("chat.imageInvalid"));
        }
        if (image.dataUrl.length > INPUT_IMAGE_DATA_URL_MAX_LENGTH) {
          addHoverMessage(t("chat.imageCompressedTooLarge", { size: formatBytes(INPUT_IMAGE_DATA_URL_MAX_LENGTH) }), "left", { includeInHistory: false });
          continue;
        }
        if (totalDataUrlLength + image.dataUrl.length > INPUT_IMAGES_TOTAL_DATA_URL_MAX_LENGTH) {
          addHoverMessage(t("chat.imagesTotalTooLarge", { size: formatBytes(INPUT_IMAGES_TOTAL_DATA_URL_MAX_LENGTH) }), "left", { includeInHistory: false });
          continue;
        }
        totalDataUrlLength += image.dataUrl.length;
        nextImages.push(image);
      } catch (error) {
        showTransientTip("dogeclaw-image-read-failed-tip", t("chat.imageReadFailed", { error: error?.message || String(error) }));
      }
    }

    if (!nextImages.length) {
      renderInputImageState();
      return;
    }

    state.inputImages = existingImages.concat(nextImages).slice(0, INPUT_IMAGE_MAX_COUNT);
    state.chatVisible = true;
    state.chatHoldExpanded = true;
	    renderInputImageState();
	    scheduleSync();
	    window.requestAnimationFrame(() => elements.buttonHoverInput?.focus?.());
	  }

  async function addInputImageUrls(urls) {
    const files = [];
    for (const url of Array.from(urls || [])) {
      try {
        files.push(await imageUrlToFile(url));
      } catch (error) {
        showTransientTip("dogeclaw-image-read-failed-tip", t("chat.imageReadFailed", { error: error?.message || String(error) }));
      }
    }
    if (files.length) {
      await addInputImageFiles(files);
    } else {
      renderInputImageState();
    }
  }

  async function handleInputImageChange(event) {
    await addInputImageFiles(Array.from(event.currentTarget?.files || []));
  }

  function handleDocumentImageDragEnter(event) {
    if (!isImageUploadAvailable() && !state.inputImageDrag.active) {
      return;
    }

    if (!state.inputImageDrag.active && !hasImageDragData(event.dataTransfer) && !getDraggedPageImageUrl(event.target)) {
      return;
    }

    setInputImageDragState(true, {
      overDropTarget: isInputImageDropTarget(event.target)
    });
    scheduleInputImageDragReset();
  }

  function handleDocumentImageDragOver(event) {
    if (!isImageUploadAvailable() && !state.inputImageDrag.active) {
      return;
    }

    if (!state.inputImageDrag.active && !hasImageDragData(event.dataTransfer) && !getDraggedPageImageUrl(event.target)) {
      return;
    }

    const overDropTarget = isInputImageDropTarget(event.target);
    setInputImageDragState(true, { overDropTarget });
    scheduleInputImageDragReset();
    if (overDropTarget) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }
  }

  function handleDocumentImageDragLeave(event) {
    if (!state.inputImageDrag.active) {
      return;
    }

    if (isLeavingViewport(event)) {
      setInputImageDragState(false);
    }
  }

  async function handleDocumentImageDrop(event) {
    if (!state.inputImageDrag.active && !hasImageDragData(event.dataTransfer) && !getDraggedPageImageUrl(event.target)) {
      return;
    }

    const overDropTarget = isInputImageDropTarget(event.target);
    const files = getImageFilesFromDataTransfer(event.dataTransfer);
    const imageUrl =
      state.inputImageDrag.imageUrl ||
      getImageUrlFromDataTransfer(event.dataTransfer) ||
      getDraggedPageImageUrl(event.target);
    if (overDropTarget && isImageUploadAvailable()) {
      event.preventDefault();
      event.stopPropagation();
      setInputImageDragState(false);
      state.chatHoldExpanded = true;
      scheduleSync();
      if (files.length) {
        await addInputImageFiles(files);
      } else if (imageUrl) {
        await addInputImageUrls([imageUrl]);
      } else {
        showTransientTip("dogeclaw-image-drop-invalid-tip", t("chat.imageInvalid"));
      }
      return;
    }

    setInputImageDragState(false);
  }

  function handleDocumentImageDragStart(event) {
    const imageUrl = getDraggedPageImageUrl(event.target);
    if (!isImageUploadAvailable() || !imageUrl) {
      return;
    }

    try {
      event.dataTransfer?.setData?.("application/x-dogeclaw-image-url", imageUrl);
    } catch {}

    setInputImageDragState(true, {
      overDropTarget: isInputImageDropTarget(event.target),
      imageUrl
    });
    scheduleInputImageDragReset();
  }

	  async function sendTextToDogeclaw(text, images = []) {
	    const value = String(text || "").trim();
	    const requestImages = state.llmConfig.imageInputSupported === true ? normalizeInputImages(images).slice(0, INPUT_IMAGE_MAX_COUNT) : [];
	    if (!value && !requestImages.length) {
	      return false;
	    }

	    syncPageConversationId();
	    const history = getLlmHistory();
	    const displayMessage = buildImageDisplayMessage(value, requestImages);
	    const historyText = buildImageHistoryText(value, requestImages);
	    const requestContent = buildUserRequestContent(value, requestImages);
	    addHoverMessage(displayMessage, "right", {
	      sessionId: state.pageConversationId,
	      source: "page",
	      historyText
	    });
	    await requestPetReply(requestContent, history);
	    return true;
	  }

  async function handleHoverInputKeydown(event) {
    if (handleSlashCommandKeydown(event)) {
      return;
    }

    if (event.key !== "Enter" || event.isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

	    const input = event.currentTarget;
	    const value = input.value.trim();
	    const images = normalizeInputImages(state.inputImages);
	    if (!value && !images.length) {
	      return;
	    }

    if (await showLlmConfigIfNeeded()) {
      window.requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(value.length, value.length);
      });
      return;
    }

	    input.value = "";
	    state.inputImages = [];
	    renderInputImageState();
	    await sendTextToDogeclaw(value, images);
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
      hideChatImmediatelyForDrag();
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
    button.style.setProperty("--pig-chat-button-gap", `${CHAT_MESSAGES_BUTTON_GAP}px`);
    button.title = t("chat.dragHint");

    const buttonAura = document.createElement("span");
    buttonAura.className = "pig-fab-aura";

    const buttonIconWrap = document.createElement("span");
    buttonIconWrap.className = "pig-icon-wrap";
    buttonIconWrap.setAttribute("role", "button");
    buttonIconWrap.tabIndex = 0;
    buttonIconWrap.title = t("chat.dragHint");

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
    const tearLeft = svgElement("g", { class: "pig-tear pig-tear-left", opacity: 0 });
    tearLeft.append(
      svgElement("rect", { x: 8, y: 11, width: 1, height: 4, fill: "#5bbcff" }),
      svgElement("rect", { x: 9, y: 13, width: 1, height: 3, fill: "#8fd8ff" }),
      svgElement("rect", { x: 8, y: 16, width: 2, height: 1, fill: "#5bbcff" })
    );
    const tearRight = svgElement("g", { class: "pig-tear pig-tear-right", opacity: 0 });
    tearRight.append(
      svgElement("rect", { x: 16, y: 11, width: 1, height: 4, fill: "#5bbcff" }),
      svgElement("rect", { x: 15, y: 13, width: 1, height: 3, fill: "#8fd8ff" }),
      svgElement("rect", { x: 15, y: 16, width: 2, height: 1, fill: "#5bbcff" })
    );

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
      tearLeft,
      tearRight,
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
    const inputImageButton = document.createElement("button");
    inputImageButton.className = "pig-input-image-button";
    inputImageButton.type = "button";
    inputImageButton.title = t("chat.uploadImage");
    inputImageButton.setAttribute("aria-label", t("chat.uploadImage"));
    const inputImageIcon = svgElement("svg", {
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    });
    inputImageIcon.append(
      svgElement("path", {
        d: "M21.4 11.6l-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
    inputImageButton.append(inputImageIcon);

    const inputImageFile = document.createElement("input");
    inputImageFile.className = "pig-input-image-file";
    inputImageFile.type = "file";
    inputImageFile.accept = "image/*";
    inputImageFile.multiple = true;

    const inputImageChip = document.createElement("span");
    inputImageChip.className = "pig-input-image-chip";
    const inputImagePreview = document.createElement("span");
    inputImagePreview.className = "pig-input-image-preview";
    inputImagePreview.setAttribute("aria-hidden", "true");
    const inputImageRemove = document.createElement("button");
    inputImageRemove.className = "pig-input-image-remove";
    inputImageRemove.type = "button";
    inputImageRemove.title = t("chat.removeImage");
    inputImageRemove.setAttribute("aria-label", t("chat.removeImage"));
    const inputImageRemoveIcon = svgElement("svg", {
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    });
    inputImageRemoveIcon.append(
      svgElement("path", {
        d: "M6 6l12 12M18 6L6 18",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round"
      })
    );
    inputImageRemove.append(inputImageRemoveIcon);
    inputImageChip.append(inputImagePreview, inputImageRemove);

    const buttonInputShell = document.createElement("span");
    buttonInputShell.className = "pig-hover-input-shell";
    buttonInputShell.title = "";

		    const buttonHoverInput = document.createElement("input");
		    buttonHoverInput.type = "text";
    buttonHoverInput.className = "pig-hover-input";
    buttonHoverInput.placeholder = t("chat.inputPlaceholder");
    buttonHoverInput.setAttribute("aria-label", t("chat.inputAria"));
    buttonHoverInput.autocomplete = "off";
    buttonHoverInput.title = "";
    buttonInputShell.append(inputImageButton, inputImageChip, buttonHoverInput, inputImageFile);

    const hoverMessages = document.createElement("div");
    hoverMessages.className = "pig-chat-messages";
    hoverMessages.hidden = true;
    hoverMessages.title = "";

	    buttonStatus.append(buttonStatusDot);
	    buttonCopy.append(buttonInputShell);

    const tailTip = document.createElement("span");
    tailTip.className = "pig-tail-tip";

    button.append(hoverMessages, buttonAura, buttonIconWrap, buttonCopy, buttonStatus, tailTip);
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
    buttonStatus.addEventListener("pointerdown", (event) => {
      if (state.thinkingActive && activeReplyStop) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    buttonStatus.addEventListener("click", stopCurrentReply);
    buttonStatus.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        stopCurrentReply(event);
      }
    });
    buttonIconWrap.addEventListener("pointerdown", onPointerDown);
    buttonIconWrap.addEventListener("pointermove", onPointerMove);
    buttonIconWrap.addEventListener("pointerup", onPointerUp);
    buttonIconWrap.addEventListener("pointercancel", onPointerUp);
    hoverMessages.addEventListener("scroll", handleHoverMessagesScroll, { passive: true });
    hoverMessages.addEventListener("pointerdown", handleHoverMessagesPointerDown);
    hoverMessages.addEventListener("pointermove", handleHoverMessagesPointerMove);
    hoverMessages.addEventListener("pointerup", handleHoverMessagesPointerUp);
	    hoverMessages.addEventListener("pointercancel", stopHoverScrollDrag);
	    hoverMessages.addEventListener("click", handleHoverMessagesClick, true);
    inputImageButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.llmConfig.imageInputSupported !== true) {
        return;
      }
      inputImageFile.click();
    });
	    inputImageFile.addEventListener("change", handleInputImageChange);
    inputImageRemove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearInputImages();
      window.requestAnimationFrame(() => elements.buttonHoverInput?.focus?.());
	    });
	    buttonHoverInput.addEventListener("input", handleHoverInputChange);
	    buttonHoverInput.addEventListener("focus", handleHoverInputFocus);
	    buttonHoverInput.addEventListener("keydown", handleHoverInputKeydown);
    document.addEventListener("dragenter", handleDocumentImageDragEnter, true);
    document.addEventListener("dragstart", handleDocumentImageDragStart, true);
    document.addEventListener("dragover", handleDocumentImageDragOver, true);
    document.addEventListener("dragleave", handleDocumentImageDragLeave, true);
    document.addEventListener("drop", handleDocumentImageDrop, true);
    document.addEventListener("dragend", () => setInputImageDragState(false), true);
	    window.addEventListener("resize", handleWindowResize);

    return {
      root,
	      button,
      buttonLabel: null,
      buttonIconWrap,
      buttonInputShell,
	      buttonHoverInput,
      buttonStatus,
      buttonStatusDot,
      inputImageButton,
      inputImageFile,
      inputImageChip,
      inputImagePreview,
	      inputImageRemove,
	      hoverMessages,
      buttonPupils: [leftPupil, rightPupil],
      buttonEyes: [leftEye, rightEye],
      buttonNose: nose,
      buttonMouth: mouth,
      buttonTongue: tongue,
      buttonBlushes: [blushLeft, blushRight],
      buttonTears: [tearLeft, tearRight],
      buttonTailTip: tailTip,
      buttonEarLeft: earLeft,
      buttonEarRight: earRight,
      buttonHeadGroup: headGroup,
      buttonBrowLeft: browLeft,
      buttonBrowRight: browRight,
      buttonBubbles
    };
  }

  function startMountWatchdog() {
    window.setInterval(() => {
      ensureUiMounted();
      if (state.chatVisible || state.thinkingActive || state.llmConfig.visible || state.channelConfig.visible) {
        syncUI();
      }
    }, MOUNT_WATCHDOG_INTERVAL);
  }

  async function start() {
    await loadFloatingButtonVisibility();
    await loadTabConversationHistory();
    ensureUiMounted();
    applySavedPosition();
    refreshLlmConfigStatus()
      .then(() => {
        renderInputImageState();
        scheduleSync();
      })
      .catch(() => null);
    if (state.hoverMessages.length) {
      renderHoverMessages();
      scheduleSync();
    }
    startMountWatchdog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
