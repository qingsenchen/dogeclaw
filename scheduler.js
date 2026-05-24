(function () {
  const root = globalThis;
  const CONFIG = root.DogeclawConfig || {};
  const PLATFORM = root.DogeclawPlatform || {};
  const t = (key, params) => (root.DogeclawI18n?.t ? root.DogeclawI18n.t(key, params) : key);
  const STORAGE_CONFIG = CONFIG.storage || {};
  const SCHEDULER_CONFIG = CONFIG.scheduler || {};
  const JOB_STORE_KEY = STORAGE_CONFIG.scheduledTaskStoreKey || "dogeclaw-scheduled-tasks";
  const STATE_STORE_KEY = STORAGE_CONFIG.scheduledTaskStateStoreKey || "dogeclaw-scheduled-task-states";
  const RUN_STORE_KEY = STORAGE_CONFIG.scheduledTaskRunStoreKey || "dogeclaw-scheduled-task-runs";
  const ALARM_PREFIX = SCHEDULER_CONFIG.alarmPrefix || "dogeclaw-scheduled-task:";
  const PROVIDER_NAME = "chrome.alarms";
  const MAX_JOBS = Math.max(1, Number(SCHEDULER_CONFIG.maxTasks) || 64);
  const MAX_NAME_LENGTH = Math.max(16, Number(SCHEDULER_CONFIG.maxNameLength) || 120);
  const MAX_PROMPT_LENGTH = Math.max(1024, Number(SCHEDULER_CONFIG.maxPromptLength) || 16000);
  const MAX_RUN_OUTPUT_LENGTH = Math.max(256, Number(SCHEDULER_CONFIG.maxRunContentLength) || 4000);
  const RUN_HISTORY_LIMIT = Math.max(1, Number(SCHEDULER_CONFIG.runHistoryLimit) || 50);
  const MIN_INTERVAL_MINUTES = Math.max(1, Number(SCHEDULER_CONFIG.minIntervalMinutes) || 1);
  const MIN_ALARM_DELAY_MS = Math.max(1000, Number(SCHEDULER_CONFIG.minAlarmDelayMs) || 1000);
  const WAKEUP_LEEWAY_MS = Math.max(1000, Number(SCHEDULER_CONFIG.wakeupLeewayMs) || 15000);
  const runningJobIds = new Set();
  const eventListeners = new Set();
  let started = false;
  let providerListenerAttached = false;
  let restorePromise = null;

  function getLocalStorage() {
    const storage = PLATFORM.storage?.local;
    if (!storage?.get || !storage?.set || !storage?.remove) {
      throw new Error(t("runtime.storageApiUnavailable"));
    }
    return storage;
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function nowIso(ms) {
    const value = Number(ms) || 0;
    return value > 0 ? new Date(value).toISOString() : "";
  }

  function getBrowserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "browser-local";
    } catch {
      return "browser-local";
    }
  }

  function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function truncate(value, maxLength) {
    const text = String(value || "");
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  function normalizeLookupText(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function emitEvent(type, payload = {}) {
    const atMs = Date.now();
    const event = {
      type,
      provider: PROVIDER_NAME,
      atMs,
      at: nowIso(atMs),
      ...payload
    };
    eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn("Scheduled task event listener failed:", error);
      }
    });
  }

  function onEvent(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function normalizeRequiredJobId(id) {
    const text = String(id || "").trim();
    if (!text) {
      throw new Error(t("scheduler.taskIdRequired"));
    }
    return text;
  }

  function parseTimestamp(value, fieldName) {
    if (value instanceof Date) {
      const ms = value.getTime();
      if (Number.isFinite(ms)) {
        return ms;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }

    const text = String(value || "").trim();
    if (/^\d+$/.test(text)) {
      return Number(text);
    }

    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    throw new Error(t("scheduler.invalidTimestamp", { field: fieldName }));
  }

  function normalizePrompt(value) {
    const prompt = String(value || "").trim();
    if (!prompt) {
      throw new Error(t("scheduler.promptRequired"));
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(t("scheduler.promptTooLong", { count: MAX_PROMPT_LENGTH }));
    }
    return prompt;
  }

  function normalizeName(value, prompt) {
    const name = String(value || "").trim() || String(prompt || "").split(/\r?\n/)[0].trim() || t("scheduler.defaultTaskName");
    return truncate(name, MAX_NAME_LENGTH);
  }

  function normalizeTimeOfDay(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) {
      throw new Error(t("scheduler.invalidTimeOfDay"));
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(t("scheduler.invalidTimeOfDay"));
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeWeekdays(value) {
    const aliases = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6
    };
    const items = Array.isArray(value)
      ? value
      : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const weekdays = Array.from(new Set(items.map((item) => {
      const lower = String(item || "").trim().toLowerCase();
      const parsed = aliases[lower] ?? Number(lower);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
        throw new Error(t("scheduler.invalidWeekday"));
      }
      return parsed;
    }))).sort((a, b) => a - b);
    if (!weekdays.length) {
      throw new Error(t("scheduler.weekdayRequired"));
    }
    return weekdays;
  }

  function normalizeSchedule(rawSchedule = {}, options = {}) {
    const schedule = rawSchedule && typeof rawSchedule === "object" ? rawSchedule : {};
    const kind = String(schedule.kind || schedule.type || "").trim().toLowerCase();
    const timezone = String(schedule.timezone || getBrowserTimeZone()).trim().slice(0, 80);

    if (kind === "once") {
      let runAtMs = 0;
      if (hasOwn(schedule, "delayMinutes") || hasOwn(schedule, "afterMinutes") || hasOwn(schedule, "inMinutes")) {
        const delayMinutes = Number(schedule.delayMinutes ?? schedule.afterMinutes ?? schedule.inMinutes);
        if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
          throw new Error(t("scheduler.invalidDelay"));
        }
        runAtMs = Date.now() + delayMinutes * 60 * 1000;
      } else {
        runAtMs = parseTimestamp(schedule.runAtMs ?? schedule.runAt ?? schedule.at, "runAt");
      }
      if (options.requireFuture !== false && runAtMs <= Date.now() + MIN_ALARM_DELAY_MS) {
        throw new Error(t("scheduler.runAtMustBeFuture"));
      }
      return {
        kind,
        runAtMs,
        timezone
      };
    }

    if (kind === "interval") {
      const everyMinutes = Number(schedule.everyMinutes ?? schedule.periodInMinutes ?? schedule.intervalMinutes);
      if (!Number.isFinite(everyMinutes) || everyMinutes < MIN_INTERVAL_MINUTES) {
        throw new Error(t("scheduler.invalidInterval", { count: MIN_INTERVAL_MINUTES }));
      }
      const intervalMinutes = Math.round(everyMinutes * 1000) / 1000;
      const startAtMs = hasOwn(schedule, "startAtMs") || hasOwn(schedule, "startAt")
        ? parseTimestamp(schedule.startAtMs ?? schedule.startAt, "startAt")
        : Date.now() + intervalMinutes * 60 * 1000;
      return {
        kind,
        everyMinutes: intervalMinutes,
        startAtMs,
        timezone
      };
    }

    if (kind === "daily") {
      return {
        kind,
        timeOfDay: normalizeTimeOfDay(schedule.timeOfDay || schedule.atTime),
        timezone
      };
    }

    if (kind === "weekly") {
      return {
        kind,
        weekdays: normalizeWeekdays(schedule.weekdays || schedule.days),
        timeOfDay: normalizeTimeOfDay(schedule.timeOfDay || schedule.atTime),
        timezone
      };
    }

    throw new Error(t("scheduler.invalidScheduleKind"));
  }

  function normalizePayload(args = {}) {
    const payload = args.payload && typeof args.payload === "object" ? args.payload : {};
    return {
      kind: "agent_turn",
      prompt: normalizePrompt(args.prompt || args.message || payload.prompt),
      modelOverride: String(args.modelOverride || args.model || payload.modelOverride || payload.model || "").trim(),
      timeoutMs: Math.max(0, Number(args.timeoutMs || payload.timeoutMs || 0) || 0)
    };
  }

  function normalizeDeliveryTarget(value = {}, args = {}, context = {}) {
    const target = value && typeof value === "object" ? value : {};
    const kind = String(target.kind || "").trim().toLowerCase();

    if (kind === "tab") {
      const tabId = Number(target.tabId || 0);
      if (Number.isInteger(tabId) && tabId > 0) {
        return {
          kind: "tab",
          tabId,
          url: String(target.url || "").slice(0, 2048)
        };
      }
      return null;
    }

    const tabId = Number(context.tabId || args.tabId || 0);
    if (Number.isInteger(tabId) && tabId > 0) {
      return {
        kind: "tab",
        tabId,
        url: String(context.tabUrl || args.tabUrl || "").slice(0, 2048)
      };
    }

    return null;
  }

  function normalizeDelivery(args = {}, context = {}) {
    const rawDelivery = args.delivery && typeof args.delivery === "object" ? args.delivery : {};
    const requestedMode = String(rawDelivery.mode || rawDelivery.kind || "").trim().toLowerCase();
    if (args.notify === false || args.notificationTarget === false || requestedMode === "none") {
      return {
        mode: "none",
        target: null,
        unavailablePolicy: "pause"
      };
    }

    const target = normalizeDeliveryTarget(rawDelivery.target, args, context);
    return {
      mode: target ? "chat" : "none",
      target,
      unavailablePolicy: "pause"
    };
  }

  function getNotificationTargetUnavailableReason() {
    return {
      reasonCode: "notification_target_unavailable",
      reason: t("scheduler.pauseReasonNotificationTargetUnavailable")
    };
  }

  function normalizePauseInfo(args = {}) {
    const reasonCode = String(args.pauseReasonCode || args.reasonCode || "").trim().slice(0, 120);
    const reason = String(args.pauseReason || args.reason || "").trim().slice(0, 500);
    return {
      pauseReasonCode: reasonCode,
      pauseReason: reason,
      pausedAtMs: reason || reasonCode ? Date.now() : 0
    };
  }

  function canNotifyHttpTab(tab = {}) {
    return Boolean(tab?.id && /^https?:\/\//i.test(tab.url || ""));
  }

  async function isDeliveryTargetAvailable(job = {}) {
    if (job.delivery?.mode !== "chat") {
      return true;
    }

    const target = job.delivery?.target || null;
    const targetTabId = Number(target?.tabId || 0);
    if (!target || target.kind !== "tab") {
      return false;
    }
    if (!Number.isInteger(targetTabId) || targetTabId <= 0 || !PLATFORM.tabs?.get) {
      return false;
    }

    try {
      return canNotifyHttpTab(await PLATFORM.tabs.get(targetTabId));
    } catch {
      return false;
    }
  }

  function splitTimeOfDay(timeOfDay) {
    const [hour, minute] = String(timeOfDay || "00:00").split(":").map((item) => Number(item));
    return { hour, minute };
  }

  function getLocalCandidateAt(afterMs, dayOffset, timeOfDay) {
    const { hour, minute } = splitTimeOfDay(timeOfDay);
    const date = new Date(afterMs);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.getTime();
  }

  function getNextDailyRunAt(schedule, afterMs) {
    for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
      const candidate = getLocalCandidateAt(afterMs, dayOffset, schedule.timeOfDay);
      if (candidate > afterMs) {
        return candidate;
      }
    }
    return 0;
  }

  function getNextWeeklyRunAt(schedule, afterMs) {
    const weekdays = new Set(schedule.weekdays || []);
    for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
      const candidate = getLocalCandidateAt(afterMs, dayOffset, schedule.timeOfDay);
      if (candidate > afterMs && weekdays.has(new Date(candidate).getDay())) {
        return candidate;
      }
    }
    return 0;
  }

  function computeNextRunAt(job, state = {}, afterMs = Date.now()) {
    const schedule = job.schedule || {};

    if (schedule.kind === "once") {
      if (Number(state.lastRunAtMs) > 0) {
        return 0;
      }
      return Number(schedule.runAtMs) || 0;
    }

    if (schedule.kind === "interval") {
      const intervalMs = Math.max(MIN_INTERVAL_MINUTES * 60 * 1000, Number(schedule.everyMinutes || 0) * 60 * 1000);
      const anchorMs = Number(schedule.startAtMs || job.createdAtMs || Date.now() + intervalMs);
      if (anchorMs > afterMs) {
        return anchorMs;
      }
      const elapsed = Math.max(0, afterMs - anchorMs);
      return anchorMs + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
    }

    if (schedule.kind === "daily") {
      return getNextDailyRunAt(schedule, afterMs);
    }

    if (schedule.kind === "weekly") {
      return getNextWeeklyRunAt(schedule, afterMs);
    }

    return 0;
  }

  function publicSchedule(schedule = {}) {
    const result = { ...schedule };
    if (result.runAtMs) {
      result.runAt = nowIso(result.runAtMs);
    }
    if (result.startAtMs) {
      result.startAt = nowIso(result.startAtMs);
    }
    return result;
  }

  function publicJob(job = {}, state = {}) {
    const prompt = String(job.payload?.prompt || "");
    const lastStatus = state.lastRunStatus || "";
    return {
      id: job.id || "",
      name: job.name || "",
      prompt,
      payload: {
        kind: job.payload?.kind || "agent_turn",
        prompt,
        modelOverride: job.payload?.modelOverride || "",
        timeoutMs: Math.max(0, Number(job.payload?.timeoutMs) || 0)
      },
      enabled: job.enabled !== false,
      status: job.enabled === false ? "paused" : "enabled",
      deleteAfterRun: Boolean(job.deleteAfterRun),
      schedule: publicSchedule(job.schedule || {}),
      provider: PROVIDER_NAME,
      delivery: job.delivery || { mode: "none", target: null, unavailablePolicy: "pause" },
      notificationTarget: job.delivery?.mode === "chat" ? job.delivery?.target || null : null,
      nextRunAtMs: Number(state.nextRunAtMs || 0),
      nextRunAt: nowIso(state.nextRunAtMs),
      pendingAlarmAtMs: Number(state.pendingAlarmAtMs || 0),
      pendingAlarmAt: nowIso(state.pendingAlarmAtMs),
      runningRunId: state.runningRunId || "",
      lastRunAtMs: Number(state.lastRunAtMs || 0),
      lastRunAt: nowIso(state.lastRunAtMs),
      lastRunId: state.lastRunId || "",
      lastStatus,
      lastError: state.lastError || "",
      consecutiveErrorCount: Math.max(0, Number(state.consecutiveErrorCount) || 0),
      pauseReasonCode: state.pauseReasonCode || "",
      pauseReason: state.pauseReason || "",
      pausedAtMs: Number(state.pausedAtMs || 0),
      pausedAt: nowIso(state.pausedAtMs),
      runCount: Math.max(0, Number(state.runCount) || 0),
      createdAtMs: Number(job.createdAtMs || 0),
      createdAt: nowIso(job.createdAtMs),
      updatedAtMs: Number(job.updatedAtMs || state.updatedAtMs || 0),
      updatedAt: nowIso(job.updatedAtMs || state.updatedAtMs)
    };
  }

  function publicRun(run = {}, options = {}) {
    const output = String(run.output || "");
    const full = options.full === true;
    const content = full ? output : truncate(output, Math.min(1000, MAX_RUN_OUTPUT_LENGTH));
    return {
      id: run.id || "",
      taskId: run.jobId || "",
      jobId: run.jobId || "",
      taskName: run.jobName || "",
      jobName: run.jobName || "",
      reason: run.reason || "",
      status: run.status || "",
      content,
      output: content,
      contentTruncated: !full && output.length > Math.min(1000, MAX_RUN_OUTPUT_LENGTH),
      outputTruncated: !full && output.length > Math.min(1000, MAX_RUN_OUTPUT_LENGTH),
      error: run.error || "",
      usage: run.usage || null,
      iterations: Math.max(0, Number(run.iterations) || 0),
      delivery: run.delivery || null,
      startedAtMs: Number(run.startedAtMs || 0),
      startedAt: nowIso(run.startedAtMs),
      completedAtMs: Number(run.completedAtMs || 0),
      completedAt: nowIso(run.completedAtMs),
      durationMs: Math.max(0, Number(run.durationMs) || 0)
    };
  }

  async function getJobStore() {
    const result = await getLocalStorage().get(JOB_STORE_KEY);
    const store = result[JOB_STORE_KEY];
    return {
      version: 2,
      jobs: store && store.version === 2 && store.jobs && typeof store.jobs === "object" ? store.jobs : {}
    };
  }

  async function setJobStore(store) {
    await getLocalStorage().set({
      [JOB_STORE_KEY]: {
        version: 2,
        jobs: store.jobs || {}
      }
    });
  }

  async function getStateStore() {
    const result = await getLocalStorage().get(STATE_STORE_KEY);
    const store = result[STATE_STORE_KEY];
    return {
      version: 2,
      states: store && store.version === 2 && store.states && typeof store.states === "object" ? store.states : {}
    };
  }

  async function setStateStore(store) {
    await getLocalStorage().set({
      [STATE_STORE_KEY]: {
        version: 2,
        states: store.states || {}
      }
    });
  }

  async function getRunStore() {
    const result = await getLocalStorage().get(RUN_STORE_KEY);
    const store = result[RUN_STORE_KEY];
    return {
      version: 2,
      runs: store && store.version === 2 && store.runs && typeof store.runs === "object" ? store.runs : {}
    };
  }

  async function setRunStore(store) {
    await getLocalStorage().set({
      [RUN_STORE_KEY]: {
        version: 2,
        runs: store.runs || {}
      }
    });
  }

  async function getJobInternal(id) {
    const jobId = normalizeRequiredJobId(id);
    const store = await getJobStore();
    return store.jobs[jobId] || null;
  }

  async function getStateInternal(id) {
    const jobId = normalizeRequiredJobId(id);
    const store = await getStateStore();
    return store.states[jobId] || createEmptyState(jobId);
  }

  async function saveJob(job) {
    const store = await getJobStore();
    store.jobs[job.id] = job;
    await setJobStore(store);
    return job;
  }

  async function saveState(state) {
    const store = await getStateStore();
    store.states[state.jobId] = state;
    await setStateStore(store);
    return state;
  }

  async function saveJobAndState(job, state) {
    await saveJob(job);
    await saveState(state);
    await syncJobWakeup(job, state);
    return { job, state };
  }

  async function appendRun(jobId, run) {
    const store = await getRunStore();
    const runs = Array.isArray(store.runs[jobId]) ? store.runs[jobId].slice() : [];
    const existingIndex = runs.findIndex((item) => item.id === run.id);
    if (existingIndex >= 0) {
      runs[existingIndex] = run;
    } else {
      runs.push(run);
    }
    store.runs[jobId] = runs.slice(-RUN_HISTORY_LIMIT);
    await setRunStore(store);
    return run;
  }

  function createEmptyState(jobId) {
    const now = Date.now();
    return {
      version: 2,
      jobId,
      nextRunAtMs: 0,
      pendingAlarmAtMs: 0,
      runningRunId: "",
      lastRunId: "",
      lastRunStatus: "",
      lastError: "",
      lastRunAtMs: 0,
      runCount: 0,
      consecutiveErrorCount: 0,
      pauseReasonCode: "",
      pauseReason: "",
      pausedAtMs: 0,
      createdAtMs: now,
      updatedAtMs: now
    };
  }

  function createInitialState(job, options = {}) {
    const state = createEmptyState(job.id);
    const pauseInfo = job.enabled === false ? normalizePauseInfo(options) : null;
    state.nextRunAtMs = job.enabled === false ? 0 : computeNextRunAt(job, state, Date.now());
    state.pauseReasonCode = pauseInfo?.pauseReasonCode || "";
    state.pauseReason = pauseInfo?.pauseReason || "";
    state.pausedAtMs = pauseInfo?.pausedAtMs || 0;
    return state;
  }

  function getAlarmName(jobId) {
    return `${ALARM_PREFIX}${jobId}`;
  }

  function getJobIdFromAlarmName(name) {
    const text = String(name || "");
    return text.startsWith(ALARM_PREFIX) ? text.slice(ALARM_PREFIX.length) : "";
  }

  const chromeAlarmProvider = {
    name: PROVIDER_NAME,
    isAvailable() {
      return Boolean(PLATFORM.alarms?.create && PLATFORM.alarms?.clear && PLATFORM.alarms?.onAlarm?.addListener);
    },
    async scheduleWakeup(job, state) {
      if (!this.isAvailable()) {
        throw new Error(t("scheduler.providerUnavailable"));
      }
      const alarmName = getAlarmName(job.id);
      await PLATFORM.alarms.clear(alarmName).catch(() => false);
      if (job.enabled === false || !state.nextRunAtMs) {
        return 0;
      }
      const when = Math.max(Number(state.nextRunAtMs) || 0, Date.now() + MIN_ALARM_DELAY_MS);
      await PLATFORM.alarms.create(alarmName, { when });
      return when;
    },
    async clearWakeup(jobId) {
      if (!this.isAvailable()) {
        return false;
      }
      return PLATFORM.alarms.clear(getAlarmName(jobId)).catch(() => false);
    },
    onWakeup(callback) {
      if (!this.isAvailable()) {
        return false;
      }
      PLATFORM.alarms.onAlarm.addListener((alarm) => {
        const jobId = getJobIdFromAlarmName(alarm?.name);
        if (jobId) {
          callback(jobId, alarm);
        }
      });
      return true;
    }
  };

  async function syncJobWakeup(job, state) {
    if (!chromeAlarmProvider.isAvailable()) {
      console.warn("Scheduled task provider unavailable:", PROVIDER_NAME);
      return false;
    }

    try {
      const pendingAlarmAtMs = await chromeAlarmProvider.scheduleWakeup(job, state);
      if (Number(state.pendingAlarmAtMs || 0) !== Number(pendingAlarmAtMs || 0)) {
        await saveState({
          ...state,
          pendingAlarmAtMs: Number(pendingAlarmAtMs || 0),
          updatedAtMs: Date.now()
        });
      }
      return Boolean(pendingAlarmAtMs);
    } catch (error) {
      console.warn("Failed to sync scheduled task wakeup:", error);
      return false;
    }
  }

  async function listJobPairs() {
    const jobStore = await getJobStore();
    const stateStore = await getStateStore();
    const pairs = Object.values(jobStore.jobs || {}).map((job) => ({
      job,
      state: stateStore.states[job.id] || createEmptyState(job.id)
    }));

    return pairs.sort((a, b) => {
      const aNext = Number(a.state.nextRunAtMs || 0) || Number.MAX_SAFE_INTEGER;
      const bNext = Number(b.state.nextRunAtMs || 0) || Number.MAX_SAFE_INTEGER;
      return aNext - bNext || String(a.job.name || "").localeCompare(String(b.job.name || ""));
    });
  }

  async function listTasks() {
    return {
      tasks: (await listJobPairs()).map(({ job, state }) => publicJob(job, state)),
      provider: PROVIDER_NAME
    };
  }

  async function createTask(args = {}, context = {}) {
    const jobStore = await getJobStore();
    if (Object.keys(jobStore.jobs || {}).length >= MAX_JOBS) {
      throw new Error(t("scheduler.tooManyTasks", { count: MAX_JOBS }));
    }

    const now = Date.now();
    const payload = normalizePayload(args);
    const schedule = normalizeSchedule(args.schedule || args, { requireFuture: true });
    const enabled = args.enabled !== false;
    const job = {
      id: createId("job"),
      version: 2,
      name: normalizeName(args.name, payload.prompt),
      enabled,
      schedule,
      payload,
      delivery: normalizeDelivery(args, context),
      deleteAfterRun: schedule.kind === "once" ? args.deleteAfterRun !== false : Boolean(args.deleteAfterRun),
      createdAtMs: now,
      updatedAtMs: now
    };
    const state = createInitialState(job, args);
    if (enabled && !state.nextRunAtMs) {
      throw new Error(t("scheduler.noNextRun"));
    }

    jobStore.jobs[job.id] = job;
    await setJobStore(jobStore);
    await saveState(state);
    await syncJobWakeup(job, state);
    return publicJob(job, state);
  }

  function argsContainSchedule(args = {}) {
    return hasOwn(args, "schedule") ||
      ["kind", "type", "runAt", "runAtMs", "at", "delayMinutes", "afterMinutes", "inMinutes", "everyMinutes", "periodInMinutes", "intervalMinutes", "startAt", "startAtMs", "timeOfDay", "atTime", "weekdays", "days"].some((key) => hasOwn(args, key));
  }

  async function updateTask(id, args = {}) {
    const jobId = normalizeRequiredJobId(id || args.id);
    const job = await getJobInternal(jobId);
    if (!job) {
      throw new Error(t("scheduler.taskNotFound", { id: jobId }));
    }

    const patch = args.patch && typeof args.patch === "object" ? args.patch : args;
    const state = await getStateInternal(jobId);
    const nextJob = {
      ...job,
      updatedAtMs: Date.now()
    };
    const nextState = {
      ...state,
      updatedAtMs: Date.now()
    };
    const scheduleChanged = argsContainSchedule(patch);

    if (hasOwn(patch, "payload") || hasOwn(patch, "prompt") || hasOwn(patch, "message") || hasOwn(patch, "model") || hasOwn(patch, "modelOverride") || hasOwn(patch, "timeoutMs")) {
      nextJob.payload = normalizePayload({
        ...nextJob.payload,
        ...patch,
        payload: patch.payload || nextJob.payload
      });
    }
    if (hasOwn(patch, "name")) {
      nextJob.name = normalizeName(patch.name, nextJob.payload?.prompt);
    }
    if (scheduleChanged) {
      nextJob.schedule = normalizeSchedule(patch.schedule || patch, { requireFuture: true });
      if (nextJob.schedule.kind === "once") {
        nextState.lastRunAtMs = 0;
      }
    }
    if (hasOwn(patch, "delivery") || hasOwn(patch, "notify") || hasOwn(patch, "notificationTarget") || hasOwn(patch, "tabId")) {
      nextJob.delivery = normalizeDelivery(patch, {});
    }
    if (hasOwn(patch, "deleteAfterRun")) {
      nextJob.deleteAfterRun = Boolean(patch.deleteAfterRun);
    }
    if (hasOwn(patch, "enabled")) {
      nextJob.enabled = Boolean(patch.enabled);
      if (nextJob.enabled) {
        nextState.pauseReasonCode = "";
        nextState.pauseReason = "";
        nextState.pausedAtMs = 0;
      } else {
        const pauseInfo = normalizePauseInfo(patch);
        nextState.pauseReasonCode = pauseInfo.pauseReasonCode || nextState.pauseReasonCode || "";
        nextState.pauseReason = pauseInfo.pauseReason || nextState.pauseReason || "";
        nextState.pausedAtMs = pauseInfo.pausedAtMs || Number(nextState.pausedAtMs) || Date.now();
      }
    }

    if (nextJob.enabled === false) {
      nextState.nextRunAtMs = 0;
    } else if (scheduleChanged || !nextState.nextRunAtMs || nextState.nextRunAtMs <= Date.now()) {
      nextState.nextRunAtMs = computeNextRunAt(nextJob, nextState, Date.now());
      if (!nextState.nextRunAtMs) {
        throw new Error(t("scheduler.noNextRun"));
      }
    }

    await saveJobAndState(nextJob, nextState);
    return publicJob(nextJob, nextState);
  }

  async function deleteTask(id, options = {}) {
    const jobId = normalizeRequiredJobId(id);
    const jobStore = await getJobStore();
    const stateStore = await getStateStore();
    const existed = Boolean(jobStore.jobs[jobId]);
    delete jobStore.jobs[jobId];
    delete stateStore.states[jobId];
    await setJobStore(jobStore);
    await setStateStore(stateStore);
    await chromeAlarmProvider.clearWakeup(jobId);

    if (!options.keepRuns) {
      const runStore = await getRunStore();
      delete runStore.runs[jobId];
      await setRunStore(runStore);
    }

    return {
      deleted: existed,
      id: jobId
    };
  }

  function normalizeSelectorEnum(value, allowedValues, fieldName) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) {
      return "";
    }
    if (!allowedValues.includes(text)) {
      throw new Error(t("scheduler.invalidDeleteSelector", { field: fieldName, value: text }));
    }
    return text;
  }

  function normalizeDeleteSelector(args = {}) {
    const rawSelector = args.selector && typeof args.selector === "object" ? args.selector : {};
    const selector = {};

    selector.scope = normalizeSelectorEnum(rawSelector.scope, ["one", "matching", "all"], "scope");
    selector.name = String(rawSelector.name || "").trim();
    selector.query = String(rawSelector.query || "").trim();
    selector.scheduleKind = normalizeSelectorEnum(rawSelector.scheduleKind, ["once", "interval", "daily", "weekly"], "scheduleKind");
    selector.status = normalizeSelectorEnum(rawSelector.status, ["enabled", "paused", "succeeded", "failed", "running", "skipped", "timed_out"], "status");
    selector.lastStatus = normalizeSelectorEnum(rawSelector.lastStatus, ["succeeded", "failed", "running", "skipped", "timed_out"], "lastStatus");
    selector.pauseReasonCode = String(rawSelector.pauseReasonCode || "").trim();
    selector.pauseReasonQuery = String(rawSelector.pauseReasonQuery || "").trim();
    if (hasOwn(rawSelector, "enabled")) {
      selector.enabled = Boolean(rawSelector.enabled);
    }
    if (hasOwn(rawSelector, "deleteAfterRun")) {
      selector.deleteAfterRun = Boolean(rawSelector.deleteAfterRun);
    }

    const hasBroadFilter = Boolean(
      selector.scheduleKind ||
      selector.status ||
      hasOwn(selector, "enabled") ||
      selector.lastStatus ||
      hasOwn(selector, "deleteAfterRun") ||
      selector.pauseReasonCode ||
      selector.pauseReasonQuery
    );
    selector.scope = selector.scope || (hasBroadFilter ? "matching" : "one");
    return selector;
  }

  function hasDeleteSelector(selector = {}) {
    return selector.scope === "all" ||
      Boolean(selector.name) ||
      Boolean(selector.query) ||
      Boolean(selector.scheduleKind) ||
      Boolean(selector.status) ||
      hasOwn(selector, "enabled") ||
      Boolean(selector.lastStatus) ||
      hasOwn(selector, "deleteAfterRun") ||
      Boolean(selector.pauseReasonCode) ||
      Boolean(selector.pauseReasonQuery);
  }

  function getDeleteSelectorLabel(selector = {}) {
    if (selector.scope === "all") {
      return "all";
    }
    return selector.name || selector.query || selector.scheduleKind || selector.status || selector.pauseReasonCode || t("common.empty");
  }

  function pairMatchesStatus(pair = {}, status) {
    if (!status) {
      return true;
    }
    if (status === "enabled") {
      return pair.job?.enabled !== false;
    }
    if (status === "paused") {
      return pair.job?.enabled === false;
    }
    return normalizeLookupText(pair.state?.lastRunStatus) === status;
  }

  function pairMatchesDeleteSelector(pair = {}, selector = {}) {
    const job = pair.job || {};
    const state = pair.state || {};
    if (selector.scope === "all") {
      return true;
    }
    if (selector.name) {
      const lookup = normalizeLookupText(selector.name);
      const name = normalizeLookupText(job.name);
      if (name !== lookup && !name.includes(lookup)) {
        return false;
      }
    }
    if (selector.query) {
      const lookup = normalizeLookupText(selector.query);
      const name = normalizeLookupText(job.name);
      const prompt = normalizeLookupText(job.payload?.prompt);
      if (!name.includes(lookup) && !prompt.includes(lookup)) {
        return false;
      }
    }
    if (selector.scheduleKind && normalizeLookupText(job.schedule?.kind) !== selector.scheduleKind) {
      return false;
    }
    if (!pairMatchesStatus(pair, selector.status)) {
      return false;
    }
    if (selector.lastStatus && normalizeLookupText(state.lastRunStatus) !== selector.lastStatus) {
      return false;
    }
    if (hasOwn(selector, "enabled") && (job.enabled !== false) !== Boolean(selector.enabled)) {
      return false;
    }
    if (hasOwn(selector, "deleteAfterRun") && Boolean(job.deleteAfterRun) !== Boolean(selector.deleteAfterRun)) {
      return false;
    }
    if (selector.pauseReasonCode && normalizeLookupText(state.pauseReasonCode) !== normalizeLookupText(selector.pauseReasonCode)) {
      return false;
    }
    if (selector.pauseReasonQuery) {
      const lookup = normalizeLookupText(selector.pauseReasonQuery);
      const reason = normalizeLookupText(`${state.pauseReasonCode || ""} ${state.pauseReason || ""} ${state.lastError || ""}`);
      if (!reason.includes(lookup)) {
        return false;
      }
    }
    return true;
  }

  async function deleteTasksBySelector(args = {}, options = {}) {
    const selector = normalizeDeleteSelector(args);
    if (!hasDeleteSelector(selector)) {
      throw new Error(t("scheduler.deleteSelectorRequired"));
    }

    const pairs = await listJobPairs();
    const matches = pairs.filter((pair) => pairMatchesDeleteSelector(pair, selector));
    const label = getDeleteSelectorLabel(selector);
    if (!matches.length) {
      throw new Error(t("scheduler.taskNotFound", { id: label }));
    }
    if (selector.scope === "one" && matches.length > 1) {
      throw new Error(t("scheduler.taskMatchAmbiguous", { query: label, count: matches.length }));
    }

    const jobStore = await getJobStore();
    const stateStore = await getStateStore();
    const ids = new Set(matches.map((pair) => pair.job.id));
    ids.forEach((jobId) => {
      delete jobStore.jobs[jobId];
      delete stateStore.states[jobId];
    });
    await setJobStore(jobStore);
    await setStateStore(stateStore);
    await Promise.all(Array.from(ids).map((jobId) => chromeAlarmProvider.clearWakeup(jobId)));

    if (!options.keepRuns) {
      const runStore = await getRunStore();
      ids.forEach((jobId) => {
        delete runStore.runs[jobId];
      });
      await setRunStore(runStore);
    }

    return {
      deleted: ids.size > 0,
      deletedCount: ids.size,
      tasks: matches.map((pair) => publicJob(pair.job, pair.state))
    };
  }

  async function setTaskEnabled(id, enabled, options = {}) {
    return updateTask(id, { ...options, enabled: Boolean(enabled) });
  }

  async function pauseTask(id, options = {}) {
    return setTaskEnabled(id, false, options);
  }

  function createRun(job, reason) {
    const now = Date.now();
    return {
      version: 2,
      id: createId("run"),
      jobId: job.id,
      jobName: job.name,
      reason,
      status: "running",
      output: "",
      error: "",
      usage: null,
      iterations: 0,
      delivery: job.delivery || null,
      startedAtMs: now,
      completedAtMs: 0,
      durationMs: 0
    };
  }

  async function executeScheduledJob(job, run) {
    if (!root.DogeclawAgent?.runTurn) {
      throw new Error(t("scheduler.agentRuntimeUnavailable"));
    }
    const instruction = t("scheduler.agentInstruction", {
      id: job.id,
      name: job.name
    });
    return root.DogeclawAgent.runTurn({
      message: job.payload?.prompt || "",
      history: [
        {
          role: "system",
          content: instruction
        }
      ],
      tools: true,
      toolContext: {
        channel: "scheduled_task",
        scheduledTaskId: job.id,
        scheduledTaskRunId: run.id
      }
    });
  }

  async function markRunFinished(run, patch = {}) {
    const completedAtMs = Date.now();
    const nextRun = {
      ...run,
      ...patch,
      completedAtMs,
      durationMs: completedAtMs - run.startedAtMs
    };
    await appendRun(nextRun.jobId, nextRun);
    return nextRun;
  }

  async function completeJobAfterRun(job, state, run, options = {}) {
    if (job.schedule?.kind === "once" && options.manual !== true && run.status === "succeeded" && job.deleteAfterRun !== false) {
      await deleteTask(job.id, { keepRuns: true });
      return null;
    }

    const nextJob = {
      ...job,
      enabled: job.schedule?.kind === "once" && options.manual !== true ? false : job.enabled,
      updatedAtMs: Date.now()
    };
    const nextState = {
      ...state,
      runningRunId: "",
      lastRunId: run.id,
      lastRunStatus: run.status,
      lastError: run.error || "",
      lastRunAtMs: run.completedAtMs || Date.now(),
      runCount: Math.max(0, Number(state.runCount) || 0) + 1,
      consecutiveErrorCount: run.status === "failed" || run.status === "timed_out"
        ? Math.max(0, Number(state.consecutiveErrorCount) || 0) + 1
        : 0,
      updatedAtMs: Date.now()
    };

    if (options.manual === true) {
      nextState.nextRunAtMs = nextJob.enabled === false ? 0 : Number(state.nextRunAtMs || 0);
    } else if (nextJob.schedule?.kind === "once") {
      nextState.nextRunAtMs = 0;
    } else {
      nextState.nextRunAtMs = nextJob.enabled === false ? 0 : computeNextRunAt(nextJob, nextState, Date.now() + MIN_ALARM_DELAY_MS);
    }

    await saveJobAndState(nextJob, nextState);
    return { job: nextJob, state: nextState };
  }

  async function skipJobWithPause(job, state, reasonCode, reason, options = {}) {
    const run = createRun(job, options.reason || "alarm");
    const completed = await markRunFinished(run, {
      status: "skipped",
      error: reasonCode
    });
    const nextJob = {
      ...job,
      enabled: false,
      updatedAtMs: Date.now()
    };
    const nextState = {
      ...state,
      nextRunAtMs: 0,
      pendingAlarmAtMs: 0,
      runningRunId: "",
      lastRunId: completed.id,
      lastRunStatus: completed.status,
      lastError: completed.error,
      lastRunAtMs: completed.completedAtMs,
      runCount: Math.max(0, Number(state.runCount) || 0) + 1,
      pauseReasonCode: reasonCode,
      pauseReason: reason,
      pausedAtMs: Date.now(),
      updatedAtMs: Date.now()
    };
    await saveJob(nextJob);
    await saveState(nextState);
    await chromeAlarmProvider.clearWakeup(job.id);
    emitEvent("run_skipped", {
      task: publicJob(nextJob, nextState),
      run: publicRun(completed, { full: true })
    });
    return {
      skipped: true,
      reason: reasonCode,
      paused: true,
      task: publicJob(nextJob, nextState),
      run: publicRun(completed, { full: true })
    };
  }

  async function runTask(id, options = {}) {
    const jobId = normalizeRequiredJobId(id || options.id);
    if (runningJobIds.has(jobId)) {
      return {
        skipped: true,
        reason: "already_running",
        taskId: jobId,
        jobId
      };
    }

    runningJobIds.add(jobId);
    let job = null;
    let state = null;
    let run = null;
    try {
      job = await getJobInternal(jobId);
      if (!job) {
        throw new Error(t("scheduler.taskNotFound", { id: jobId }));
      }
      state = await getStateInternal(jobId);

      const manual = options.manual === true;
      if (!manual) {
        if (job.enabled === false) {
          return {
            skipped: true,
            reason: "disabled",
            task: publicJob(job, state)
          };
        }
        if (state.nextRunAtMs && state.nextRunAtMs > Date.now() + WAKEUP_LEEWAY_MS) {
          return {
            skipped: true,
            reason: "not_due",
            task: publicJob(job, state)
          };
        }
        if (!(await isDeliveryTargetAvailable(job))) {
          const pauseInfo = getNotificationTargetUnavailableReason();
          return skipJobWithPause(job, state, pauseInfo.reasonCode, pauseInfo.reason, { reason: options.reason || "alarm" });
        }
      }

      run = createRun(job, options.reason || (manual ? "manual" : "alarm"));
      state = {
        ...state,
        runningRunId: run.id,
        updatedAtMs: Date.now()
      };
      await saveState(state);
      await appendRun(job.id, run);
      emitEvent("run_started", {
        task: publicJob(job, state),
        run: publicRun(run, { full: true })
      });

      const result = await executeScheduledJob(job, run);
      run = await markRunFinished(run, {
        status: "succeeded",
        output: truncate(result?.content || "", MAX_RUN_OUTPUT_LENGTH),
        usage: result?.usage || null,
        iterations: Math.max(0, Number(result?.iterations) || 0)
      });
      const nextPair = await completeJobAfterRun(job, state, run, { manual });
      emitEvent("run_completed", {
        task: nextPair ? publicJob(nextPair.job, nextPair.state) : publicJob(job, state),
        deleted: !nextPair,
        run: publicRun(run, { full: true })
      });
      return {
        task: nextPair ? publicJob(nextPair.job, nextPair.state) : null,
        deleted: !nextPair,
        run: publicRun(run, { full: true })
      };
    } catch (error) {
      if (run) {
        run = await markRunFinished(run, {
          status: error?.name === "AbortError" ? "timed_out" : "failed",
          error: error?.message || String(error)
        });
        if (job && state) {
          const nextPair = await completeJobAfterRun(job, state, run, { manual: options.manual === true });
          emitEvent("run_failed", {
            task: nextPair ? publicJob(nextPair.job, nextPair.state) : publicJob(job, state),
            run: publicRun(run, { full: true })
          });
        }
      }
      throw error;
    } finally {
      runningJobIds.delete(jobId);
    }
  }

  async function getRunHistory(id, options = {}) {
    const jobId = normalizeRequiredJobId(id);
    const store = await getRunStore();
    const limit = Math.max(1, Math.min(RUN_HISTORY_LIMIT, Number(options.limit) || 10));
    const runs = Array.isArray(store.runs[jobId]) ? store.runs[jobId] : [];
    return {
      taskId: jobId,
      jobId,
      runs: runs.slice(-limit).reverse().map((run) => publicRun(run, { full: options.full === true }))
    };
  }

  async function rescheduleAll() {
    const pairs = await listJobPairs();
    let scheduled = 0;
    for (const pair of pairs) {
      const { job } = pair;
      let { state } = pair;
      if (job.enabled !== false && (!state.nextRunAtMs || state.nextRunAtMs <= Date.now())) {
        state = {
          ...state,
          nextRunAtMs: computeNextRunAt(job, state, Date.now()),
          updatedAtMs: Date.now()
        };
        await saveState(state);
      }
      if (job.enabled !== false && state.nextRunAtMs) {
        if (await syncJobWakeup(job, state)) {
          scheduled += 1;
        }
      } else {
        await chromeAlarmProvider.clearWakeup(job.id);
      }
    }
    return {
      provider: PROVIDER_NAME,
      scheduled
    };
  }

  async function runDueTasks(reason = "due") {
    const pairs = await listJobPairs();
    let startedCount = 0;
    for (const { job, state } of pairs) {
      if (job.enabled !== false && state.nextRunAtMs && state.nextRunAtMs <= Date.now() + WAKEUP_LEEWAY_MS) {
        startedCount += 1;
        await runTask(job.id, { reason });
      }
    }
    return {
      started: startedCount
    };
  }

  function handleProviderWakeup(jobId) {
    runTask(jobId, { reason: "alarm" })
      .catch((error) => console.warn("Scheduled task failed:", error))
      .finally(() => {
        rescheduleAll().catch((error) => console.warn("Failed to reschedule tasks:", error));
      });
  }

  function start() {
    if (started) {
      return restorePromise;
    }
    started = true;
    if (!providerListenerAttached) {
      providerListenerAttached = chromeAlarmProvider.onWakeup(handleProviderWakeup);
    }
    restorePromise = Promise.resolve()
      .then(() => runDueTasks("startup"))
      .then(() => rescheduleAll())
      .catch((error) => {
        console.warn("Failed to start scheduler:", error);
        return {
          provider: PROVIDER_NAME,
          scheduled: 0,
          error: error?.message || String(error)
        };
      });
    return restorePromise;
  }

  async function execute(args = {}, context = {}) {
    const action = String(args.action || "list").trim();

    if (action === "list") {
      return listTasks();
    }

    if (action === "get") {
      const job = await getJobInternal(args.id);
      if (!job) {
        throw new Error(t("scheduler.taskNotFound", { id: args.id || t("common.empty") }));
      }
      const state = await getStateInternal(job.id);
      return {
        task: publicJob(job, state)
      };
    }

    if (action === "create") {
      return {
        task: await createTask(args, context)
      };
    }

    if (action === "update") {
      return {
        task: await updateTask(args.id, args)
      };
    }

    if (action === "delete") {
      return deleteTasksBySelector(args, { keepRuns: args.keepRuns === true });
    }

    if (action === "pause") {
      return {
        task: await pauseTask(args.id, args)
      };
    }

    if (action === "resume") {
      return {
        task: await setTaskEnabled(args.id, true)
      };
    }

    if (action === "run") {
      return runTask(args.id, { manual: true, reason: "manual" });
    }

    if (action === "history" || action === "runs") {
      return getRunHistory(args.id, {
        limit: args.limit,
        full: args.full === true
      });
    }

    if (action === "refresh") {
      return rescheduleAll();
    }

    throw new Error(t("scheduler.unknownAction", { action: action || t("common.empty") }));
  }

  root.DogeclawScheduler = {
    providerName: PROVIDER_NAME,
    start,
    refresh: rescheduleAll,
    runDueTasks,
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    deleteTasks: deleteTasksBySelector,
    pauseTask,
    runTask,
    getRunHistory,
    execute,
    onEvent,
    _private: {
      normalizeSchedule,
      computeNextRunAt,
      getAlarmName,
      getJobIdFromAlarmName
    }
  };
})();
