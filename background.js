const APP_CONFIG = globalThis.DogeclawConfig || {};
const PLATFORM = globalThis.DogeclawPlatform || {};
const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
const STORAGE_CONFIG = APP_CONFIG.storage || {};
const CONTENT_CONFIG = APP_CONFIG.content || {};
const BACKGROUND_CONFIG = APP_CONFIG.background || {};
const CHANNEL_CONFIG = APP_CONFIG.channel || {};
const WECHAT_CONFIG = APP_CONFIG.wechat || {};
const BROWSER_CONFIG = APP_CONFIG.browser || {};
const FLOATING_BUTTON_STATE_KEY_PREFIX = STORAGE_CONFIG.floatingButtonStateKeyPrefix || "dogeclaw-floating-enabled:";
const SEND_SELECTION_MENU_ID = BACKGROUND_CONFIG.sendSelectionMenuId || "dogeclaw-send-selection";
const CHANNEL_POLL_ALARM = BACKGROUND_CONFIG.channelPollAlarm || "dogeclaw-channel-poll";
const CHANNEL_HISTORY_KEY = STORAGE_CONFIG.channelHistoryKey || "dogeclaw-channel-history";
const CHANNEL_SEEN_KEY = STORAGE_CONFIG.channelSeenKey || "dogeclaw-channel-seen";
const TAB_CONVERSATION_KEY_PREFIX = STORAGE_CONFIG.tabConversationKeyPrefix || "dogeclaw-tab-conversation:";
const CHANNEL_HISTORY_LIMIT = CHANNEL_CONFIG.historyLimit || 12;
const CHANNEL_SEEN_LIMIT = CHANNEL_CONFIG.seenLimit || 200;
const CONTENT_SCRIPT_FILES = CONTENT_CONFIG.scriptFiles || [
  "config.js",
  "pet.js",
  "ui.js",
  "content/styles.js",
  "content/browser-actions.js",
  "content/index.js"
];
const CHANNEL_ALARM_PERIOD_MINUTES = CHANNEL_CONFIG.alarmPeriodMinutes || 0.5;
const CHANNEL_FAST_POLL_DELAY_MS = CHANNEL_CONFIG.fastPollDelayMs || 250;
const CHANNEL_EMPTY_POLL_DELAY_MS = CHANNEL_CONFIG.emptyPollDelayMs || 2000;
const CHANNEL_DEFAULT_ACTIVE_POLL_DURATION_MS = CHANNEL_CONFIG.defaultActivePollDurationMs || 180000;
const CHANNEL_CONFIRMED_ACTIVE_POLL_DURATION_MS = CHANNEL_CONFIG.confirmedActivePollDurationMs || 300000;
const CHANNEL_LOGIN_POLL_DURATION_MS = CHANNEL_CONFIG.loginPollDurationMs || 300000;
const CHANNEL_LOGIN_POLL_INITIAL_DELAY_MS = CHANNEL_CONFIG.loginPollInitialDelayMs || 1200;
const CHANNEL_LOGIN_POLL_INTERVAL_MS = CHANNEL_CONFIG.loginPollIntervalMs || 2500;
const CHANNEL_MIN_LONG_POLL_TIMEOUT_MS = CHANNEL_CONFIG.minLongPollTimeoutMs || 5000;
const TAB_CONVERSATION_MESSAGE_TEXT_LIMIT = STORAGE_CONFIG.tabConversationMessageTextLimit || 16000;
const TAB_CONVERSATION_IMAGE_DATA_URL_LIMIT =
  STORAGE_CONFIG.tabConversationImageDataUrlLimit || BROWSER_CONFIG.screenshotDataUrlLimit || 1200000;
const DATA_IMAGE_MARKDOWN_RE = /!\[([^\]\n\r]*)]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/;
const WECHAT_DEFAULT_LONG_POLL_TIMEOUT_MS = WECHAT_CONFIG.defaultLongPollTimeoutMs || 35000;
const WECHAT_MAX_LONG_POLL_TIMEOUT_MS = WECHAT_CONFIG.maxLongPollTimeoutMs || 35000;
const WECHAT_CONFIG_CACHE_TTL_MS = WECHAT_CONFIG.configCacheTtlMs || 24 * 60 * 60 * 1000;
const WECHAT_CONFIG_CACHE_INITIAL_RETRY_MS = WECHAT_CONFIG.configCacheInitialRetryMs || 2000;
const WECHAT_CONFIG_CACHE_MAX_RETRY_MS = WECHAT_CONFIG.configCacheMaxRetryMs || 60 * 60 * 1000;
const WECHAT_TYPING_KEEPALIVE_INTERVAL_MS = WECHAT_CONFIG.typingKeepaliveIntervalMs || 5000;
const WECHAT_TYPING_STATUS = {
  TYPING: WECHAT_CONFIG.typingStatus?.typing || 1,
  CANCEL: WECHAT_CONFIG.typingStatus?.cancel || 2
};
let channelPollRunning = false;
let channelActivePollUntil = 0;
let channelActivePollTimer = 0;
let wechatNextPollTimeoutMs = WECHAT_DEFAULT_LONG_POLL_TIMEOUT_MS;
let lastWechatPollMessageCount = 0;
let wechatLoginPollUntil = 0;
let wechatLoginPollTimer = 0;
let wechatLoginWaitRunning = false;
const wechatUserConfigCache = new Map();

