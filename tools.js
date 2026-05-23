(function () {
  const CONFIG = globalThis.DogeclawConfig || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const CURL_TIMEOUT_MS = CONFIG.tools?.curlTimeoutMs || 30000;
  const CURL_MAX_RESPONSE_BYTES = CONFIG.tools?.curlMaxResponseBytes || 1024 * 1024;
  const CURL_MAX_BODY_BYTES = CONFIG.tools?.curlMaxBodyBytes || 256 * 1024;
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
        name: "curl",
        description:
          "解析并执行安全的 curl HTTP 请求。用于按 skill 指令请求公开 HTTP/HTTPS JSON 或文本资源。不要用于读取本地文件、上传文件、代理或访问本机/内网地址。",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "curl 命令，例如 curl -sS -H 'Accept: application/json' 'https://example.com/data.json'。"
            },
            responseType: {
              type: "string",
              enum: ["auto", "json", "text"],
              description: "响应解析方式，默认 auto。"
            },
            maxBytes: {
              type: "number",
              description: "最多返回的响应字符数，默认使用系统限制。"
            }
          },
          required: ["command"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "browser_control",
        description:
          "控制浏览器。可查看当前页面、列出标签页、新建标签页、导航当前标签页、获取页面 compact snapshot、截图当前可见区域、点击元素、输入文本、滚动、后退、前进或刷新。snapshot 默认只返回给 agent 看的 compact 文本，不返回 refs 明细表；用 @b* ref 执行 click/type，用 @r* ref 滚动可滚动区域，操作后重新 snapshot。",
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
              description: "snapshot 返回的引用。@b* 用于 click/type；@r* 用于 scroll 指定可滚动区域。"
            },
            selector: {
              type: "string",
              description: "可选 CSS 选择器，供 click/type/scroll 使用。优先使用 ref。"
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
              description: "scroll 的横向距离。不传 ref 时滚动页面，传 @r* 时滚动该区域。"
            },
            y: {
              type: "number",
              description: "scroll 的纵向距离。不传 ref 时滚动页面，传 @r* 时滚动该区域。"
            },
            maxItems: {
              type: "number",
              description: "snapshot compact 文本中最多展示的可交互元素数量；refs 明细保存在页面内部，不拼进 prompt。"
            },
            snapshotFormat: {
              type: "string",
              enum: ["compact", "raw"],
              description: "snapshot 输出格式，默认 compact。raw 保留旧 JSON 形态，通常只用于调试。"
            },
            scope: {
              type: "string",
              enum: ["viewport", "all"],
              description: "snapshot 范围，默认 viewport 只看当前视口；all 会扫描整页。"
            },
            maxTextChars: {
              type: "number",
              description: "compact snapshot 可见文本总预算。新版不会截断单条文本；预算不够时整条 text chunk 会被省略并计数。"
            },
            includeUnchanged: {
              type: "boolean",
              description: "compact snapshot 是否包含 diff 中未变化的 fixed/sticky 区域，默认 false。"
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
  const OPTIONAL_TOOL_NAMES = new Set(["curl"]);

  function normalizeToolNameList(value) {
    return (Array.isArray(value) ? value : [])
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  }

  function getSchemaName(schema) {
    return String(schema?.function?.name || schema?.name || "").trim();
  }

  function shouldIncludeSchema(schema, options = {}) {
    const name = getSchemaName(schema);
    if (!OPTIONAL_TOOL_NAMES.has(name)) {
      return true;
    }
    if (options.includeOptional === true) {
      return true;
    }
    const optionalTools = new Set([
      ...normalizeToolNameList(options.optionalTools),
      ...normalizeToolNameList(options.requiredTools)
    ]);
    return optionalTools.has(name);
  }

  function getSchemas(options = {}) {
    return TOOL_SCHEMAS.filter((schema) => shouldIncludeSchema(schema, options));
  }

  function describeTools(options = {}) {
    return getSchemas(options).map((schema) => ({
      name: schema.function.name,
      description: schema.function.description,
      parameters: schema.function.parameters,
      optional: OPTIONAL_TOOL_NAMES.has(schema.function.name)
    }));
  }

  function getOptionalToolNames() {
    return Array.from(OPTIONAL_TOOL_NAMES);
  }

  function tokenizeCurlCommand(command) {
    const source = String(command || "").replace(/\\\r?\n/g, " ");
    const tokens = [];
    let token = "";
    let quote = "";
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        token += char;
        escaped = false;
        continue;
      }

      if (char === "\\" && quote !== "'") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = "";
        } else {
          token += char;
        }
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (token) {
          tokens.push(token);
          token = "";
        }
        continue;
      }

      token += char;
    }

    if (escaped) {
      token += "\\";
    }
    if (quote) {
      throw new Error(t("tool.curlUnterminatedQuote"));
    }
    if (token) {
      tokens.push(token);
    }
    return tokens;
  }

  function getOptionValue(tokens, index, option) {
    if (index + 1 >= tokens.length) {
      throw new Error(t("tool.curlOptionValueRequired", { option }));
    }
    return {
      value: tokens[index + 1],
      nextIndex: index + 1
    };
  }

  function assertSafeCurlData(value, option) {
    const text = String(value || "");
    if (text.startsWith("@")) {
      throw new Error(t("tool.curlFileDataUnsupported", { option }));
    }
    if (text.length > CURL_MAX_BODY_BYTES) {
      throw new Error(t("tool.curlBodyTooLarge"));
    }
  }

  function isBlockedCurlHostname(hostname) {
    const value = String(hostname || "").toLowerCase();
    if (!value || value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local")) {
      return true;
    }
    if (value === "::1" || value === "[::1]" || value === "0.0.0.0") {
      return true;
    }

    const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) {
      return false;
    }

    const octets = ipv4.slice(1).map((item) => Number(item));
    if (octets.some((item) => item < 0 || item > 255)) {
      return true;
    }
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }

  function normalizeCurlUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || "").trim());
    } catch {
      throw new Error(t("tool.curlUrlInvalid"));
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(t("tool.curlUnsupportedProtocol"));
    }
    if (isBlockedCurlHostname(parsed.hostname)) {
      throw new Error(t("tool.curlBlockedHost", { host: parsed.hostname || "" }));
    }
    parsed.hash = "";
    return parsed;
  }

  function setCurlHeader(headers, headerLine) {
    const separatorIndex = String(headerLine || "").indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(t("tool.curlHeaderInvalid"));
    }

    const name = headerLine.slice(0, separatorIndex).trim();
    const value = headerLine.slice(separatorIndex + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error(t("tool.curlHeaderInvalid"));
    }
    headers[name] = value;
  }

  function appendCurlUrl(url, value) {
    if (url) {
      throw new Error(t("tool.curlMultipleUrls"));
    }
    return String(value || "").trim();
  }

  function parseCurlCommand(command) {
    const tokens = tokenizeCurlCommand(command);
    if (!tokens.length || tokens[0] !== "curl") {
      throw new Error(t("tool.curlCommandInvalid"));
    }

    const headers = {};
    const bodyParts = [];
    let method = "";
    let url = "";
    let dataInQuery = false;
    let timeoutMs = CURL_TIMEOUT_MS;
    let followRedirect = false;

    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];

      if (token === "--") {
        const next = getOptionValue(tokens, index, "--");
        url = appendCurlUrl(url, next.value);
        index = next.nextIndex;
        continue;
      }

      if (!token.startsWith("-")) {
        url = appendCurlUrl(url, token);
        continue;
      }

      if (token === "-s" || token === "-S" || token === "-sS" || token === "--silent" || token === "--show-error" || token === "--compressed") {
        continue;
      }
      if (token === "-L" || token === "--location") {
        followRedirect = true;
        continue;
      }
      if (token === "-G" || token === "--get") {
        dataInQuery = true;
        continue;
      }
      if (token === "-I" || token === "--head") {
        method = "HEAD";
        continue;
      }

      const longOption = token.match(/^--([^=]+)=(.*)$/);
      const option = longOption ? `--${longOption[1]}` : token;
      const inlineValue = longOption ? longOption[2] : "";
      const valueFor = () => {
        if (longOption) {
          return { value: inlineValue, nextIndex: index };
        }
        return getOptionValue(tokens, index, option);
      };

      if (option === "-X" || option === "--request" || (token.startsWith("-X") && token.length > 2)) {
        const next = token.startsWith("-X") && token.length > 2
          ? { value: token.slice(2), nextIndex: index }
          : valueFor();
        method = String(next.value || "").trim().toUpperCase();
        index = next.nextIndex;
        continue;
      }

      if (option === "-H" || option === "--header" || (token.startsWith("-H") && token.length > 2)) {
        const next = token.startsWith("-H") && token.length > 2
          ? { value: token.slice(2), nextIndex: index }
          : valueFor();
        setCurlHeader(headers, next.value);
        index = next.nextIndex;
        continue;
      }

      if (option === "-d" || option === "--data" || option === "--data-raw" || option === "--data-binary" || (token.startsWith("-d") && token.length > 2)) {
        const next = token.startsWith("-d") && token.length > 2
          ? { value: token.slice(2), nextIndex: index }
          : valueFor();
        assertSafeCurlData(next.value, option);
        bodyParts.push(String(next.value || ""));
        index = next.nextIndex;
        continue;
      }

      if (option === "--url") {
        const next = valueFor();
        url = appendCurlUrl(url, next.value);
        index = next.nextIndex;
        continue;
      }

      if (option === "-m" || option === "--max-time") {
        const next = valueFor();
        const seconds = Number(next.value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new Error(t("tool.curlInvalidTimeout"));
        }
        timeoutMs = Math.min(120000, Math.max(1000, Math.round(seconds * 1000)));
        index = next.nextIndex;
        continue;
      }

      if (option === "-A" || option === "--user-agent") {
        const next = valueFor();
        headers["User-Agent"] = String(next.value || "");
        index = next.nextIndex;
        continue;
      }

      if (["-o", "-O", "--output", "--remote-name", "-F", "--form", "-T", "--upload-file", "--proxy", "--unix-socket", "--netrc", "--config", "-K", "--cookie-jar", "-u", "--user"].includes(option)) {
        throw new Error(t("tool.curlUnsupportedOption", { option }));
      }

      throw new Error(t("tool.curlUnsupportedOption", { option }));
    }

    if (!url) {
      throw new Error(t("tool.curlUrlRequired"));
    }

    const parsedUrl = normalizeCurlUrl(url);
    if (bodyParts.length && dataInQuery) {
      const query = bodyParts.join("&");
      parsedUrl.search = parsedUrl.search ? `${parsedUrl.search}&${query}` : `?${query}`;
    }

    const body = bodyParts.length && !dataInQuery ? bodyParts.join("&") : "";
    const normalizedMethod = method || (body ? "POST" : "GET");
    if (!/^[A-Z]+$/.test(normalizedMethod)) {
      throw new Error(t("tool.curlMethodInvalid"));
    }
    if (body && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    return {
      method: normalizedMethod,
      url: parsedUrl.href,
      headers,
      body: normalizedMethod === "GET" || normalizedMethod === "HEAD" ? "" : body,
      timeoutMs,
      followRedirect
    };
  }

  function maskRequestHeaders(headers) {
    return Object.fromEntries(
      Object.entries(headers || {}).map(([name, value]) => {
        const lowerName = name.toLowerCase();
        if (["authorization", "cookie", "proxy-authorization"].includes(lowerName)) {
          return [name, "configured"];
        }
        return [name, value];
      })
    );
  }

  function getFetchHeaders(headers) {
    const forbidden = new Set(["host", "content-length", "user-agent", "origin", "referer"]);
    return Object.fromEntries(
      Object.entries(headers || {}).filter(([name]) => !forbidden.has(name.toLowerCase()))
    );
  }

  function getResponseHeaders(response) {
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return headers;
  }

  function shouldParseJson(responseType, response, text) {
    if (responseType === "json") {
      return true;
    }
    if (responseType === "text") {
      return false;
    }
    const contentType = response.headers.get("content-type") || "";
    return /json/i.test(contentType) || /^[\s\n\r]*[\[{]/.test(text);
  }

  async function executeCurlRequest(args = {}) {
    const command = String(args.command || "").trim();
    if (!command) {
      throw new Error(t("tool.curlCommandRequired"));
    }

    const parsed = parseCurlCommand(command);
    const responseType = ["auto", "json", "text"].includes(args.responseType) ? args.responseType : "auto";
    const maxBytes = Math.max(1024, Math.min(CURL_MAX_RESPONSE_BYTES, Number(args.maxBytes) || CURL_MAX_RESPONSE_BYTES));
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), parsed.timeoutMs);

    try {
      const response = await fetch(parsed.url, {
        method: parsed.method,
        headers: getFetchHeaders(parsed.headers),
        body: parsed.body || undefined,
        redirect: parsed.followRedirect ? "follow" : "manual",
        signal: controller.signal
      });
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > maxBytes) {
        throw new Error(t("tool.curlResponseTooLarge"));
      }

      const rawText = await response.text();
      const truncated = rawText.length > maxBytes;
      const text = truncated ? rawText.slice(0, maxBytes) : rawText;
      let json = null;
      let jsonParsed = false;
      if (shouldParseJson(responseType, response, text)) {
        try {
          json = JSON.parse(text);
          jsonParsed = true;
        } catch (error) {
          if (responseType === "json") {
            throw new Error(t("tool.curlJsonInvalid"));
          }
        }
      }

      return {
        ok: response.ok,
        request: {
          method: parsed.method,
          url: parsed.url,
          headers: maskRequestHeaders(parsed.headers),
          hasBody: Boolean(parsed.body)
        },
        response: {
          status: response.status,
          ok: response.ok,
          url: response.url,
          headers: getResponseHeaders(response),
          truncated,
          ...(jsonParsed ? { json } : { text })
        }
      };
    } finally {
      clearTimeout(timerId);
    }
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
      systemPrompt: config.systemPrompt || "",
      capabilities: {
        imageInput: config.capabilities?.imageInput === true,
        imageInputStatus: config.capabilities?.imageInputStatus || "unknown",
        imageInputCheckedAt: Number(config.capabilities?.imageInputCheckedAt) || 0
      }
    };
  }

  function assertExtensionApi(name, value) {
    if (!value) {
      throw new Error(t("runtime.extensionApiUnavailable", { name }));
    }
  }

  async function getActiveHttpTab() {
    assertExtensionApi("tabs.query", PLATFORM.tabs?.query);
    const tabs = await PLATFORM.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
      throw new Error(t("tool.noControllableTab"));
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
      throw new Error(result.error || t("tool.openLlmFormFailed"));
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
      throw new Error(t("tool.llmConfigRuntimeUnavailable"));
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
        throw new Error(t("tool.noConfigFields"));
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

    throw new Error(t("tool.unknownSystemConfigAction", { action: action || t("common.empty") }));
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
      throw new Error(result.error || t("tool.openChannelConfigFailed"));
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
            displayName: t("channel.wechatDisplayName"),
            configMode: "qrcode"
          }
        ]
      };
    }

    const runtime = getChannelRuntime(channel);
    if (!runtime) {
      throw new Error(t("tool.unknownChannel", { channel: channel || t("common.empty") }));
    }

    if (action === "get_config") {
      return runtime.getConfig({ masked: true });
    }

    if (action === "open_config") {
      return openChannelConfigForm(channel);
    }

    if (action === "start_config") {
      if (!runtime.startLogin) {
        throw new Error(t("tool.channelInteractiveUnsupported", { channel }));
      }
      const login = await runtime.startLogin();
      await openChannelConfigForm(channel);
      return {
        channel,
        opened: true,
        status: login.status || "pending",
        message: t("tool.channelConfigOpened"),
        qrcodeDisplayed: true
      };
    }

    if (action === "check_config") {
      if (!runtime.checkLoginStatus) {
        throw new Error(t("tool.channelStatusUnsupported", { channel }));
      }
      const status = await runtime.checkLoginStatus();
      return {
        channel,
        status: status.status || "",
        message: status.message || "",
        configured: status.status === "confirmed"
      };
    }

    throw new Error(t("tool.unknownChannelConfigAction", { action: action || t("common.empty") }));
  }

  async function execute(name, args, context = {}) {
    if (name === "curl") {
      return executeCurlRequest(args);
    }

    if (name === "browser_control") {
      if (!globalThis.DogeclawBrowser?.execute) {
        throw new Error(t("tool.browserRuntimeUnavailable"));
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

    throw new Error(t("tool.unknown", { tool: name || t("common.empty") }));
  }

  globalThis.DogeclawTools = {
    getSchemas,
    getOptionalToolNames,
    describeTools,
    parseCurlCommand,
    execute
  };
})();
