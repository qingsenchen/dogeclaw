(function () {
  const config = {
    app: {
      name: "dogeclaw",
      displayName: "dogeclaw",
      chineseName: "dogeclaw"
    },
    storage: {
      llmConfigKey: "dogeclaw-llm-config",
      skillConfigKey: "dogeclaw-skill-config",
      floatingButtonStateKeyPrefix: "dogeclaw-floating-enabled:",
      tabConversationKeyPrefix: "dogeclaw-tab-conversation:",
      wechatConfigKey: "dogeclaw-channel-wechat-config",
      wechatStateKey: "dogeclaw-channel-wechat-state",
      wechatLoginKey: "dogeclaw-channel-wechat-login",
      channelHistoryKey: "dogeclaw-channel-history",
      channelSeenKey: "dogeclaw-channel-seen",
      scheduledTaskStoreKey: "dogeclaw-scheduled-tasks",
      scheduledTaskStateStoreKey: "dogeclaw-scheduled-task-states",
      scheduledTaskRunStoreKey: "dogeclaw-scheduled-task-runs"
    },
    content: {
      rootId: "dogeclaw-root",
      legacyRootIds: [],
      styleId: "dogeclaw-style",
      scriptFiles: [
        "platform/extension-api.js",
        "config.js",
        "i18n.js",
        "pet.js",
        "ui.js",
        "content/styles.js",
        "content/browser-actions.js",
        "content/game.js",
        "content/index.js"
      ],
      maxHoverMessages: 24,
      mountWatchdogIntervalMs: 1000,
      positionKeyPrefix: "dogeclaw-position:",
      inputImageMaxCount: 5,
      inputImageMaxDimension: 1536,
      inputImageCompressQuality: 0.82,
      inputImageDataUrlMaxLength: 1200000,
      inputImagesTotalDataUrlMaxLength: 3600000,
      transientTipDismissMs: 10000
    },
    background: {
      sendSelectionMenuId: "dogeclaw-send-selection",
      channelPollAlarm: "dogeclaw-channel-poll"
    },
    channel: {
      historyLimit: 12,
      seenLimit: 200,
      alarmPeriodMinutes: 0.5,
      defaultActivePollDurationMs: 180000,
      confirmedActivePollDurationMs: 300000,
      fastPollDelayMs: 250,
      emptyPollDelayMs: 2000,
      loginPollDurationMs: 300000,
      loginPollInitialDelayMs: 1200,
      loginPollIntervalMs: 2500,
      minLongPollTimeoutMs: 5000
    },
    scheduler: {
      alarmPrefix: "dogeclaw-scheduled-task:",
      maxTasks: 64,
      maxNameLength: 120,
      maxPromptLength: 16000,
      maxRunContentLength: 4000,
      runHistoryLimit: 50,
      minIntervalMinutes: 1,
      minAlarmDelayMs: 1000,
      wakeupLeewayMs: 15000
    },
    llm: {
      timeoutMs: 120000,
      imageInputProbeTimeoutMs: 15000,
      streamIncludeUsage: true,
      debug: false,
      contextWindowDefault: 32000,
      contextWindows: {
        "gpt-4o-mini": 128000,
        "gpt-4o": 128000,
        "gpt-5.4": 128000,
        "o4-mini": 200000,
        "deepseek-chat": 64000,
        "deepseek-reasoner": 64000,
        "deepseek/deepseek-chat": 64000,
        "deepseek/deepseek-reasoner": 64000,
        "qwen-plus": 128000,
        "qwen-max": 128000,
        "qwen3-235b-a22b": 128000,
        "openai/qwen-plus": 128000,
        "openai/qwen-max": 128000,
        "openai/qwen3-235b-a22b": 128000,
        "kimi-k2.5": 128000,
        "glm-4-plus": 128000,
        "openai/kimi-k2.5": 128000,
        "openai/glm-4-plus": 128000,
        "gemini-2.5-flash": 1000000,
        "gemini-2.5-pro": 1000000,
        "claude-sonnet-4-6-20250514": 200000,
        "claude-opus-4-6-20250514": 200000,
        "claude-haiku-4-5-20251001": 200000
      },
      modelAliases: {
        deepseek: "deepseek/deepseek-chat",
        "deepseek-r1": "deepseek/deepseek-reasoner",
        qwen: "openai/qwen-plus",
        "qwen-max": "openai/qwen-max",
        qwen3: "openai/qwen3-235b-a22b",
        gpt5: "gpt-5.4",
        "gpt-5": "gpt-5.4",
        "gpt-5.4": "gpt-5.4",
        gpt4o: "gpt-4o",
        "gpt-4o": "gpt-4o",
        "gpt-4o-mini": "gpt-4o-mini",
        "o4-mini": "o4-mini",
        claude: "claude-sonnet-4-6-20250514",
        "claude-opus": "claude-opus-4-6-20250514",
        "claude-haiku": "claude-haiku-4-5-20251001",
        gemini: "gemini/gemini-2.5-flash",
        "gemini-pro": "gemini/gemini-2.5-pro",
        kimi: "openai/kimi-k2.5",
        glm: "openai/glm-4-plus"
      },
      defaultConfig: {
        model: "gpt-4o-mini",
        apiBase: "https://api.openai.com/v1",
        apiKey: "",
        systemPrompt: ""
      }
    },
    wechat: {
      defaultTimeoutMs: 30000,
      qrLongPollTimeoutMs: 35000,
      activeLoginTtlMs: 5 * 60 * 1000,
      defaultLoginWaitTimeoutMs: 480000,
      maxQrRefreshCount: 3,
      defaultBotType: "3",
      fixedQrBaseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
      defaultAppId: "bot",
      defaultClientVersion: "131336",
      channelVersion: "2.1.8",
      configTimeoutMs: 10000,
      configCacheTtlMs: 24 * 60 * 60 * 1000,
      configCacheInitialRetryMs: 2000,
      configCacheMaxRetryMs: 60 * 60 * 1000,
      typingKeepaliveIntervalMs: 5000,
      typingStatus: {
        typing: 1,
        cancel: 2
      },
      mediaMaxBytes: 100 * 1024 * 1024,
      mediaUploadMaxRetries: 3,
      defaultLongPollTimeoutMs: 35000,
      maxLongPollTimeoutMs: 35000,
      defaultConfig: {
        enabled: false,
        apiBase: "https://ilinkai.weixin.qq.com",
        cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
        token: "",
        appId: "bot",
        clientVersion: "131336",
        accountId: "",
        uin: ""
      }
    },
    tools: {
      weatherTimeoutMs: 12000
    },
    browser: {
      actionTimeoutMs: 10000,
      maxSnapshotItems: 80,
      screenshotDataUrlLimit: 1200000,
      screenshotJpegQuality: 90,
      maxArtifacts: 20
    },
    agent: {
      maxIterations: 20,
      maxMessages: 20,
      maxContentLengthRatio: 0.5
    }
  };

  globalThis.DogeclawConfig = config;
})();