function getLocalStorage() {
  const storage = PLATFORM.storage?.local;
  if (!storage?.get || !storage?.set || !storage?.remove) {
    throw new Error("Extension storage API unavailable");
  }
  return storage;
}

function getTabConversationStorage() {
  return PLATFORM.storage?.session || getLocalStorage();
}

function getTabConversationKey(tabId) {
  return `${TAB_CONVERSATION_KEY_PREFIX}${tabId}`;
}

function getSenderTabId(sender) {
  const tabId = Number(sender?.tab?.id || 0);
  return Number.isInteger(tabId) && tabId > 0 ? tabId : 0;
}

function consumeRuntimeLastError() {
  try {
    return globalThis.chrome?.runtime?.lastError?.message || PLATFORM.api?.runtime?.lastError?.message || "";
  } catch {
    return "";
  }
}

function isImageInputUnsupportedError(error) {
  const message = String(error || "");
  return /(image_url|image input|vision|multimodal)/i.test(message)
    && /(unknown variant|expected text|unsupported|not support|does not support|invalid type|only text)/i.test(message);
}

function normalizeTabConversationMessageText(message) {
  const text = String(message?.text || "");
  if (DATA_IMAGE_MARKDOWN_RE.test(text)) {
    return text.length <= TAB_CONVERSATION_IMAGE_DATA_URL_LIMIT ? text : "";
  }
  return text.slice(0, TAB_CONVERSATION_MESSAGE_TEXT_LIMIT);
}

function normalizeTabConversation(payload = {}) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const maxMessages = CONTENT_CONFIG.maxHoverMessages || 24;
  return {
    version: 1,
    url: String(payload.url || "").slice(0, 2048),
    pageConversationId: String(payload.pageConversationId || "").slice(0, 2048),
    chatVisible: Boolean(payload.chatVisible),
    chatHoldExpanded: Boolean(payload.chatHoldExpanded),
    savedAt: Number(payload.savedAt) || Date.now(),
    messages: messages.slice(-maxMessages).map((message) => ({
      id: String(message?.id || ""),
      type: message?.type === "tip" ? "tip" : "message",
      sessionId: String(message?.sessionId || ""),
      source: String(message?.source || "page"),
      side: message?.side === "left" ? "left" : "right",
      text: normalizeTabConversationMessageText(message),
      historyText: String(message?.historyText || "").slice(0, 16000),
      icon: message?.icon === false || message?.icon === null ? false : String(message?.icon ?? "logo").slice(0, 2048),
      action: String(message?.action || "").slice(0, 128),
      actionLabel: String(message?.actionLabel || "").slice(0, 128),
      pending: Boolean(message?.pending),
      includeInHistory: message?.includeInHistory !== false
    })).filter((message) => message.id && message.text)
  };
}

async function getTabConversation(tabId) {
  const key = getTabConversationKey(tabId);
  const result = await getTabConversationStorage().get(key);
  return result[key] || null;
}

async function setTabConversation(tabId, payload) {
  const conversation = normalizeTabConversation(payload);
  await getTabConversationStorage().set({ [getTabConversationKey(tabId)]: conversation });
  return conversation;
}

async function patchTabConversationMessage(tabId, replyId, patch = {}) {
  if (!tabId || !replyId) {
    return null;
  }

  const existing = await getTabConversation(tabId);
  const messages = Array.isArray(existing?.messages) ? existing.messages.slice() : [];
  const index = messages.findIndex((message) => message.id === replyId);
  const nextMessage = {
    id: replyId,
    sessionId: existing?.pageConversationId || "",
    source: "page",
    side: "left",
    text: "",
    icon: "logo",
    action: "",
    actionLabel: "",
    pending: false,
    includeInHistory: true,
    ...(index >= 0 ? messages[index] : {}),
    ...patch
  };

  if (index >= 0) {
    messages[index] = nextMessage;
  } else {
    messages.push(nextMessage);
  }

  let currentUrl = existing?.url || "";
  try {
    currentUrl = (await PLATFORM.tabs?.get?.(tabId))?.url || currentUrl;
  } catch {}

  return setTabConversation(tabId, {
    ...(existing || {}),
    url: currentUrl,
    chatVisible: true,
    messages
  });
}

async function sendAgentUpdateToTab(tabId, payload) {
  if (!tabId || !PLATFORM.tabs?.sendMessage) {
    return;
  }

  try {
    await PLATFORM.tabs.sendMessage(tabId, {
      type: "dogeclawAgentUpdate",
      ...payload
    });
  } catch {}
}

async function logChannelDebug(event, details = {}) {
  console.log(`[dogeclaw wechat] ${event}`, details);
}

function getPageStateKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return `${FLOATING_BUTTON_STATE_KEY_PREFIX}${parsed.href}`;
  } catch {
    return `${FLOATING_BUTTON_STATE_KEY_PREFIX}${String(url || "")}`;
  }
}

async function getFloatingButtonEnabled(url) {
  const key = getPageStateKey(url);
  const result = await getLocalStorage().get(key);
  return result[key] !== false;
}

async function setFloatingButtonEnabled(url, enabled) {
  const key = getPageStateKey(url);
  await getLocalStorage().set({ [key]: Boolean(enabled) });
  return Boolean(enabled);
}

function canToggleFloatingButton(url) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

