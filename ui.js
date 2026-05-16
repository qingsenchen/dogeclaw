(function () {
  const I18N = globalThis.DogeclawI18n || { t: (key, params) => {
    const fallback = {
      "image.alt": "Image"
    };
    let value = fallback[key] || key;
    Object.entries(params || {}).forEach(([name, replacement]) => {
      value = value.replaceAll(`{${name}}`, String(replacement ?? ""));
    });
    return value;
  } };
  const t = (key, params) => I18N.t(key, params);

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderInlineMarkdown(value) {
    const codeSpans = [];
    let text = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code) => {
      const token = `@@DOGECLAW_CODE_${codeSpans.length}@@`;
      codeSpans.push(`<code>${code}</code>`);
      return token;
    });

    text = text
      .replace(/!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g, (_match, label, src) => {
        const alt = label ? escapeHtml(label) : t("image.alt");
        return `<img class="pig-chat-image" src="${src}" alt="${alt}" loading="lazy">`;
      })
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, src) => {
        const safeSrc = src.replace(/&amp;/g, "&");
        const alt = label ? escapeHtml(label) : t("image.alt");
        return `<img class="pig-chat-image" src="${safeSrc}" alt="${alt}" loading="lazy">`;
      })
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => {
        const safeHref = href.replace(/&amp;/g, "&");
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>");

    codeSpans.forEach((code, index) => {
      text = text.replace(`@@DOGECLAW_CODE_${index}@@`, code);
    });
    return text;
  }

  function renderMarkdown(message) {
    const lines = String(message || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let listType = "";
    let inCodeBlock = false;
    let codeLines = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function flushList() {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = "";
    }

    function ensureList(nextType) {
      flushParagraph();
      if (listType && listType !== nextType) flushList();
      if (!listType) {
        listType = nextType;
        html.push(`<${listType}>`);
      }
    }

    function flushCodeBlock() {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
    }

    lines.forEach((line) => {
      if (/^```/.test(line.trim())) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushParagraph();
          flushList();
          inCodeBlock = true;
          codeLines = [];
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }

      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      if (unordered) {
        ensureList("ul");
        html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
        return;
      }

      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ordered) {
        ensureList("ol");
        html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
        return;
      }

      const quote = line.match(/^\s*>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
        return;
      }

      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        html.push(`<p><strong>${renderInlineMarkdown(heading[1])}</strong></p>`);
        return;
      }

      flushList();
      paragraph.push(line.trim());
    });

    if (inCodeBlock) flushCodeBlock();
    flushParagraph();
    flushList();

    return html.join("") || `<p>${escapeHtml(message)}</p>`;
  }

  function createChatBubble(message) {
    const bubble = document.createElement("div");
    bubble.className = "pig-chat-bubble";
    bubble.innerHTML = renderMarkdown(message);
    return bubble;
  }

  function stopComponentPropagation(element) {
    ["click", "pointerdown", "pointerup", "focusin", "focusout", "keydown"].forEach((eventName) => {
      element.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    });
  }

  function createLlmConfigField(labelText, input) {
    const label = document.createElement("label");
    label.className = "pig-config-field";
    const text = document.createElement("span");
    text.className = "pig-config-label";
    text.textContent = labelText;
    label.append(text, input);
    return label;
  }

  function createInput({ className, type, placeholder, value, onInput }) {
    const input = document.createElement("input");
    input.className = className;
    input.type = type;
    input.placeholder = placeholder;
    input.value = value || "";
    input.addEventListener("input", () => onInput?.(input.value));
    return input;
  }

  function renderLlmConfigForm({ state, onSave }) {
    const llmDefaults = globalThis.DogeclawConfig?.llm?.defaultConfig || {};
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-component";

    const panel = document.createElement("form");
    panel.className = "pig-chat-bubble pig-component-card pig-llm-config-form";
    stopComponentPropagation(panel);

    const title = document.createElement("div");
    title.className = "pig-config-title";
    title.textContent = t("llm.configTitle");

    const apiBaseInput = createInput({
      className: "pig-config-input",
      type: "url",
      placeholder: llmDefaults.apiBase || "https://api.openai.com/v1",
      value: state.llmConfig.values.apiBase,
      onInput: (value) => {
        state.llmConfig.values.apiBase = value;
      }
    });

    const modelInput = createInput({
      className: "pig-config-input",
      type: "text",
      placeholder: llmDefaults.model || "gpt-4o-mini",
      value: state.llmConfig.values.model,
      onInput: (value) => {
        state.llmConfig.values.model = value;
      }
    });

    const apiKeyInput = createInput({
      className: "pig-config-input",
      type: "password",
      placeholder: t("llm.apiKeyPlaceholder"),
      value: state.llmConfig.values.apiKey,
      onInput: (value) => {
        state.llmConfig.values.apiKey = value;
      }
    });

    const error = document.createElement("div");
    error.className = "pig-config-error";
    error.hidden = !state.llmConfig.error;
    error.textContent = state.llmConfig.error;

    const actions = document.createElement("div");
    actions.className = "pig-config-actions";

    const saveButton = document.createElement("button");
    saveButton.className = "pig-config-button is-primary";
    saveButton.type = "submit";
    saveButton.textContent = state.llmConfig.saving ? t("llm.saving") : t("llm.save");
    saveButton.disabled = state.llmConfig.saving;

    actions.append(saveButton);
    panel.append(
      title,
      createLlmConfigField("Base URL", apiBaseInput),
      createLlmConfigField("Model", modelInput),
      createLlmConfigField("API Key", apiKeyInput),
      error,
      actions
    );

    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onSave?.();
    });

    row.append(panel);
    return row;
  }

  function renderChannelConfigForm({ state, onStart, onCheck, onClose }) {
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-component";

    const panel = document.createElement("div");
    panel.className = "pig-chat-bubble pig-component-card pig-channel-config-form";
    stopComponentPropagation(panel);

    const title = document.createElement("div");
    title.className = "pig-config-title";
    title.textContent = state.channelConfig.channel === "wechat" ? t("channel.wechatConfigTitle") : t("channel.configTitle");

    const body = document.createElement("div");
    body.className = "pig-channel-config-body";

    const config = state.channelConfig.config || {};
    const login = state.channelConfig.login || {};
    const status = document.createElement("div");
    status.className = "pig-channel-status";
    status.textContent = config.enabled ? t("channel.configured") : t("channel.notConfigured");

    body.append(status);

    if (login.qrcodeUrl) {
      const qrWrap = document.createElement("div");
      qrWrap.className = "pig-channel-qr";
      const img = document.createElement("img");
      img.alt = t("channel.qrAlt");
      img.src = login.qrcodeUrl;
      img.addEventListener("error", () => {
        img.hidden = true;
        const fallback = document.createElement("div");
        fallback.className = "pig-channel-qr-fallback";
        fallback.textContent = t("channel.qrFailed");
        qrWrap.append(fallback);
      }, { once: true });
      qrWrap.append(img);
      body.append(qrWrap);
    } else if (state.channelConfig.loading) {
      const loading = document.createElement("div");
      loading.className = "pig-channel-hint";
      loading.textContent = t("channel.loadingQr");
      body.append(loading);
    }

    const hint = document.createElement("div");
    hint.className = "pig-channel-hint";
    hint.textContent = login.message || t("channel.hint");
    body.append(hint);

    if (state.channelConfig.error) {
      const error = document.createElement("div");
      error.className = "pig-config-error";
      error.textContent = state.channelConfig.error;
      body.append(error);
    }

    const actions = document.createElement("div");
    actions.className = "pig-config-actions";

    const closeButton = document.createElement("button");
    closeButton.className = "pig-config-button";
    closeButton.type = "button";
    closeButton.textContent = t("channel.close");
    closeButton.addEventListener("click", () => onClose?.());

    const startButton = document.createElement("button");
    startButton.className = "pig-config-button is-primary";
    startButton.type = "button";
    startButton.textContent = login.qrcodeUrl ? t("channel.refreshQr") : t("channel.getQr");
    startButton.disabled = state.channelConfig.loading;
    startButton.addEventListener("click", () => onStart?.());

    const checkButton = document.createElement("button");
    checkButton.className = "pig-config-button is-primary";
    checkButton.type = "button";
    checkButton.textContent = t("channel.checkQr");
    checkButton.disabled = state.channelConfig.loading || !login.qrcode;
    checkButton.addEventListener("click", () => onCheck?.());

    actions.append(closeButton, startButton, checkButton);
    panel.append(title, body, actions);
    row.append(panel);
    return row;
  }

  globalThis.DogeclawUI = {
    createChatBubble,
    renderChannelConfigForm,
    renderLlmConfigForm,
    renderMarkdown
  };
})();
