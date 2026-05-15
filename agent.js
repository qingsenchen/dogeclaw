(function () {
  const AGENT_CONFIG = globalThis.OnecaiConfig?.agent || {};
  const DEFAULT_MAX_ITERATIONS = AGENT_CONFIG.maxIterations || 20;
  const DEFAULT_MAX_MESSAGES = AGENT_CONFIG.maxMessages || 20;
  const DEFAULT_MAX_CONTENT_LENGTH = AGENT_CONFIG.maxContentLength || 8192;

  function normalizeHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    return history
      .map((item) => {
        const role = ["system", "user", "assistant", "tool"].includes(item?.role) ? item.role : "user";
        return {
          role,
          content: typeof item?.content === "string" ? item.content.trim() : String(item?.content || "").trim(),
          ...(item?.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
          ...(Array.isArray(item?.tool_calls) ? { tool_calls: item.tool_calls } : {})
        };
      })
      .filter((item) => item.role === "tool" || item.content || item.tool_calls);
  }

  function compressMessages(messages, maxMessages = DEFAULT_MAX_MESSAGES) {
    const normalized = normalizeHistory(messages).map((message) => ({
      ...message,
      content:
        message.content.length > DEFAULT_MAX_CONTENT_LENGTH
          ? `${message.content.slice(0, DEFAULT_MAX_CONTENT_LENGTH)}\n\n[truncated]`
          : message.content
    }));

    if (normalized.length <= maxMessages) {
      return normalized;
    }

    const oldMessages = normalized.slice(0, -maxMessages);
    const recentMessages = normalized.slice(-maxMessages);
    const summary = oldMessages
      .slice(-8)
      .map((message) => `[${message.role}] ${message.content.slice(0, 240)}`)
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
        messages.push(normalizeHistory([message])[0]);
        messages = compressMessages(messages);
      },
      getMessages() {
        return messages.slice();
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
      const result = await OnecaiTools.execute(toolCall.name, toolCall.arguments || {}, toolContext);
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
      content: "请根据刚才的工具执行结果继续完成用户请求，并给出简洁回复。"
    });
  }

  function addEmptyReplyContinuation(context) {
    context.add({
      role: "user",
      content: "上一轮没有返回可展示内容。请给出最终回复；如果还需要工具，请继续调用工具。"
    });
  }

  async function runTurn({ message, history = [], onDelta, onStep, tools = true, toolContext = {} } = {}) {
    const text = String(message || "").trim();
    if (!text) {
      throw new Error("message is required");
    }

    const context = createContext(history);
    context.add({ role: "user", content: text });
    let emptyReplyCount = 0;

    for (let iteration = 0; iteration < DEFAULT_MAX_ITERATIONS; iteration += 1) {
      onStep?.({ type: "llm_start", iteration });

      const result = await OnecaiLLM.chatMessages({
        messages: context.getMessages(),
        tools: tools === false ? null : OnecaiTools.getSchemas()
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
        throw new Error("LLM returned empty content");
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

    throw new Error(`Agent hit iteration limit (${DEFAULT_MAX_ITERATIONS})`);
  }

  async function runTurnStream({ message, history = [], onDelta, onDone, onStep, signal, tools = true, toolContext = {} } = {}) {
    const text = String(message || "").trim();
    if (!text) {
      throw new Error("message is required");
    }

    const context = createContext(history);
    context.add({ role: "user", content: text });
    let emptyReplyCount = 0;

    for (let iteration = 0; iteration < DEFAULT_MAX_ITERATIONS; iteration += 1) {
      onStep?.({ type: "llm_start", iteration });

      let fullText = "";
      const result = await OnecaiLLM.streamMessages({
        messages: context.getMessages(),
        tools: tools === false ? null : OnecaiTools.getSchemas(),
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
        throw new Error("LLM returned empty content");
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

    throw new Error(`Agent hit iteration limit (${DEFAULT_MAX_ITERATIONS})`);
  }

  globalThis.OnecaiAgent = {
    runTurn,
    runTurnStream,
    createContext,
    compressMessages
  };
})();