async function sendMessageToTab(tabId, payload) {
  try {
    return await PLATFORM.tabs.sendMessage(tabId, payload);
  } catch {
    return null;
  }
}

async function setActionToggleBadge(tabId, enabled) {
  await PLATFORM.action.setBadgeBackgroundColor({
    tabId,
    color: enabled ? "#2563eb" : "#6b7280"
  });
  await PLATFORM.action.setBadgeText({
    tabId,
    text: enabled ? "" : "OFF"
  });
  await PLATFORM.action.setTitle({
    tabId,
    title: enabled ? t("action.hide") : t("action.show")
  });
}

async function ensureContentScriptInjected(tabId) {
  const existing = await sendMessageToTab(tabId, { type: "getFloatingButtonVisible" });
  if (existing?.ok) {
    return true;
  }

  await PLATFORM.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
  return true;
}

function createContextMenus() {
  if (!PLATFORM.contextMenus?.create) {
    return;
  }

  PLATFORM.contextMenus.removeAll().then(() => {
    return PLATFORM.contextMenus.create({
      id: SEND_SELECTION_MENU_ID,
      title: t("context.sendSelection"),
      contexts: ["selection"]
    });
  }).catch((error) => console.warn("Failed to create context menu:", error));
}

function startChannelPolling() {
  PLATFORM.alarms?.create?.(CHANNEL_POLL_ALARM, {
    periodInMinutes: CHANNEL_ALARM_PERIOD_MINUTES
  })?.catch?.((error) => console.warn("Failed to start channel polling:", error));
  logChannelDebug("alarm scheduled", { periodInMinutes: CHANNEL_ALARM_PERIOD_MINUTES });
}

function kickChannelPolling(durationMs = CHANNEL_DEFAULT_ACTIVE_POLL_DURATION_MS) {
  channelActivePollUntil = Math.max(channelActivePollUntil, Date.now() + durationMs);
  logChannelDebug("active poll kicked", { durationMs });
  if (!channelActivePollTimer) {
    channelActivePollTimer = setTimeout(runActiveChannelPoll, 0);
  }
}

function kickWechatLoginPolling(durationMs = CHANNEL_LOGIN_POLL_DURATION_MS) {
  wechatLoginPollUntil = Math.max(wechatLoginPollUntil, Date.now() + durationMs);
  logChannelDebug("login poll kicked", { durationMs });
  if (!wechatLoginPollTimer) {
    wechatLoginPollTimer = setTimeout(runWechatLoginPoll, CHANNEL_LOGIN_POLL_INITIAL_DELAY_MS);
  }
  runWechatLoginWait("kick");
}

async function runWechatLoginPoll() {
  wechatLoginPollTimer = 0;
  const confirmed = await pollWechatLoginIfPending("timer");
  if (confirmed) {
    return;
  }

  if (Date.now() < wechatLoginPollUntil) {
    wechatLoginPollTimer = setTimeout(runWechatLoginPoll, CHANNEL_LOGIN_POLL_INTERVAL_MS);
  }
}

async function runWechatLoginWait(reason = "wait") {
  const runtime = globalThis.DogeclawWechatChannel;
  if (wechatLoginWaitRunning || !runtime?.waitForLogin) {
    return false;
  }

  wechatLoginWaitRunning = true;
  try {
    await logChannelDebug("login wait start", { reason });
    const result = await runtime.waitForLogin({ timeoutMs: WECHAT_CONFIG.defaultLoginWaitTimeoutMs });
    const config = await runtime.getConfig();
    await logChannelDebug("login wait done", {
      reason,
      connected: Boolean(result?.connected),
      status: result?.status || "",
      message: result?.message || "",
      enabled: Boolean(config?.enabled),
      hasToken: Boolean(config?.token)
    });
    if (result?.connected || (config?.enabled && config?.token)) {
      await sendChannelConfigStatusToTabs("wechat", {
        status: "confirmed",
        message: t("channel.wechatConfigured")
      });
      kickChannelPolling(CHANNEL_CONFIRMED_ACTIVE_POLL_DURATION_MS);
      return true;
    }
  } catch (error) {
    await logChannelDebug("login wait error", {
      reason,
      message: error?.message || String(error)
    });
  } finally {
    wechatLoginWaitRunning = false;
  }
  return false;
}

async function pollWechatLoginIfPending(reason = "poll") {
  const runtime = globalThis.DogeclawWechatChannel;
  if (!runtime?.checkLoginStatus || !runtime?.getLoginState || !runtime?.getConfig) {
    await logChannelDebug("login poll skipped runtime missing", { reason });
    return false;
  }

  try {
    const config = await runtime.getConfig();
    if (config.enabled && config.token) {
      return false;
    }

    const login = await runtime.getLoginState();
    if (!login?.qrcode || login.status === "confirmed" || login.status === "expired") {
      await logChannelDebug("login poll skipped no pending login", {
        reason,
        status: login?.status || "",
        hasQrcode: Boolean(login?.qrcode)
      });
      return false;
    }

    const result = await runtime.checkLoginStatus();
    const nextConfig = await runtime.getConfig();
    await logChannelDebug("login poll result", {
      reason,
      status: result?.status || "",
      message: result?.message || "",
      hasQrcode: Boolean(result?.qrcode),
      hasTokenConfigured: Boolean(nextConfig?.token),
      enabled: Boolean(nextConfig?.enabled),
      statusPayload: result?.lastStatusPayload || null
    });
    if (result?.status === "confirmed") {
      await sendChannelConfigStatusToTabs("wechat", result);
      kickChannelPolling(CHANNEL_CONFIRMED_ACTIVE_POLL_DURATION_MS);
      return true;
    }
    if (result?.status === "pending" || result?.status === "wait" || result?.status === "scaned" || result?.status === "scaned_but_redirect") {
      runWechatLoginWait(reason);
    }
  } catch (error) {
    await logChannelDebug("login poll error", {
      reason,
      message: error?.message || String(error)
    });
  }

  return false;
}

