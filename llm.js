(function () {
  const CONFIG = globalThis.DogeclawConfig || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const LLM_CONFIG = CONFIG.llm || {};
  const LLM_CONFIG_KEY = CONFIG.storage?.llmConfigKey || "dogeclaw-llm-config";
  const LLM_TIMEOUT_MS = LLM_CONFIG.timeoutMs || 120000;
  const LLM_HISTORY_LIMIT = LLM_CONFIG.maxMessages || 32;
  const IMAGE_INPUT_PROBE_TIMEOUT_MS = LLM_CONFIG.imageInputProbeTimeoutMs || 15000;
  const IMAGE_INPUT_PROBE_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const MODEL_ALIASES = LLM_CONFIG.modelAliases || {};
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const DEFAULT_CONFIG = LLM_CONFIG.defaultConfig || {
    model: "gpt-4o-mini",
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
    systemPrompt: t("system.prompt")
  };
  const DEBUG_LLM = LLM_CONFIG.debug === true;

  function getLocalStorage() {
    const storage = PLATFORM.storage?.local;
    if (!storage?.get || !storage?.set) {
      throw new Error("Extension storage API unavailable");
    }
    return storage;
  }

  function cloneForLog(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function maskApiKey(apiKey) {
    const text = String(apiKey || "");
    if (!text) {
      return "";
    }

    return `${text.slice(0, 4)}...${text.slice(-4)}`;
  }

  function debugLog(label, payload) {
    if (!DEBUG_LLM) {
      return;
    }

    console.debug(`[dogeclaw llm] ${label}`, cloneForLog(payload));
  }

  function resolveModel(model) {
    const raw = String(model || DEFAULT_CONFIG.model).trim();
    return MODEL_ALIASES[raw] || raw;
  }

  function getProviderModelName(model) {
    const resolved = resolveModel(model);
    if (resolved.startsWith("deepseek/") || resolved.startsWith("openai/")) {
      return resolved.split("/").slice(1).join("/");
    }

    return resolved;
  }

  function normalizeCapabilities(capabilities = {}) {
    const status = String(capabilities.imageInputStatus || "").trim();
    const imageInput = capabilities.imageInput === true || status === "supported";
    return {
      imageInput,
      imageInputStatus: imageInput
        ? "supported"
        : ["unsupported", "unknown"].includes(status)
          ? status
          : "unknown",
      imageInputCheckedAt: Number(capabilities.imageInputCheckedAt) || 0,
      imageInputError: String(capabilities.imageInputError || "").slice(0, 500)
    };
  }

  function isImageInputUnsupportedError(error) {
    const message = String(error || "");
    return /(image_url|image input|vision|multimodal)/i.test(message)
      && /(unknown variant|expected text|unsupported|not support|does not support|invalid type|only text)/i.test(message);
  }

  function getProviderErrorMessage(payload, fallback) {
    return String(payload?.error?.message || payload?.message || fallback || "");
  }

  async function getConfig() {
    const result = await getLocalStorage().get(LLM_CONFIG_KEY);
    const stored = result[LLM_CONFIG_KEY] && typeof result[LLM_CONFIG_KEY] === "object" ? result[LLM_CONFIG_KEY] : {};
    const model = String(stored.model || "").trim() || DEFAULT_CONFIG.model;
    const apiBase = String(stored.apiBase || "").trim() || DEFAULT_CONFIG.apiBase;
    const apiKey = String(stored.apiKey || "").trim() || DEFAULT_CONFIG.apiKey;
    const systemPrompt = String(stored.systemPrompt || "").trim() || DEFAULT_CONFIG.systemPrompt || t("system.prompt");

    return {
      ...DEFAULT_CONFIG,
      ...stored,
      model: resolveModel(model),
      apiBase,
      apiKey,
      systemPrompt,
      capabilities: normalizeCapabilities(stored.capabilities || DEFAULT_CONFIG.capabilities)
    };
  }

  async function getConfigStatus() {
    const result = await getLocalStorage().get(LLM_CONFIG_KEY);
    const stored = result[LLM_CONFIG_KEY] && typeof result[LLM_CONFIG_KEY] === "object" ? result[LLM_CONFIG_KEY] : {};
    const config = await getConfig();
    const userConfigured = Boolean(
      String(stored.model || "").trim() &&
      String(stored.apiBase || "").trim() &&
      String(stored.apiKey || "").trim()
    );

    return {
      config,
      userConfigured
    };
  }

  async function setConfig(config) {
    const current = await getConfig();
    const incoming = config && typeof config === "object" ? config : {};
    const next = {
      ...current,
      ...incoming
    };

    next.model = resolveModel(next.model);
    const shouldProbeImageInput =
      ["apiBase", "apiKey", "model"].some((field) => Object.prototype.hasOwnProperty.call(incoming, field)) ||
      !next.capabilities?.imageInputCheckedAt;
    next.capabilities = shouldProbeImageInput
      ? await probeImageInputCapability(next)
      : normalizeCapabilities(next.capabilities);
    await getLocalStorage().set({ [LLM_CONFIG_KEY]: next });
    return next;
  }

  async function probeImageInputCapability(config) {
    const checkedAt = Date.now();
    const apiBase = String(config.apiBase || "").replace(/\/+$/g, "");
    if (!apiBase || !config.apiKey) {
      return {
        imageInput: false,
        imageInputStatus: "unknown",
        imageInputCheckedAt: checkedAt,
        imageInputError: !apiBase ? "LLM apiBase is not configured" : "LLM API key is not configured"
      };
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), IMAGE_INPUT_PROBE_TIMEOUT_MS);
    const url = `${apiBase}/chat/completions`;
    const body = {
      model: getProviderModelName(config.model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Reply with OK." },
            { type: "image_url", image_url: { url: IMAGE_INPUT_PROBE_DATA_URL } }
          ]
        }
      ],
      temperature: 0,
      stream: false
    };

    try {
      debugLog("image input probe request", {
        url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${maskApiKey(config.apiKey)}`
        },
        body
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      debugLog("image input probe response", {
        status: response.status,
        ok: response.ok,
        body: payload
      });

      if (response.ok) {
        return {
          imageInput: true,
          imageInputStatus: "supported",
          imageInputCheckedAt: checkedAt,
          imageInputError: ""
        };
      }

      const errorMessage = getProviderErrorMessage(payload, `LLM request failed: ${response.status}`);
      return {
        imageInput: false,
        imageInputStatus: isImageInputUnsupportedError(errorMessage) ? "unsupported" : "unknown",
        imageInputCheckedAt: checkedAt,
        imageInputError: errorMessage.slice(0, 500)
      };
    } catch (error) {
      const errorMessage = error?.name === "AbortError"
        ? "Image input probe timed out"
        : error?.message || String(error);
      return {
        imageInput: false,
        imageInputStatus: "unknown",
        imageInputCheckedAt: checkedAt,
        imageInputError: String(errorMessage).slice(0, 500)
      };
    } finally {
      clearTimeout(timerId);
    }
  }

  function normalizeMessage(message) {
    const role = ["system", "user", "assistant", "tool"].includes(message?.role) ? message.role : "user";
    const normalized = {
      role,
      content: typeof message?.content === "string" ? message.content : message?.content || ""
    };

    if (message?.tool_call_id) {
      normalized.tool_call_id = message.tool_call_id;
    }

    if (Array.isArray(message?.tool_calls)) {
      normalized.tool_calls = message.tool_calls;
    }

    return normalized;
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    const normalized = history
      .map(normalizeMessage)
      .filter((item) => item.role === "tool" || item.content || item.tool_calls);
    return sanitizeToolMessageSequence(sliceRecentMessages(normalized, LLM_HISTORY_LIMIT));
  }

  function getToolCallIds(message) {
    if (!Array.isArray(message?.tool_calls)) {
      return [];
    }

    return message.tool_calls.map((toolCall) => toolCall?.id).filter(Boolean);
  }

  function sanitizeToolMessageSequence(messages) {
    const sanitized = [];

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role === "tool") {
        continue;
      }

      const hasToolCalls = message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length;
      const toolCallIds = getToolCallIds(message);
      if (hasToolCalls && !toolCallIds.length) {
        if (message.content) {
          sanitized.push({ role: "assistant", content: message.content });
        }
        continue;
      }

      if (hasToolCalls) {
        const pendingIds = new Set(toolCallIds);
        const toolMessages = [];
        let nextIndex = index + 1;

        while (nextIndex < messages.length && messages[nextIndex].role === "tool") {
          const toolMessage = messages[nextIndex];
          if (pendingIds.has(toolMessage.tool_call_id)) {
            toolMessages.push(toolMessage);
            pendingIds.delete(toolMessage.tool_call_id);
          }
          nextIndex += 1;
        }

        if (pendingIds.size === 0) {
          sanitized.push(message, ...toolMessages);
        } else if (message.content) {
          sanitized.push({ role: "assistant", content: message.content });
        }
        index = nextIndex - 1;
        continue;
      }

      sanitized.push(message);
    }

    return sanitized;
  }

  function sliceRecentMessages(messages, limit) {
    if (messages.length <= limit) {
      return messages;
    }

    let startIndex = messages.length - limit;
    while (startIndex > 0 && messages[startIndex].role === "tool") {
      startIndex -= 1;
    }
    return messages.slice(startIndex);
  }

  function buildMessageList(config, history) {
    const normalized = normalizeHistory(history);
    const systemPrompts = [
      config.systemPrompt || DEFAULT_CONFIG.systemPrompt || t("system.prompt"),
      ...normalized.filter((item) => item.role === "system").map((item) => item.content)
    ].filter(Boolean);
    const nonSystemMessages = normalized.filter((item) => item.role !== "system");

    return [
      { role: "system", content: systemPrompts.join("\n\n") },
      ...nonSystemMessages
    ];
  }

  async function buildRequest(message, history = [], stream = false, tools = null) {
    const text = String(message || "").trim();
    if (!text) {
      throw new Error("message is required");
    }

    const config = await getConfig();
    if (!config.apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const apiBase = String(config.apiBase || "").replace(/\/+$/g, "");
    if (!apiBase) {
      throw new Error("LLM apiBase is not configured");
    }

    return {
      config,
      url: `${apiBase}/chat/completions`,
      body: {
        model: getProviderModelName(config.model),
        messages: [
          ...buildMessageList(config, history),
          { role: "user", content: text }
        ],
        temperature: 0.7,
        stream,
        ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: "auto" } : {})
      }
    };
  }

  async function buildMessagesRequest(messages, stream = false, tools = null) {
    const config = await getConfig();
    if (!config.apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const apiBase = String(config.apiBase || "").replace(/\/+$/g, "");
    if (!apiBase) {
      throw new Error("LLM apiBase is not configured");
    }

    return {
      config,
      url: `${apiBase}/chat/completions`,
      body: {
        model: getProviderModelName(config.model),
        messages: buildMessageList(config, messages),
        temperature: 0.7,
        stream,
        ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: "auto" } : {})
      }
    };
  }

  function normalizeToolCalls(toolCalls) {
    if (!Array.isArray(toolCalls)) {
      return [];
    }

    return toolCalls.map((toolCall, index) => {
      let parsedArguments = {};
      try {
        parsedArguments = JSON.parse(toolCall?.function?.arguments || "{}");
      } catch {
        parsedArguments = {};
      }

      return {
        id: toolCall?.id || `tool-${Date.now()}-${index}`,
        name: toolCall?.function?.name || "",
        arguments: parsedArguments,
        raw: toolCall
      };
    }).filter((toolCall) => toolCall.name);
  }

  async function chat({ message, history = [], tools = null } = {}) {
    const { config, url, body } = await buildRequest(message, history, false, tools);
    return completeRequest({ config, url, body });
  }

  async function chatMessages({ messages = [], tools = null } = {}) {
    const { config, url, body } = await buildMessagesRequest(messages, false, tools);
    return completeRequest({ config, url, body });
  }

  async function completeRequest({ config, url, body }) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      debugLog("request", {
        url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${maskApiKey(config.apiKey)}`
        },
        body
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      debugLog("response", {
        status: response.status,
        ok: response.ok,
        body: payload
      });
      if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `LLM request failed: ${response.status}`);
      }

      const message = payload?.choices?.[0]?.message || {};
      const content = message.content || "";
      const toolCalls = normalizeToolCalls(message.tool_calls);

      return {
        content: String(content).trim(),
        toolCalls,
        rawMessage: message,
        model: config.model,
        usage: payload.usage || null
      };
    } finally {
      clearTimeout(timerId);
    }
  }

  function isAbortLikeError(error) {
    const message = String(error?.message || error || "");
    return error?.name === "AbortError" || /aborted|body stream buffer/i.test(message);
  }

  async function streamChat({ message, history = [], onDelta, onDone, signal } = {}) {
    const { config, url, body } = await buildRequest(message, history, true);
    return streamRequest({ config, url, body, onDelta, onDone, signal });
  }

  async function streamMessages({ messages = [], tools = null, onDelta, onDone, signal } = {}) {
    const { config, url, body } = await buildMessagesRequest(messages, true, tools);
    return streamRequest({ config, url, body, onDelta, onDone, signal });
  }

  async function streamRequest({ config, url, body, onDelta, onDone, signal }) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const abortFromSignal = () => controller.abort();
    let fullText = "";
    const toolCallsByIndex = {};

    try {
      if (signal?.aborted) {
        controller.abort();
      } else {
        signal?.addEventListener?.("abort", abortFromSignal, { once: true });
      }

      debugLog("stream request", {
        url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${maskApiKey(config.apiKey)}`
        },
        body
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        debugLog("stream error response", {
          status: response.status,
          ok: response.ok,
          body: payload
        });
        throw new Error(payload?.error?.message || payload?.message || `LLM request failed: ${response.status}`);
      }

      debugLog("stream response headers", {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type")
      });

      if (!response.body) {
        const fallback = await response.json().catch(() => ({}));
        const content = fallback?.choices?.[0]?.message?.content || "";
        if (!content) {
          throw new Error("LLM returned empty content");
        }
        fullText = String(content).trim();
        onDelta?.(fullText);
        onDone?.({ content: fullText, model: config.model, usage: fallback.usage || null });
        return { content: fullText, model: config.model, usage: fallback.usage || null };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (error) {
          if (isAbortLikeError(error) && fullText) {
            const result = { content: fullText.trim(), model: config.model, usage: null, interrupted: true };
            onDone?.(result);
            return result;
          }
          throw error;
        }

        const { value, done } = readResult;
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) {
            continue;
          }

          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            const rawToolCalls = Object.keys(toolCallsByIndex)
              .map((key) => toolCallsByIndex[key])
              .filter((toolCall) => toolCall.function.name);
            const result = {
              content: fullText.trim(),
              toolCalls: normalizeToolCalls(rawToolCalls),
              model: config.model,
              usage: null
            };
            onDone?.(result);
            return result;
          }

          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          const delta = chunk?.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullText += delta;
            onDelta?.(delta, fullText);
          }

          const toolCallDeltas = chunk?.choices?.[0]?.delta?.tool_calls;
          if (Array.isArray(toolCallDeltas)) {
            debugLog("stream tool_call delta", {
              delta: toolCallDeltas
            });
            toolCallDeltas.forEach((toolCallDelta) => {
              const index = Number.isInteger(toolCallDelta.index) ? toolCallDelta.index : 0;
              if (!toolCallsByIndex[index]) {
                toolCallsByIndex[index] = {
                  id: "",
                  function: {
                    name: "",
                    arguments: ""
                  }
                };
              }

              const current = toolCallsByIndex[index];
              if (toolCallDelta.id) {
                current.id = toolCallDelta.id;
              }
              if (toolCallDelta.function?.name) {
                current.function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                current.function.arguments += toolCallDelta.function.arguments;
              }
            });
          }
        }
      }

      const rawToolCalls = Object.keys(toolCallsByIndex)
        .map((key) => toolCallsByIndex[key])
        .filter((toolCall) => toolCall.function.name);
      const result = {
        content: fullText.trim(),
        toolCalls: normalizeToolCalls(rawToolCalls),
        model: config.model,
        usage: null
      };
      debugLog("stream done", result);
      onDone?.(result);
      return result;
    } finally {
      clearTimeout(timerId);
      signal?.removeEventListener?.("abort", abortFromSignal);
    }
  }

  globalThis.DogeclawLLM = {
    getConfig,
    getConfigStatus,
    setConfig,
    chat,
    chatMessages,
    streamChat,
    streamMessages,
    resolveModel,
    getProviderModelName
  };
})();
