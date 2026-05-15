importScripts("config.js", "i18n.js", "llm.js", "browser.js", "vendor/qrcode-generator.js", "channels/wechat.js", "tools.js", "agent.js");

const APP_CONFIG = globalThis.OnecaiConfig || {};
const t = (key, params) => (globalThis.OnecaiI18n?.t ? globalThis.OnecaiI18n.t(key, params) : key);
const STORAGE_CONFIG = APP_CONFIG.storage || {};
const CONTENT_CONFIG = APP_CONFIG.content || {};
const BACKGROUND_CONFIG = APP_CONFIG.background || {};
const CHANNEL_CONFIG = APP_CONFIG.channel || {};
const WECHAT_CONFIG = APP_CONFIG.wechat || {};
const SAVED_IMAGES_KEY = STORAGE_CONFIG.savedImagesKey || "page-image-gallery-saved-images";
const MAX_SAVED_IMAGES = BACKGROUND_CONFIG.maxSavedImages || 60;
const FLOATING_BUTTON_STATE_KEY_PREFIX = STORAGE_CONFIG.floatingButtonStateKeyPrefix || "page-image-gallery-floating-enabled:";
const SEND_SELECTION_MENU_ID = BACKGROUND_CONFIG.sendSelectionMenuId || "onecai-send-selection";
const COMMAND_POLL_ALARM = BACKGROUND_CONFIG.commandPollAlarm || "page-image-gallery-command-poll";
const CHANNEL_POLL_ALARM = BACKGROUND_CONFIG.channelPollAlarm || "onecai-channel-poll";
const CHANNEL_HISTORY_KEY = STORAGE_CONFIG.channelHistoryKey || "onecai-channel-history";
const CHANNEL_SEEN_KEY = STORAGE_CONFIG.channelSeenKey || "onecai-channel-seen";
const LEGACY_CHANNEL_DEBUG_LOG_KEY = STORAGE_CONFIG.channelDebugLogKey || "onecai-channel-debug-log";
const CHANNEL_HISTORY_LIMIT = CHANNEL_CONFIG.historyLimit || 12;
const CHANNEL_SEEN_LIMIT = CHANNEL_CONFIG.seenLimit || 200;
const CONTENT_SCRIPT_FILES = CONTENT_CONFIG.scriptFiles || ["config.js", "pet.js", "ui.js", "content.js"];
const CHANNEL_ALARM_PERIOD_MINUTES = CHANNEL_CONFIG.alarmPeriodMinutes || 0.5;
const CHANNEL_FAST_POLL_DELAY_MS = CHANNEL_CONFIG.fastPollDelayMs || 250;
const CHANNEL_EMPTY_POLL_DELAY_MS = CHANNEL_CONFIG.emptyPollDelayMs || 2000;
const CHANNEL_DEFAULT_ACTIVE_POLL_DURATION_MS = CHANNEL_CONFIG.defaultActivePollDurationMs || 180000;
const CHANNEL_CONFIRMED_ACTIVE_POLL_DURATION_MS = CHANNEL_CONFIG.confirmedActivePollDurationMs || 300000;
const CHANNEL_LOGIN_POLL_DURATION_MS = CHANNEL_CONFIG.loginPollDurationMs || 300000;
const CHANNEL_LOGIN_POLL_INITIAL_DELAY_MS = CHANNEL_CONFIG.loginPollInitialDelayMs || 1200;
const CHANNEL_LOGIN_POLL_INTERVAL_MS = CHANNEL_CONFIG.loginPollIntervalMs || 2500;
const CHANNEL_MIN_LONG_POLL_TIMEOUT_MS = CHANNEL_CONFIG.minLongPollTimeoutMs || 5000;
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

chrome.storage?.local?.remove?.(LEGACY_CHANNEL_DEBUG_LOG_KEY)?.catch?.(() => null);

async function logChannelDebug(event, details = {}) {
  console.log(`[dogeclaw wechat] ${event}`, details);
}

function sanitizeFilenamePart(value, fallback) {
  const sanitized = String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return sanitized || fallback;
}

function inferFormat(url, providedFormat) {
  if (providedFormat) {
    return providedFormat.toLowerCase();
  }

  if (typeof url !== "string") {
    return "img";
  }

  if (url.startsWith("data:image/")) {
    const match = url.match(/^data:image\/([a-zA-Z0-9.+-]+);/);
    return match?.[1]?.toLowerCase() || "png";
  }

  const withoutQuery = url.split("#")[0].split("?")[0];
  const ext = withoutQuery.split(".").pop();
  return ext && ext !== withoutQuery ? ext.toLowerCase() : "img";
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
  const result = await chrome.storage.local.get(key);
  return result[key] !== false;
}