async function runActiveChannelPoll() {
  channelActivePollTimer = 0;
  const startedAt = Date.now();
  await logChannelDebug("active poll tick");
  await pollChannels();
  if (await shouldKeepFastChannelPolling()) {
    const durationMs = Date.now() - startedAt;
    const delayMs = durationMs < 1000 && lastWechatPollMessageCount === 0
      ? CHANNEL_EMPTY_POLL_DELAY_MS
      : CHANNEL_FAST_POLL_DELAY_MS;
    channelActivePollTimer = setTimeout(runActiveChannelPoll, delayMs);
  }
}

async function shouldKeepFastChannelPolling() {
  if (Date.now() < channelActivePollUntil) {
    return true;
  }

  try {
    const runtime = globalThis.DogeclawWechatChannel;
    const config = await runtime?.getConfig?.();
    return Boolean(config?.enabled && config?.token);
  } catch {
    return false;
  }
}

async function getChannelHistory(channel, conversationId) {
  const result = await getLocalStorage().get(CHANNEL_HISTORY_KEY);
  const all = result[CHANNEL_HISTORY_KEY] && typeof result[CHANNEL_HISTORY_KEY] === "object" ? result[CHANNEL_HISTORY_KEY] : {};
  const key = `${channel}:${conversationId}`;
  return Array.isArray(all[key]) ? all[key] : [];
}

async function setChannelHistory(channel, conversationId, history) {
  const result = await getLocalStorage().get(CHANNEL_HISTORY_KEY);
  const all = result[CHANNEL_HISTORY_KEY] && typeof result[CHANNEL_HISTORY_KEY] === "object" ? result[CHANNEL_HISTORY_KEY] : {};
  const key = `${channel}:${conversationId}`;
  all[key] = history.slice(-CHANNEL_HISTORY_LIMIT);
  await getLocalStorage().set({ [CHANNEL_HISTORY_KEY]: all });
}

async function hasSeenChannelMessage(messageId) {
  if (!messageId) {
    return false;
  }
  const result = await getLocalStorage().get(CHANNEL_SEEN_KEY);
  const seen = Array.isArray(result[CHANNEL_SEEN_KEY]) ? result[CHANNEL_SEEN_KEY] : [];
  return seen.includes(messageId);
}

async function markSeenChannelMessage(messageId) {
  if (!messageId) {
    return;
  }
  const result = await getLocalStorage().get(CHANNEL_SEEN_KEY);
  const seen = Array.isArray(result[CHANNEL_SEEN_KEY]) ? result[CHANNEL_SEEN_KEY] : [];
  const next = seen.filter((item) => item !== messageId);
  next.push(messageId);
  await getLocalStorage().set({ [CHANNEL_SEEN_KEY]: next.slice(-CHANNEL_SEEN_LIMIT) });
}

function getUpdateList(payload) {
  const data = payload?.data || payload || {};
  return data.msgs || data.updates || data.messages || data.items || data.list || payload?.msgs || payload?.updates || [];
}

function normalizeWechatUpdate(update = {}) {
  const message = update.message || update.msg || update;
  const itemList = Array.isArray(message.item_list) ? message.item_list : [];
  const textItem = Array.isArray(message.item_list)
    ? message.item_list.find((item) => item?.type === 1 && item?.text_item?.text != null)
    : null;
  const text =
    (globalThis.DogeclawWechatMedia?.bodyFromItemList ? DogeclawWechatMedia.bodyFromItemList(itemList) : "") ||
    textItem?.text_item?.text ||
    message.text?.content ||
    message.text ||
    message.content ||
    message.msg ||
    message.body ||
    update.text?.content ||
    update.content ||
    "";
  const mediaItems = itemList.filter((item) => [2, 3, 4, 5].includes(Number(item?.type)));
  const mediaText = mediaItems.map((item) => {
    if (item.type === 2) return "[图片]";
    if (item.type === 3) return item.voice_item?.text || "[语音]";
    if (item.type === 4) return `[文件: ${item.file_item?.file_name || "未命名文件"}]`;
    if (item.type === 5) return "[视频]";
    return "[媒体]";
  });
  const content = [String(text || "").trim(), ...mediaText].filter(Boolean).join("\n").trim();
  const fromUser =
    message.from_user_id ||
    message.from_user ||
    message.fromUser ||
    message.from ||
    message.openid ||
    message.sender ||
    update.from_user ||
    update.openid ||
    update.sender ||
    "";
  const id =
    message.message_id ||
    message.msgid ||
    message.msg_id ||
    message.id ||
    message.seq ||
    update.update_id ||
    update.id ||
    `${fromUser}:${String(content || text).slice(0, 80)}:${message.create_time || message.create_time_ms || update.create_time || ""}`;

  return {
    id: String(id || ""),
    fromUser: String(fromUser || ""),
    text: content,
    rawText: String(text || "").trim(),
    attachments: [],
    mediaCount: mediaItems.length,
    contextToken: String(message.context_token || ""),
    message,
    raw: update
  };
}

