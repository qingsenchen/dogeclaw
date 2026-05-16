(function () {
  const config = {
    app: {
      name: "dogeclaw",
      displayName: "dogeclaw",
      chineseName: "dogeclaw"
    },
    storage: {
      llmConfigKey: "dogeclaw-llm-config",
      floatingButtonStateKeyPrefix: "dogeclaw-floating-enabled:",
      wechatConfigKey: "dogeclaw-channel-wechat-config",
      wechatStateKey: "dogeclaw-channel-wechat-state",
      wechatLoginKey: "dogeclaw-channel-wechat-login",
      channelHistoryKey: "dogeclaw-channel-history",
      channelSeenKey: "dogeclaw-channel-seen"
    },
    content: {
      rootId: "dogeclaw-root",
      legacyRootIds: [],
      styleId: "dogeclaw-style",
      scriptFiles: ["platform/extension-api.js", "config.js", "i18n.js", "pet.js", "ui.js", "content.js"],
      maxHoverMessages: 24,
      mountWatchdogIntervalMs: 1000,
      positionKeyPrefix: "dogeclaw-position:"
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
    llm: {
      timeoutMs: 120000,
      debug: true,
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
      maxContentLength: 8192
    }
  };

  globalThis.DogeclawConfig = config;
})();