async function setFloatingButtonEnabled(url, enabled) {
  const key = getPageStateKey(url);
  await chrome.storage.local.set({ [key]: Boolean(enabled) });
  return Boolean(enabled);
}

function canToggleFloatingButton(url) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

async function sendMessageToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    return null;
  }
}

async function setActionToggleBadge(tabId, enabled) {
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: enabled ? "#2563eb" : "#6b7280"
  });
  await chrome.action.setBadgeText({
    tabId,
    text: enabled ? "" : "OFF"
  });
  await chrome.action.setTitle({
    tabId,
    title: enabled ? t("action.hide") : t("action.show")
  });
}

async function ensureContentScriptInjected(tabId) {
  const existing = await sendMessageToTab(tabId, { type: "getFloatingButtonVisible" });
  if (existing?.ok) {
    return true;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
  return true;
}

async function getSavedImages() {
  const result = await chrome.storage.local.get(SAVED_IMAGES_KEY);
  return Array.isArray(result[SAVED_IMAGES_KEY]) ? result[SAVED_IMAGES_KEY] : [];
}

async function setSavedImages(items) {
  await chrome.storage.local.set({
    [SAVED_IMAGES_KEY]: items.slice(0, MAX_SAVED_IMAGES)
  });
}

async function recordSavedImage(item) {
  const current = await getSavedImages();
  const filtered = current.filter((entry) => entry.id !== item.id && entry.url !== item.url);
  filtered.unshift(item);
  await setSavedImages(filtered);
  return filtered.slice(0, MAX_SAVED_IMAGES);
}

async function clearSavedImages() {
  await chrome.storage.local.remove(SAVED_IMAGES_KEY);
  return [];
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url) {
  if (typeof url !== "string" || !url) {
    return "";
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  const response = await fetch(url, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function sendUsageEvent(eventName, payload = {}) {
  return false;
}

async function uploadError(payload = {}) {
  return false;
}

async function checkForUpdates(reason = "manual") {
  const manifest = chrome.runtime.getManifest();
  return {
    enabled: false,
    reachable: false,
    reason,
    currentVersion: manifest.version,
    latestVersion: manifest.version,
    minimumSupportedVersion: manifest.version,
    hasUpdate: false,
    forceUpdate: false,
    downloadUrl: "",
    releaseNotes: "",
    publishedAt: "",
    checkedAt: Date.now()
  };
}

async function getRemoteStatus() {
  return checkForUpdates("disabled");
}

function createContextMenus() {
  if (!chrome.contextMenus?.create) {
    return;
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SEND_SELECTION_MENU_ID,
      title: t("context.sendSelection"),
      contexts: ["selection"]
    });
  });
}

function stopCommandPolling() {
  chrome.alarms?.clear?.(COMMAND_POLL_ALARM);
}

function startChannelPolling() {
  chrome.alarms?.create?.(CHANNEL_POLL_ALARM, {
    periodInMinutes: CHANNEL_ALARM_PERIOD_MINUTES
  });
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
  const runtime = globalThis.OnecaiWechatChannel;
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
  const runtime = globalThis.OnecaiWechatChannel;
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
    const runtime = globalThis.OnecaiWechatChannel;
    const config = await runtime?.getConfig?.();
    return Boolean(config?.enabled && config?.token);
  } catch {
    return false;
  }
}

async function getChannelHistory(channel, conversationId) {
  const result = await chrome.storage.local.get(CHANNEL_HISTORY_KEY);
  const all = result[CHANNEL_HISTORY_KEY] && typeof result[CHANNEL_HISTORY_KEY] === "object" ? result[CHANNEL_HISTORY_KEY] : {};
  const key = `${channel}:${conversationId}`;
  return Array.isArray(all[key]) ? all[key] : [];
}

async function setChannelHistory(channel, conversationId, history) {
  const result = await chrome.storage.local.get(CHANNEL_HISTORY_KEY);
  const all = result[CHANNEL_HISTORY_KEY] && typeof result[CHANNEL_HISTORY_KEY] === "object" ? result[CHANNEL_HISTORY_KEY] : {};
  const key = `${channel}:${conversationId}`;
  all[key] = history.slice(-CHANNEL_HISTORY_LIMIT);
  await chrome.storage.local.set({ [CHANNEL_HISTORY_KEY]: all });
}

async function hasSeenChannelMessage(messageId) {
  if (!messageId) {
    return false;
  }
  const result = await chrome.storage.local.get(CHANNEL_SEEN_KEY);
  const seen = Array.isArray(result[CHANNEL_SEEN_KEY]) ? result[CHANNEL_SEEN_KEY] : [];
  return seen.includes(messageId);
}