async function sendChannelConfigStatusToTabs(channel, status) {
  const tabs = await PLATFORM.tabs.query({ active: true, currentWindow: true });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !canToggleFloatingButton(tab.url || "")) {
        return;
      }
      try {
        await setFloatingButtonEnabled(tab.url, true);
        await ensureContentScriptInjected(tab.id);
        await sendMessageToTab(tab.id, {
          type: "channelConfigStatus",
          channel,
          status
        });
        await setActionToggleBadge(tab.id, true);
      } catch {}
    })
  );
}

async function getWechatUserConfig(userId, contextToken = "") {
  const now = Date.now();
  const cacheKey = String(userId || "");
  const cached = wechatUserConfigCache.get(cacheKey);
  if (cached && now < cached.nextFetchAt) {
    return cached.config;
  }

  let fetchOk = false;
  try {
    const response = await DogeclawWechatChannel.getBotConfig({
      ilinkUserId: cacheKey,
      contextToken
    });
    if (response?.ret === undefined || response.ret === 0) {
      const config = {
        typingTicket: response?.typing_ticket || ""
      };
      wechatUserConfigCache.set(cacheKey, {
        config,
        everSucceeded: true,
        nextFetchAt: now + Math.random() * WECHAT_CONFIG_CACHE_TTL_MS,
        retryDelayMs: WECHAT_CONFIG_CACHE_INITIAL_RETRY_MS
      });
      fetchOk = true;
      await logChannelDebug("wechat user config cached", {
        userId: cacheKey,
        ret: response?.ret,
        errmsg: response?.errmsg || "",
        hasTypingTicket: Boolean(config.typingTicket)
      });
      return config;
    }
    await logChannelDebug("wechat getconfig not ready", {
      userId: cacheKey,
      ret: response?.ret,
      errmsg: response?.errmsg || "",
      hasTypingTicket: Boolean(response?.typing_ticket)
    });
  } catch (error) {
    await logChannelDebug("wechat getconfig error", {
      userId: cacheKey,
      error: error?.message || String(error)
    });
  }

  if (!fetchOk) {
    const previousDelay = cached?.retryDelayMs || WECHAT_CONFIG_CACHE_INITIAL_RETRY_MS;
    const nextDelay = Math.min(previousDelay * 2, WECHAT_CONFIG_CACHE_MAX_RETRY_MS);
    wechatUserConfigCache.set(cacheKey, {
      config: cached?.config || { typingTicket: "" },
      everSucceeded: Boolean(cached?.everSucceeded),
      nextFetchAt: now + (cached ? nextDelay : WECHAT_CONFIG_CACHE_INITIAL_RETRY_MS),
      retryDelayMs: nextDelay
    });
  }

  return wechatUserConfigCache.get(cacheKey)?.config || { typingTicket: "" };
}

async function startWechatTypingIndicator(normalized) {
  if (!globalThis.DogeclawWechatChannel?.sendTyping || !globalThis.DogeclawWechatChannel?.getBotConfig) {
    return async () => {};
  }

  const userId = normalized.fromUser;
  if (!userId) {
    return async () => {};
  }

  const userConfig = await getWechatUserConfig(userId, normalized.contextToken);
  const typingTicket = userConfig.typingTicket || "";
  if (!typingTicket) {
    await logChannelDebug("typing skipped no ticket", {
      userId,
      messageId: normalized.id
    });
    return async () => {};
  }

  let stopped = false;
  const send = async (status) => {
    return DogeclawWechatChannel.sendTyping({
      ilinkUserId: userId,
      typingTicket,
      status
    });
  };

  try {
    const response = await send(WECHAT_TYPING_STATUS.TYPING);
    await logChannelDebug("typing start", {
      userId,
      messageId: normalized.id,
      ret: response?.ret,
      errmsg: response?.errmsg || ""
    });
  } catch (error) {
    await logChannelDebug("typing start error", {
      userId,
      messageId: normalized.id,
      error: error?.message || String(error)
    });
    return async () => {};
  }

  const keepaliveTimer = setInterval(() => {
    if (stopped) {
      return;
    }
    send(WECHAT_TYPING_STATUS.TYPING).catch((error) => {
      logChannelDebug("typing keepalive error", {
        userId,
        messageId: normalized.id,
        error: error?.message || String(error)
      });
    });
  }, WECHAT_TYPING_KEEPALIVE_INTERVAL_MS);

  return async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(keepaliveTimer);
    try {
      const response = await send(WECHAT_TYPING_STATUS.CANCEL);
      await logChannelDebug("typing stop", {
        userId,
        messageId: normalized.id,
        ret: response?.ret,
        errmsg: response?.errmsg || ""
      });
    } catch (error) {
      await logChannelDebug("typing stop error", {
        userId,
        messageId: normalized.id,
        error: error?.message || String(error)
      });
    }
  };
}

