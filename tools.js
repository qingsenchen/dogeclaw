(function () {
  const CONFIG = globalThis.DogeclawConfig || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const WEATHER_TIMEOUT_MS = CONFIG.tools?.weatherTimeoutMs || 12000;
  const CONTENT_SCRIPT_FILES = CONFIG.content?.scriptFiles || [
    "config.js",
    "pet.js",
    "ui.js",
    "content/styles.js",
    "content/browser-actions.js",
    "content/index.js"
  ];

  const TOOL_SCHEMAS = [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "查询指定城市或地区的实时天气。当用户询问天气、温度、是否下雨、风力、湿度等信息时使用。",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "城市、地区或地点名称，例如 Beijing、上海、Tokyo。"
            }
          },
          required: ["location"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "browser_control",
        description:
          "控制浏览器。可查看当前页面、列出标签页、新建标签页、导航当前标签页、获取页面元素快照、截图当前可见区域、点击元素、输入文本、滚动、后退、前进或刷新。需要先 snapshot 获取可操作元素 ref，再 click/type。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "current_tab",
                "list_tabs",
                "new_tab",
                "navigate",
                "snapshot",
                "screenshot",
                "click",
                "type",
                "scroll",
                "back",
                "forward",
                "reload"
              ],
              description: "要执行的浏览器动作。"
            },
            url: {
              type: "string",
              description: "navigate 或 new_tab 动作的目标 URL。new_tab 不传 URL 时会打开空白新标签页。"
            },
            active: {
              type: "boolean",
              description: "new_tab 时新标签页是否立即激活，默认 true。"
            },
            tabId: {
              type: "number",
              description: "可选标签页 ID。screenshot 可指定已打开的标签页；未提供时使用当前活动标签页。"
            },
            ref: {
              type: "string",
              description: "snapshot 返回的元素引用，供 click/type 使用。"
            },
            selector: {
              type: "string",
              description: "可选 CSS 选择器，供 click/type 使用。优先使用 ref。"
            },
            text: {
              type: "string",
              description: "type 的输入内容，或 click 时用于按可见文本寻找元素。"
            },
            clear: {
              type: "boolean",
              description: "type 前是否清空输入框，默认 true。"
            },
            submit: {
              type: "boolean",
              description: "type 后是否触发 Enter 提交，默认 false。"
            },
            x: {
              type: "number",
              description: "scroll 的横向距离。"
            },
            y: {
              type: "number",
              description: "scroll 的纵向距离。"
            },
            maxItems: {
              type: "number",
              description: "snapshot 最多返回的可交互元素数量。"
            },
            format: {
              type: "string",
              enum: ["png", "jpeg"],
              description: "screenshot 的图片格式，默认 png。"
            },
            quality: {
              type: "number",
              description: "screenshot 使用 jpeg 时的质量，1-100。"
            },
            includeDataUrl: {
              type: "boolean",
              description: "screenshot 是否在工具结果中返回 data URL。通常保持 false，避免上下文过大。"
            },
            showInChat: {
              type: "boolean",
              description: "screenshot 后是否直接在当前网页的 dogeclaw 聊天气泡中展示图片。网页会话默认 true，微信通道默认 false。"
            },
            includeDogeclawUi: {
              type: "boolean",
              description: "screenshot 是否把 dogeclaw 悬浮按钮也截进去，默认 false。"
            },
            waitForLoad: {
              type: "boolean",
              description: "screenshot 前是否等待目标标签页加载完成，默认 true。"
            }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "system_config",
        description:
          "管理 dogeclaw 系统配置。用户想查看当前模型、切换模型、修改 API Key/Base URL、修改 LLM 提供商或打开 LLM 提供商配置表单时使用。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["get_llm_config", "set_llm_config", "open_llm_provider_form"],
              description: "配置动作。get_llm_config 查询当前配置；set_llm_config 修改配置；open_llm_provider_form 打开配置表单让用户手动修改提供商。"
            },
            model: {
              type: "string",
              description: "set_llm_config 时要切换到的模型名称。"
            },
            apiBase: {
              type: "string",
              description: "set_llm_config 时要设置的 OpenAI-compatible Base URL。"
            },
            apiKey: {
              type: "string",
              description: "set_llm_config 时要设置的 API Key。不要在回复中明文展示 API Key。"
            },
            systemPrompt: {
              type: "string",
              description: "可选，设置系统提示词。"
            }
          },
          required: ["action"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "channel_config",
        description:
          "管理 dogeclaw 的消息频道配置。用户想把消息发到微信/wechat、查看或配置频道、频道未配置时打开配置界面时使用。本工具只负责频道配置，不负责实际收发消息。微信扫码二维码会直接展示在页面配置卡片中，不要把二维码链接发给用户。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list_channels", "get_config", "open_config", "start_config", "check_config"],
              description: "频道配置动作。start_config 会发起扫码配置并打开页面配置卡片展示二维码；check_config 检查扫码是否完成。"
            },
            channel: {
              type: "string",
              enum: ["wechat"],
              description: "频道名称，目前支持 wechat。"
            }
          },
          required: ["action"]
        }
      }
    }
  ];

  function getSchemas() {
    return TOOL_SCHEMAS.slice();
  }

  function describeTools() {
    return TOOL_SCHEMAS.map((schema) => ({
      name: schema.function.name,
      description: schema.function.description,
      parameters: schema.function.parameters
    }));
  }

  function normalizeLocation(location) {
    return String(location || "").trim();
  }

  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`weather request failed: ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timerId);
    }
  }

  function getCurrentCondition(payload) {
    return Array.isArray(payload?.current_condition) ? payload.current_condition[0] || {} : {};
  }

  function getWeatherDescription(condition) {
    const item = Array.isArray(condition.weatherDesc) ? condition.weatherDesc[0] : null;
    return item?.value || "";
  }

  function getNearestArea(payload, fallback) {
    const area = Array.isArray(payload?.nearest_area) ? payload.nearest_area[0] || {} : {};
    const city = Array.isArray(area.areaName) ? area.areaName[0]?.value : "";
    const region = Array.isArray(area.region) ? area.region[0]?.value : "";
    const country = Array.isArray(area.country) ? area.country[0]?.value : "";
    return [city, region, country].filter(Boolean).join(", ") || fallback;
  }

  async function getWeather(args = {}) {
    const location = normalizeLocation(args.location);
    if (!location) {
      throw new Error("location is required");
    }

    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const payload = await fetchJson(url, WEATHER_TIMEOUT_MS);
    const condition = getCurrentCondition(payload);

    return {
      location: getNearestArea(payload, location),
      query: location,
      description: getWeatherDescription(condition),
      temperatureC: condition.temp_C || "",
      feelsLikeC: condition.FeelsLikeC || "",
      humidity: condition.humidity || "",
      windKmph: condition.windspeedKmph || "",
      windDirection: condition.winddir16Point || "",
      observationTime: condition.observation_time || "",
      source: "wttr.in"
    };
  }

  function maskSecret(value) {
    const text = String(value || "");
    if (!text) {
      return "";
    }
    return text.length <= 8 ? "configured" : `${text.slice(0, 4)}...${text.slice(-4)}`;
  }

  function sanitizeLlmConfigStatus(status) {
    const config = status?.config || {};
    return {
      userConfigured: Boolean(status?.userConfigured),
      model: config.model || "",
      providerModel: globalThis.DogeclawLLM?.getProviderModelName ? DogeclawLLM.getProviderModelName(config.model) : config.model || "",
      apiBase: config.apiBase || "",
      apiKey: config.apiKey ? maskSecret(config.apiKey) : "",
      systemPrompt: config.systemPrompt || ""
    };
  }

  function assertExtensionApi(name, value) {
    if (!value) {
      throw new Error(`Extension API unavailable: ${name}`);
    }
  }

  async function getActiveHttpTab() {
    assertExtensionApi("tabs.query", PLATFORM.tabs?.query);
    const tabs = await PLATFORM.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
      throw new Error("No controllable active tab found");
    }
    return tab;
  }

  async function ensureDogeclawContentScript(tab) {
    try {
      const existing = await PLATFORM.tabs.sendMessage(tab.id, { type: "getFloatingButtonVisible" });
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

  async function openLlmProviderForm() {
    const tab = await getActiveHttpTab();
    await ensureDogeclawContentScript(tab);
    const result = await PLATFORM.tabs.sendMessage(tab.id, {
      type: "openLlmProviderConfig"
    });
    if (result?.ok === false) {
      throw new Error(result.error || "failed to open LLM provider form");
    }
    return {
      opened: true,
      tabId: tab.id,
      url: tab.url || ""
    };
  }

  async function executeSystemConfig(args = {}) {
    const action = String(args.action || "").trim();
    if (!globalThis.DogeclawLLM) {
      throw new Error("LLM config runtime is unavailable");
    }

    if (action === "get_llm_config") {
      return sanitizeLlmConfigStatus(await DogeclawLLM.getConfigStatus());
    }

    if (action === "set_llm_config") {
      const config = {};
      if (typeof args.model === "string" && args.model.trim()) {
        config.model = args.model.trim();
      }
      if (typeof args.apiBase === "string" && args.apiBase.trim()) {
        config.apiBase = args.apiBase.trim();
      }
      if (typeof args.apiKey === "string" && args.apiKey.trim()) {
        config.apiKey = args.apiKey.trim();
      }
      if (typeof args.systemPrompt === "string" && args.systemPrompt.trim()) {
        config.systemPrompt = args.systemPrompt.trim();
      }
      if (!Object.keys(config).length) {
        throw new Error("No config fields provided");
      }
      await DogeclawLLM.setConfig(config);
      return {
        saved: true,
        ...(sanitizeLlmConfigStatus(await DogeclawLLM.getConfigStatus()))
      };
    }

    if (action === "open_llm_provider_form") {
      return openLlmProviderForm();
    }

    throw new Error(`Unknown system config action: ${action || "(empty)"}`);
  }

  function getChannelRuntime(channel) {
    if (channel === "wechat") {
      return globalThis.DogeclawWechatChannel;
    }
    return null;
  }

  async function openChannelConfigForm(channel) {
    const tab = await getActiveHttpTab();
    await ensureDogeclawContentScript(tab);
    const result = await PLATFORM.tabs.sendMessage(tab.id, {
      type: "openChannelConfig",
      channel
    });
    if (result?.ok === false) {
      throw new Error(result.error || "failed to open channel config");
    }
    return {
      opened: true,
      channel,
      tabId: tab.id
    };
  }

  async function executeChannelConfig(args = {}) {
    const action = String(args.action || "").trim();
    const channel = String(args.channel || "wechat").trim();

    if (action === "list_channels") {
      return {
        channels: [
          {
            id: "wechat",
            name: "WeChat",
            displayName: "微信",
            configMode: "qrcode"
          }
        ]
      };
    }

    const runtime = getChannelRuntime(channel);
    if (!runtime) {
      throw new Error(`Unknown channel: ${channel || "(empty)"}`);
    }

    if (action === "get_config") {
      return runtime.getConfig({ masked: true });
    }

    if (action === "open_config") {
      return openChannelConfigForm(channel);
    }

    if (action === "start_config") {
      if (!runtime.startLogin) {
        throw new Error(`${channel} does not support interactive config`);
      }
      const login = await runtime.startLogin();
      await openChannelConfigForm(channel);
      return {
        channel,
        opened: true,
        status: login.status || "pending",
        message: "配置界面已打开，二维码已直接展示在配置卡片中，请用户使用微信扫码。",
        qrcodeDisplayed: true
      };
    }

    if (action === "check_config") {
      if (!runtime.checkLoginStatus) {
        throw new Error(`${channel} does not support config status checks`);
      }
      const status = await runtime.checkLoginStatus();
      return {
        channel,
        status: status.status || "",
        message: status.message || "",
        configured: status.status === "confirmed"
      };
    }

    throw new Error(`Unknown channel config action: ${action || "(empty)"}`);
  }

  async function execute(name, args, context = {}) {
    if (name === "get_weather") {
      return getWeather(args);
    }

    if (name === "browser_control") {
      if (!globalThis.DogeclawBrowser?.execute) {
        throw new Error("browser control runtime is unavailable");
      }
      const nextArgs = { ...(args || {}) };
      if (nextArgs.action === "screenshot") {
        nextArgs.artifactScope = context.channel && context.conversationId
          ? `${context.channel}:${context.conversationId}`
          : "page";
        nextArgs.showInChat = nextArgs.showInChat ?? context.channel !== "wechat";
        nextArgs.includeDataUrl = Boolean(nextArgs.includeDataUrl);
      }
      return DogeclawBrowser.execute(nextArgs, context);
    }

    if (name === "system_config") {
      return executeSystemConfig(args);
    }

    if (name === "channel_config") {
      return executeChannelConfig(args);
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  globalThis.DogeclawTools = {
    getSchemas,
    describeTools,
    execute
  };
})();