async function markSeenChannelMessage(messageId) {
  if (!messageId) {
    return;
  }
  const result = await chrome.storage.local.get(CHANNEL_SEEN_KEY);
  const seen = Array.isArray(result[CHANNEL_SEEN_KEY]) ? result[CHANNEL_SEEN_KEY] : [];
  const next = seen.filter((item) => item !== messageId);
  next.push(messageId);
  await chrome.storage.local.set({ [CHANNEL_SEEN_KEY]: next.slice(-CHANNEL_SEEN_LIMIT) });
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
    (globalThis.OnecaiWechatMedia?.bodyFromItemList ? OnecaiWechatMedia.bodyFromItemList(itemList) : "") ||
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
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
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
    const response = await OnecaiWechatChannel.getBotConfig({
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
  if (!globalThis.OnecaiWechatChannel?.sendTyping || !globalThis.OnecaiWechatChannel?.getBotConfig) {
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
    return OnecaiWechatChannel.sendTyping({
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
    const prepared = await OnecaiWechatChannel.prepareIncomingMessage(normalized.message, {
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
      const result = await OnecaiAgent.runTurn({
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
    const mediaArtifacts = globalThis.OnecaiBrowser?.drainArtifacts
      ? OnecaiBrowser.drainArtifacts({ scope: `wechat:${normalized.fromUser}` })
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
    await OnecaiWechatChannel.sendMessage({
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
  if (!globalThis.OnecaiWechatChannel?.getConfig) {
    await logChannelDebug("poll skipped runtime missing");
    return false;
  }
  const config = await OnecaiWechatChannel.getConfig();
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
  const payload = await OnecaiWechatChannel.getUpdates({
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

chrome.runtime.onInstalled.addListener((details) => {
  createContextMenus();
  stopCommandPolling();
  startChannelPolling();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
  stopCommandPolling();
  startChannelPolling();
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === CHANNEL_POLL_ALARM) {
      pollChannels();
    }
    return false;
  });
}

createContextMenus();
stopCommandPolling();
startChannelPolling();
kickChannelPolling(CHANNEL_DEFAULT_ACTIVE_POLL_DURATION_MS);

self.addEventListener("error", (event) => {
  uploadError({
    source: "background",
    context: "global_error",
    message: event.message || "Unknown background error",
    stack: event.error?.stack || "",
    details: {
      filename: event.filename || "",
      lineno: event.lineno || 0,
      colno: event.colno || 0
    }
  });
});

self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  uploadError({
    source: "background",
    context: "unhandled_rejection",
    message: reason?.message || String(reason || "Unhandled rejection"),
    stack: reason?.stack || "",
    details: {
      reasonType: typeof reason
    }
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  if (!canToggleFloatingButton(tab.url)) {
    return;
  }

  sendUsageEvent("toolbar_clicked", {
    pageHost: (() => {
      try {
        return new URL(tab.url).hostname;
      } catch {
        return "";
      }
    })()
  });

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
    uploadError({
      source: "background",
      context: "toggle_floating_button",
      message: error?.message || String(error),
      stack: error?.stack || "",
      pageHost: (() => {
        try {
          return new URL(tab.url).hostname;
        } catch {
          return "";
        }
      })(),
      details: {
        tabId: tab.id
      }
    });
  }
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
        type: "sendSelectionToOnecai",
        text: selectionText
      });
      await setActionToggleBadge(tab.id, true);
      sendUsageEvent("context_selection_sent", {
        pageHost: (() => {
          try {
            return new URL(tab.url).hostname;
          } catch {
            return "";
          }
        })(),
        metadata: {
          textLength: selectionText.length
        }
      });
    } catch (error) {
      console.error("Failed to send selection to dogeclaw:", error);
      uploadError({
        source: "background",
        context: "context_send_selection",
        message: error?.message || String(error),
        stack: error?.stack || "",
        pageHost: (() => {
          try {
            return new URL(tab.url).hostname;
          } catch {
            return "";
          }
        })(),
        details: {
          tabId: tab.id,
          textLength: selectionText.length
        }
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  if (message?.type === "fetchText" && message.url) {
    fetch(message.url)
      .then(async (response) => {
        sendResponse({
          ok: response.ok,
          status: response.status,
          text: response.ok ? await response.text() : ""
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          status: 0,
          error: String(error)
        });
      });

    return true;
  }

  if (message?.type === "getSavedImages") {
    getSavedImages()
      .then((items) => sendResponse({ ok: true, items }))
      .catch((error) => sendResponse({ ok: false, error: String(error), items: [] }));
    return true;
  }

  if (message?.type === "clearSavedImages") {
    clearSavedImages()
      .then((items) => sendResponse({ ok: true, items }))
      .catch((error) => sendResponse({ ok: false, error: String(error), items: [] }));
    return true;
  }

  if (message?.type === "getRemoteStatus") {
    getRemoteStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: String(error), status: null }));
    return true;
  }

  if (message?.type === "checkForUpdates") {
    checkForUpdates(message.reason || "manual")
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: String(error), status: null }));
    return true;
  }

  if (message?.type === "getLlmConfig") {
    OnecaiLLM.getConfigStatus()
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
    OnecaiLLM.setConfig(message.config)
      .then((config) => sendResponse({
        ok: true,
        userConfigured: true,
        config: {
          ...config,
          apiKey: config.apiKey ? "configured" : ""
        }
      }))
      .catch((error) => sendResponse({ ok: false, error: String(error), config: null }));
    return true;
  }

  if (message?.type === "channelConfig") {
    const runtime = message.channel === "wechat" ? globalThis.OnecaiWechatChannel : null;
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

  if (message?.type === "chatWithPet") {
    OnecaiAgent.runTurn({
      message: message.message,
      history: message.history
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "trackEvent" && message.eventName) {
    sendUsageEvent(message.eventName, {
      pageHost: message.pageHost || "",
      metadata: message.metadata || {}
    })
      .then((sent) => sendResponse({ ok: true, sent }))
      .catch((error) => sendResponse({ ok: false, error: String(error), sent: false }));
    return true;
  }

  if (message?.type === "reportError") {
    uploadError({
      source: message.source || "content",
      context: message.context || "",
      message: message.message || "",
      stack: message.stack || "",
      pageHost: message.pageHost || "",
      details: message.details || {}
    })
      .then((sent) => sendResponse({ ok: true, sent }))
      .catch((error) => sendResponse({ ok: false, error: String(error), sent: false }));
    return true;
  }

  if (message?.type === "fetchImageDataUrl" && message.url) {
    if (String(message.url).startsWith("data:") || String(message.url).startsWith("blob:")) {
      sendResponse({ ok: true, dataUrl: message.url });
      return false;
    }

    fetch(message.url)
      .then(async (response) => {
        if (!response.ok) {
          sendResponse({ ok: false, error: `fetch failed: ${response.status}` });
          return;
        }

        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        sendResponse({ ok: true, dataUrl });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  }

  if (message?.type === "downloadImage" && message.url) {
    const format = inferFormat(message.url, message.format);
    const host = sanitizeFilenamePart(message.hostname, "page");
    const size = message.width && message.height ? `${message.width}x${message.height}` : "unknown";
    const filename = `page-image-gallery/${host}/${Date.now()}-${size}.${format}`;

    (async () => {
      let previewDataUrl = typeof message.previewDataUrl === "string" ? message.previewDataUrl : "";
      let downloadUrl = message.url;

      try {
        const fetchedDataUrl = await fetchImageAsDataUrl(message.url);
        if (fetchedDataUrl) {
          previewDataUrl = previewDataUrl || fetchedDataUrl;
          downloadUrl = fetchedDataUrl;
        }
      } catch {
        if (previewDataUrl) {
          downloadUrl = previewDataUrl;
        }
      }

      chrome.downloads.download(
        {
          url: downloadUrl,
          filename,
          conflictAction: "uniquify",
          saveAs: false
        },
        async (downloadId) => {
          if (chrome.runtime.lastError || typeof downloadId !== "number") {
            sendResponse({
              ok: false,
              error: chrome.runtime.lastError?.message || "download failed"
            });
            return;
          }

          const savedItem = {
            id: `${Date.now()}-${downloadId}`,
            url: message.url,
            previewDataUrl: previewDataUrl || "",
            width: message.width || null,
            height: message.height || null,
            format,
            hostname: message.hostname || "",
            filename,
            savedAt: Date.now()
          };

          const items = await recordSavedImage(savedItem);
          sendResponse({
            ok: true,
            downloadId,
            item: savedItem,
            items
          });
        }
      );
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: String(error)
      });
    });

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chatWithPetStream") {
    return;
  }

  let disconnected = false;
  let controller = null;
  port.onDisconnect.addListener(() => {
    disconnected = true;
    controller?.abort();
  });

  port.onMessage.addListener((message) => {
    if (message?.type !== "start") {
      return;
    }

    controller = new AbortController();
    OnecaiAgent.runTurnStream({
      message: message.message,
      history: message.history,
      signal: controller.signal,
      onDelta: (delta) => {
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
        if (!disconnected) {
          port.postMessage({ type: "done", result });
          port.disconnect();
        }
      }
    }).catch((error) => {
      if (!disconnected) {
        const rawError = error?.message || String(error);
        const isAbort = error?.name === "AbortError" || /aborted|body stream buffer/i.test(rawError);
        port.postMessage({ type: "error", error: isAbort ? t("llm.interrupted") : rawError });
        port.disconnect();
      }
    });
  });
});
