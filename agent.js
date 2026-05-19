(function () {
  const AGENT_CONFIG = globalThis.DogeclawConfig?.agent || {};
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const DEFAULT_MAX_ITERATIONS = AGENT_CONFIG.maxIterations || 20;
  const DEFAULT_MAX_MESSAGES = AGENT_CONFIG.maxMessages || 20;
  const DEFAULT_MAX_CONTENT_LENGTH = AGENT_CONFIG.maxContentLength || 8192;

  function normalizeContentPart(part) {
    if (part?.type === "text") {
      const text = String(part.text || "").trim();
      return text ? { type: "text", text } : null;
    }

    if (part?.type === "image_url") {
      const url = String(part.image_url?.url || "").trim();
      if (!url) {
        return null;
      }
      return {
        type: "image_url",
        image_url: {
          url,
          ...(part.image_url?.detail ? { detail: String(part.image_url.detail) } : {})
        }
      };
    }

    return null;
  }

  function normalizeContent(content) {
    if (Array.isArray(content)) {
      return content.map(normalizeContentPart).filter(Boolean);
    }
    return typeof content === "string" ? content.trim() : String(content || "").trim();
  }

  function isEmptyContent(content) {
    return Array.isArray(content) ? !content.length : !String(content || "").trim();
  }

  function contentToText(content) {
    if (!Array.isArray(content)) {
      return String(content || "");
    }

    return content
      .map((part) => {
        if (part?.type === "text") {
          return String(part.text || "");
        }
        if (part?.type === "image_url") {
          return "[image]";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    return history
      .map((item) => {
        const role = ["system", "user", "assistant", "tool"].includes(item?.role) ? item.role : "user";
        const content = normalizeContent(item?.content);
        return {
          role,
          content,
          ...(item?.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
          ...(Array.isArray(item?.tool_calls) ? { tool_calls: item.tool_calls } : {})
        };
      })
      .filter((item) => item.role === "tool" || !isEmptyContent(item.content) || item.tool_calls);
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

  function sliceRecentMessages(messages, maxMessages) {
    if (messages.length <= maxMessages) {
      return messages;
    }

    let startIndex = messages.length - maxMessages;
    while (startIndex > 0 && messages[startIndex].role === "tool") {
      startIndex -= 1;
    }
    return messages.slice(startIndex);
  }

  function isToolMessageSequencePart(message) {
    return message?.role === "tool" || (message?.role === "assistant" && getToolCallIds(message).length > 0);
  }

  function compressMessages(messages, maxMessages = DEFAULT_MAX_MESSAGES) {
    const normalized = normalizeHistory(messages).map((message) => ({
      ...message,
	      content:
	        typeof message.content === "string" && message.content.length > DEFAULT_MAX_CONTENT_LENGTH
	          ? `${message.content.slice(0, DEFAULT_MAX_CONTENT_LENGTH)}\n\n[truncated]`
	          : message.content
    }));

    if (normalized.length <= maxMessages) {
      return sanitizeToolMessageSequence(normalized);
    }

    const recentMessages = sanitizeToolMessageSequence(sliceRecentMessages(normalized, maxMessages));
    const oldMessages = normalized.slice(0, Math.max(0, normalized.length - recentMessages.length));
    const summary = oldMessages
	      .slice(-8)
	      .map((message) => `[${message.role}] ${contentToText(message.content).slice(0, 240)}`)
	      .join("\n");

    return [
      {
        role: "assistant",
        content: `[Conversation compressed]\n${summary}`
      },
      ...recentMessages
    ];
  }

  function createContext(history) {
    let messages = compressMessages(history);

    return {
      add(message) {
        const nextMessage = normalizeHistory([message])[0];
        if (!nextMessage) {
          return;
        }
        messages.push(nextMessage);
        // Tool calls and their results arrive as separate messages; compress after the sequence closes.
        if (isToolMessageSequencePart(nextMessage)) {
          return;
        }
        messages = compressMessages(messages);
      },
      getMessages() {
        return sanitizeToolMessageSequence(messages).slice();
      }
    };
  }

  function toOpenAiToolCalls(toolCalls) {
    return toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments || {})
      }
    }));
  }

  function recordAssistantToolCalls(context, toolCalls, content = "") {
    context.add({
      role: "assistant",
      content,
      tool_calls: toOpenAiToolCalls(toolCalls)
    });
  }

  async function executeToolCall(toolCall, toolContext = {}) {
    try {
      const result = await DogeclawTools.execute(toolCall.name, toolCall.arguments || {}, toolContext);
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ ok: true, result })
      };
    } catch (error) {
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ ok: false, error: error?.message || String(error) })
      };
    }
  }

  async function executeToolCallsParallel(toolCalls, { context, iteration, onStep, direct = false, toolContext = {} } = {}) {
    onStep?.({ type: "tool_start", iteration, calls: toolCalls, direct });
    const toolResults = await Promise.all(toolCalls.map((toolCall) => executeToolCall(toolCall, toolContext)));
    toolResults.forEach((toolResult) => context.add(toolResult));
    onStep?.({ type: "tool_done", iteration, results: toolResults, direct });
    return toolResults;
  }

  function addToolContinuation(context) {
    context.add({
      role: "user",
      content: t("agent.continueAfterTool")
    });
  }

  function addEmptyReplyContinuation(context) {
    context.add({
      role: "user",
      content: t("agent.noDisplayContent")
    });
  }

  async function runTurn({ message, history = [], onDelta, onStep, tools = true, toolContext = {} } = {}) {
    const content = normalizeContent(message);
    if (isEmptyContent(content)) {
      throw new Error(t("llm.messageRequired"));
    }

    const context = createContext(history);
    context.add({ role: "user", content });
    let emptyReplyCount = 0;

    for (let iteration = 0; iteration < DEFAULT_MAX_ITERATIONS; iteration += 1) {
      onStep?.({ type: "llm_start", iteration });

      const result = await DogeclawLLM.chatMessages({
        messages: context.getMessages(),
        tools: tools === false ? null : DogeclawTools.getSchemas()
      });

      if (result.toolCalls?.length) {
        recordAssistantToolCalls(context, result.toolCalls, result.content || "");
        await executeToolCallsParallel(result.toolCalls, { context, iteration, onStep, toolContext });
        addToolContinuation(context);
        continue;
      }

      if (!String(result.content || "").trim()) {
        emptyReplyCount += 1;
        if (emptyReplyCount <= 2) {
          addEmptyReplyContinuation(context);
          continue;
        }
        throw new Error(t("llm.returnedEmptyContent"));
      }

      onDelta?.(result.content, result.content);
      context.add({ role: "assistant", content: result.content });
      onStep?.({ type: "llm_done", iteration, result });

      return {
        ...result,
        messages: context.getMessages(),
        iterations: iteration + 1
      };
    }

    throw new Error(t("agent.iterationLimit", { count: DEFAULT_MAX_ITERATIONS }));
  }

  async function runTurnStream({ message, history = [], onDelta, onDone, onStep, signal, tools = true, toolContext = {} } = {}) {
    const content = normalizeContent(message);
    if (isEmptyContent(content)) {
      throw new Error(t("llm.messageRequired"));
    }

    const context = createContext(history);
    context.add({ role: "user", content });
    let emptyReplyCount = 0;

    for (let iteration = 0; iteration < DEFAULT_MAX_ITERATIONS; iteration += 1) {
      onStep?.({ type: "llm_start", iteration });

      let fullText = "";
      const result = await DogeclawLLM.streamMessages({
        messages: context.getMessages(),
        tools: tools === false ? null : DogeclawTools.getSchemas(),
        signal,
        onDelta: (delta, accumulated) => {
          fullText = accumulated || `${fullText}${delta || ""}`;
          onDelta?.(delta, fullText);
        }
      });

      if (result.toolCalls?.length) {
        recordAssistantToolCalls(context, result.toolCalls, result.content || fullText || "");
        await executeToolCallsParallel(result.toolCalls, { context, iteration, onStep, toolContext });
        addToolContinuation(context);
        continue;
      }

      const content = result.content || fullText;
      if (!String(content || "").trim()) {
        emptyReplyCount += 1;
        if (emptyReplyCount <= 2) {
          addEmptyReplyContinuation(context);
          continue;
        }
        throw new Error(t("llm.returnedEmptyContent"));
      }

      context.add({ role: "assistant", content });

      const finalResult = {
        ...result,
        content,
        messages: context.getMessages(),
        iterations: iteration + 1
      };
      onStep?.({ type: "llm_done", iteration, result: finalResult });
      onDone?.(finalResult);
      return finalResult;
    }

    throw new Error(t("agent.iterationLimit", { count: DEFAULT_MAX_ITERATIONS }));
  }

  globalThis.DogeclawAgent = {
    runTurn,
    runTurnStream,
    createContext,
    compressMessages
  };
})();