async function handleWechatIncomingMessage(update) {
  const startedAt = Date.now();
  const normalized = normalizeWechatUpdate(update);
  await logChannelDebug("incoming normalized", {
    id: normalized.id,
    fromUser: normalized.fromUser,
    textLength: normalized.text.length,
    mediaCount: normalized.mediaCount || 0,
    hasContextToken: Boolean(normalized.contextToken)
  });
  if (!normalized.text || !normalized.fromUser || await hasSeenChannelMessage(normalized.id)) {
    return false;
  }

  await markSeenChannelMessage(normalized.id);
  try {
    const prepared = await DogeclawWechatChannel.prepareIncomingMessage(normalized.message, {
      label: `message ${normalized.id}`
    });
    normalized.rawText = prepared.text || normalized.rawText;
    normalized.text = prepared.content || normalized.text;
    normalized.attachments = Array.isArray(prepared.attachments) ? prepared.attachments : [];
    await logChannelDebug("incoming media prepared", {
      id: normalized.id,
      attachmentCount: normalized.attachments.length,
      contentLength: normalized.text.length,
      attachmentTypes: normalized.attachments.map((item) => item.type || "media")
    });
  } catch (error) {
    await logChannelDebug("incoming media prepare error", {
      id: normalized.id,
      error: error?.message || String(error)
    });
  }
  const stopTyping = await startWechatTypingIndicator(normalized);
  try {
    const history = await getChannelHistory("wechat", normalized.fromUser);
    const channelHistory = [
      {
        role: "system",
        content: t("agent.wechatInstruction")
      },
      ...history
    ];
    let reply = "";
    try {
      const result = await DogeclawAgent.runTurn({
        message: normalized.text,
        history: channelHistory,
        tools: true,
        toolContext: {
          channel: "wechat",
          conversationId: normalized.fromUser
        }
      });
      reply = String(result.content || "").trim();
      await logChannelDebug("agent reply done", {
        messageId: normalized.id,
        fromUser: normalized.fromUser,
        durationMs: Date.now() - startedAt,
        replyLength: reply.length,
        empty: !reply
      });
    } catch (error) {
      await logChannelDebug("agent reply error", {
        messageId: normalized.id,
        fromUser: normalized.fromUser,
        error: error?.message || String(error),
        stack: error?.stack || ""
      });
      reply = t("agent.processFailed", { error: error?.message || String(error) });
    }
    const mediaArtifacts = globalThis.DogeclawBrowser?.drainArtifacts
      ? DogeclawBrowser.drainArtifacts({ scope: `wechat:${normalized.fromUser}` })
      : [];
    if (!reply && mediaArtifacts.length) {
      reply = t("agent.done");
    }
    if (!reply) {
      reply = t("agent.emptyReply");
    }

    await setChannelHistory("wechat", normalized.fromUser, [
      ...history,
      { role: "user", content: normalized.text },
      { role: "assistant", content: reply }
    ]);
    await logChannelDebug("channel session updated", {
      sessionId: `wechat:${normalized.fromUser}`,
      historyLength: Math.min(history.length + 2, CHANNEL_HISTORY_LIMIT)
    });

    const sendStartedAt = Date.now();
    await DogeclawWechatChannel.sendMessage({
      toUser: normalized.fromUser,
      content: reply,
      mediaList: mediaArtifacts.map((artifact) => ({
        kind: "image",
        dataUrl: artifact.dataUrl,
        mimeType: artifact.mimeType || "image/png",
        fileName: `${artifact.title || "screenshot"}.${artifact.mimeType === "image/jpeg" ? "jpg" : "png"}`
      })),
      contextToken: normalized.contextToken
    });
    await logChannelDebug("sendmessage done", {
      messageId: normalized.id,
      toUser: normalized.fromUser,
      mediaCount: mediaArtifacts.length,
      durationMs: Date.now() - sendStartedAt,
      totalDurationMs: Date.now() - startedAt
    });
  } catch (error) {
    await logChannelDebug("wechat message handling error", {
      messageId: normalized.id,
      toUser: normalized.fromUser,
      error: error?.message || String(error),
      stack: error?.stack || ""
    });
    return false;
  } finally {
    await stopTyping();
  }
  return true;
}

async function pollWechatChannel() {
  if (!globalThis.DogeclawWechatChannel?.getConfig) {
    await logChannelDebug("poll skipped runtime missing");
    return false;
  }
  const config = await DogeclawWechatChannel.getConfig();
  if (!config.enabled || !config.token) {
    await logChannelDebug("poll skipped config", {
      enabled: config.enabled,
      hasToken: Boolean(config.token)
    });
    return false;
  }

  await logChannelDebug("getupdates start", {
    apiBase: config.apiBase,
    accountId: config.accountId || "",
    hasToken: Boolean(config.token),
    timeoutMs: wechatNextPollTimeoutMs
  });
  const startedAt = Date.now();
  const payload = await DogeclawWechatChannel.getUpdates({
    limit: 10,
    timeoutMs: Math.min(
      Math.max(Number(wechatNextPollTimeoutMs) || WECHAT_DEFAULT_LONG_POLL_TIMEOUT_MS, CHANNEL_MIN_LONG_POLL_TIMEOUT_MS),
      WECHAT_MAX_LONG_POLL_TIMEOUT_MS
    )
  });
  if (payload?.longpolling_timeout_ms != null && Number(payload.longpolling_timeout_ms) > 0) {
    wechatNextPollTimeoutMs = Math.min(
      Math.max(Number(payload.longpolling_timeout_ms) || WECHAT_DEFAULT_LONG_POLL_TIMEOUT_MS, CHANNEL_MIN_LONG_POLL_TIMEOUT_MS),
      WECHAT_MAX_LONG_POLL_TIMEOUT_MS
    );
  }
  const updates = getUpdateList(payload);
  lastWechatPollMessageCount = updates.length;
  await logChannelDebug("getupdates done", {
    ret: payload?.ret,
    errcode: payload?.errcode,
    errmsg: payload?.errmsg || "",
    messageCount: updates.length,
    hasNextBuf: Boolean(payload?.get_updates_buf || payload?.sync_buf),
    durationMs: Date.now() - startedAt,
    nextTimeoutMs: wechatNextPollTimeoutMs
  });
  for (const update of updates) {
    await handleWechatIncomingMessage(update);
  }
  return true;
}

async function pollChannels() {
  if (channelPollRunning) {
    await logChannelDebug("poll skipped already running");
    return false;
  }
  channelPollRunning = true;
  try {
    await logChannelDebug("poll start");
    await pollWechatLoginIfPending("channel poll");
    await pollWechatChannel();
    await logChannelDebug("poll done");
    return true;
  } catch (error) {
    console.warn("Failed to poll channels:", error);
    await logChannelDebug("poll error", {
      message: error?.message || String(error),
      stack: error?.stack || ""
    });
    return false;
  } finally {
    channelPollRunning = false;
  }
}

PLATFORM.runtime?.onInstalled?.addListener((details) => {
  createContextMenus();
  startChannelPolling();
});

PLATFORM.runtime?.onStartup?.addListener(() => {
  createContextMenus();
  startChannelPolling();
});

if (PLATFORM.alarms?.onAlarm) {
  PLATFORM.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === CHANNEL_POLL_ALARM) {
      pollChannels();
    }
    return false;
  });
}

createContextMenus();
startChannelPolling();
kickChannelPolling(CHANNEL_DEFAULT_ACTIVE_POLL_DURATION_MS);

PLATFORM.action?.onClicked?.addListener(async (tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  if (!canToggleFloatingButton(tab.url)) {
    return;
  }

  try {
    const currentEnabled = await getFloatingButtonEnabled(tab.url);
    const nextEnabled = !currentEnabled;

    await setFloatingButtonEnabled(tab.url, nextEnabled);

    await ensureContentScriptInjected(tab.id);

    await sendMessageToTab(tab.id, {
      type: "setFloatingButtonVisible",
      enabled: nextEnabled
    });
    await setActionToggleBadge(tab.id, nextEnabled);
  } catch (error) {
    console.error("Failed to toggle dogeclaw:", error);
  }
});

if (PLATFORM.contextMenus?.onClicked) {
  PLATFORM.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== SEND_SELECTION_MENU_ID) {
      return;
    }

    const selectionText = String(info.selectionText || "").trim();
    if (!selectionText || !tab?.id || !tab.url || !canToggleFloatingButton(tab.url)) {
      return;
    }

    try {
      await setFloatingButtonEnabled(tab.url, true);
      await ensureContentScriptInjected(tab.id);
      await sendMessageToTab(tab.id, {
        type: "setFloatingButtonVisible",
        enabled: true
      });
      await sendMessageToTab(tab.id, {
        type: "sendSelectionToDogeclaw",
        text: selectionText
      });
      await setActionToggleBadge(tab.id, true);
    } catch (error) {
      console.error("Failed to send selection to dogeclaw:", error);
    }
  });
}

PLATFORM.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (message?.type === "getFloatingButtonEnabled" && message.url) {
    getFloatingButtonEnabled(message.url)
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, enabled: true, error: String(error) }));
    return true;
  }

  if (message?.type === "setFloatingButtonEnabled" && message.url) {
    setFloatingButtonEnabled(message.url, message.enabled)
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, enabled: true, error: String(error) }));
    return true;
  }

  if (message?.type === "getTabConversation") {
    const tabId = getSenderTabId(sender);
    if (!tabId) {
      sendResponse({ ok: false, error: "tab id is unavailable", conversation: null });
      return false;
    }
    getTabConversation(tabId)
      .then((conversation) => sendResponse({ ok: true, conversation }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error), conversation: null }));
    return true;
  }

  if (message?.type === "setTabConversation") {
    const tabId = getSenderTabId(sender);
    if (!tabId) {
      sendResponse({ ok: false, error: "tab id is unavailable" });
      return false;
    }
    setTabConversation(tabId, message.conversation || {})
      .then((conversation) => sendResponse({ ok: true, conversation }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "getLlmConfig") {
    DogeclawLLM.getConfigStatus()
      .then(({ config, userConfigured }) => sendResponse({
        ok: true,
        userConfigured,
        config: {
          ...config,
          apiKey: config.apiKey ? "configured" : ""
        }
      }))
      .catch((error) => sendResponse({ ok: false, error: String(error), config: null }));
    return true;
  }

  if (message?.type === "setLlmConfig") {
    DogeclawLLM.setConfig(message.config)
      .then(() => DogeclawLLM.getConfigStatus())
      .then(({ config, userConfigured }) => sendResponse({
        ok: true,
        userConfigured,
        config: {
          ...config,
          apiKey: config.apiKey ? "configured" : ""
        }
      }))
      .catch((error) => sendResponse({ ok: false, error: String(error), config: null }));
    return true;
  }

  if (message?.type === "channelConfig") {
    const runtime = message.channel === "wechat" ? globalThis.DogeclawWechatChannel : null;
    if (!runtime?.execute) {
      sendResponse({ ok: false, error: `Unknown channel: ${message.channel || ""}` });
      return false;
    }
    const channelActionMap = {
      start_config: "start_login",
      check_config: "check_login"
    };
    const action = channelActionMap[message.action] || message.action;
    runtime.execute({
      action,
      ...(message.payload || {})
    })
      .then(async (result) => {
        if (message.channel === "wechat") {
          await logChannelDebug("channel config action", {
            action,
            status: result?.status || "",
            message: result?.message || "",
            hasQrcode: Boolean(result?.qrcode),
            statusPayload: result?.lastStatusPayload || null
          });
        }
        if (message.channel === "wechat" && (action === "check_login" || action === "start_login")) {
          if (result?.status === "confirmed") {
            await sendChannelConfigStatusToTabs("wechat", result);
            kickChannelPolling(CHANNEL_CONFIRMED_ACTIVE_POLL_DURATION_MS);
          } else if (action === "start_login" || result?.status === "pending" || result?.status === "wait" || result?.status === "scaned") {
            kickWechatLoginPolling(CHANNEL_LOGIN_POLL_DURATION_MS);
            runWechatLoginWait(action);
          } else {
            pollChannels();
          }
        }
        sendResponse({ ok: true, result });
      })
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "chatWithDogeclaw") {
    DogeclawAgent.runTurn({
      message: message.message,
      history: message.history
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});

function normalizeAgentStepForPort(step = {}) {
  const calls = Array.isArray(step.calls)
    ? step.calls.map((call) => ({
        id: call.id || "",
        name: call.name || "",
        arguments: call.arguments || {}
      }))
    : [];

  const results = Array.isArray(step.results)
    ? step.results.map((result) => ({
        role: result.role || "tool",
        tool_call_id: result.tool_call_id || "",
        content: String(result.content || "").slice(0, 500)
      }))
    : [];

  return {
    type: step.type || "",
    iteration: Number(step.iteration) || 0,
    direct: Boolean(step.direct),
    ...(calls.length ? { calls } : {}),
    ...(results.length ? { results } : {})
  };
}

PLATFORM.runtime?.onConnect?.addListener((port) => {
  if (port.name !== "dogeclawChatStream") {
    return;
  }

  let disconnected = false;
  let controller = null;
  let latestText = "";
  const tabId = getSenderTabId(port.sender);
  const toolContext = {
    tabId,
    keepRunningAfterDisconnect: false
  };

  function formatStreamError(rawError) {
    const isAbort = /aborted|body stream buffer/i.test(rawError);
    if (isAbort) {
      return latestText || t("llm.interrupted");
    }
    if (rawError.includes("API key")) {
      return t("llm.missingKey");
    }
    if (isImageInputUnsupportedError(rawError)) {
      return t("llm.imageUnsupported");
    }
    return t("llm.failed", { error: rawError || t("llm.requestFailed") });
  }

  async function persistDetachedReply(message, patch) {
    if (!toolContext.keepRunningAfterDisconnect || !message?.replyId) {
      return;
    }

    const text = String(patch.text || "").trim();
    if (!text) {
      return;
    }

    await patchTabConversationMessage(tabId, message.replyId, {
      text,
      pending: Boolean(patch.pending)
    });
    await sendAgentUpdateToTab(tabId, {
      requestId: message.requestId || "",
      replyId: message.replyId,
      text,
      pending: Boolean(patch.pending)
    });
  }

  port.onDisconnect.addListener(() => {
    consumeRuntimeLastError();
    disconnected = true;
    if (!toolContext.keepRunningAfterDisconnect) {
      controller?.abort();
    }
  });

  port.onMessage.addListener((message) => {
    if (message?.type !== "start") {
      return;
    }

    controller = new AbortController();
    DogeclawAgent.runTurnStream({
      message: message.message,
      history: message.history,
      signal: controller.signal,
      toolContext,
      onDelta: (delta, accumulated) => {
        latestText = accumulated || `${latestText}${delta || ""}`;
        if (!disconnected) {
          port.postMessage({ type: "delta", delta });
        }
      },
      onStep: (step) => {
        if (!disconnected) {
          port.postMessage({ type: "step", step: normalizeAgentStepForPort(step) });
        }
      },
      onDone: (result) => {
        latestText = String(result?.content || latestText || "").trim();
        if (disconnected) {
          persistDetachedReply(message, {
            text: latestText || t("llm.empty"),
            pending: false
          }).catch(() => null);
          return;
        }

        if (!disconnected) {
          port.postMessage({ type: "done", result });
          port.disconnect();
        }
      }
    }).catch((error) => {
      const rawError = error?.message || String(error);
      if (disconnected) {
        persistDetachedReply(message, {
          text: formatStreamError(rawError),
          pending: false
        }).catch(() => null);
        return;
      }

      const isAbort = error?.name === "AbortError" || /aborted|body stream buffer/i.test(rawError);
      port.postMessage({ type: "error", error: isAbort ? t("llm.interrupted") : rawError });
      port.disconnect();
    });
  });
});
