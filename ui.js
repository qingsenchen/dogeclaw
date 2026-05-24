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
    const protectedHtml = [];
    const protectHtml = (html) => {
      const token = `\uE000DOGECLAWCODE${protectedHtml.length}\uE001`;
      protectedHtml.push(html);
      return token;
    };

    let text = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code) => {
      return protectHtml(`<code>${code}</code>`);
    });

    text = text
      .replace(/!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g, (_match, label, src) => {
        const alt = label || escapeHtml(t("image.alt"));
        return protectHtml(`<img class="pig-chat-image" src="${src}" alt="${alt}" loading="lazy">`);
      })
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, src) => {
        const safeSrc = src.replace(/&amp;/g, "&");
        const alt = label || escapeHtml(t("image.alt"));
        return protectHtml(`<img class="pig-chat-image" src="${safeSrc}" alt="${alt}" loading="lazy">`);
      })
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => {
        const safeHref = href.replace(/&amp;/g, "&");
        return protectHtml(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`);
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>");

    protectedHtml.forEach((html, index) => {
      text = text.replaceAll(`\uE000DOGECLAWCODE${index}\uE001`, html);
    });
    return text;
  }

  function isThematicBreak(line) {
    return /^(?:-\s*){3,}$/.test(line) || /^(?:\*\s*){3,}$/.test(line) || /^(?:_\s*){3,}$/.test(line);
  }

  function splitTableRow(line) {
    const trimmed = String(line || "").trim();
    const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    if (!normalized.includes("|")) {
      return [];
    }
    return normalized.split("|").map((cell) => cell.trim());
  }

  function parseTableDelimiter(line, columnCount) {
    const cells = splitTableRow(line);
    if (columnCount < 2 || cells.length !== columnCount) {
      return null;
    }

    const alignments = [];
    for (const cell of cells) {
      const value = cell.replace(/\s+/g, "");
      if (!/^:?-{3,}:?$/.test(value)) {
        return null;
      }
      alignments.push(value.startsWith(":") && value.endsWith(":") ? "center" : value.endsWith(":") ? "right" : "left");
    }
    return alignments;
  }

  function renderMarkdownTable(rows, alignments) {
    const header = rows[0] || [];
    const bodyRows = rows.slice(1);
    const alignClass = (alignment) =>
      alignment === "center" ? "is-align-center" : alignment === "right" ? "is-align-right" : "";
    const renderCells = (cells, tag) =>
      cells
        .map((cell, index) => {
          const className = alignClass(alignments[index]);
          return `<${tag}${className ? ` class="${className}"` : ""}>${renderInlineMarkdown(cell)}</${tag}>`;
        })
        .join("");

    const columnCount = Math.max(1, header.length);
    return [
      `<div class="pig-markdown-table-wrap"><table style="--pig-table-column-count: ${columnCount}">`,
      `<thead><tr>${renderCells(header, "th")}</tr></thead>`,
      bodyRows.length ? `<tbody>${bodyRows.map((row) => `<tr>${renderCells(row, "td")}</tr>`).join("")}</tbody>` : "",
      "</table></div>"
    ].join("");
  }

  function renderMarkdown(message) {
    const lines = String(message || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    const listStack = [];
    let inCodeBlock = false;
    let codeLines = [];

    function getIndentSize(value) {
      return String(value || "").replace(/\t/g, "    ").length;
    }

    function parseListItem(line) {
      const unordered = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (unordered) {
        return { type: "ul", indent: getIndentSize(unordered[1]), content: unordered[2] };
      }
      const ordered = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (ordered) {
        return { type: "ol", indent: getIndentSize(ordered[1]), content: ordered[2] };
      }
      return null;
    }

    function nextNonEmptyListItem(startIndex) {
      for (let index = startIndex; index < lines.length; index += 1) {
        if (!lines[index].trim()) {
          continue;
        }
        return parseListItem(lines[index]);
      }
      return null;
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function closeListLevel() {
      const current = listStack.pop();
      if (!current) return;
      if (current.itemOpen) {
        html.push("</li>");
      }
      html.push(`</${current.type}>`);
    }

    function flushList() {
      while (listStack.length) {
        closeListLevel();
      }
    }

    function renderListItem(item) {
      flushParagraph();

      while (listStack.length && item.indent < listStack[listStack.length - 1].indent) {
        closeListLevel();
      }

      const current = listStack[listStack.length - 1];
      if (!current || item.indent > current.indent) {
        html.push(`<${item.type}>`);
        listStack.push({ type: item.type, indent: item.indent, itemOpen: false });
      } else if (current.type !== item.type) {
        closeListLevel();
        html.push(`<${item.type}>`);
        listStack.push({ type: item.type, indent: item.indent, itemOpen: false });
      }

      const next = listStack[listStack.length - 1];
      if (next.itemOpen) {
        html.push("</li>");
      }
      html.push(`<li>${renderInlineMarkdown(item.content)}`);
      next.itemOpen = true;
    }

    function flushCodeBlock() {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
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
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        if (listStack.length && nextNonEmptyListItem(index + 1)) {
          continue;
        }
        flushList();
        continue;
      }

      const tableHeader = splitTableRow(line);
      const tableAlignments = parseTableDelimiter(lines[index + 1] || "", tableHeader.length);
      if (tableAlignments) {
        const rows = [tableHeader];
        index += 2;
        while (index < lines.length) {
          const row = splitTableRow(lines[index]);
          if (!row.length) {
            break;
          }
          rows.push(row.slice(0, tableHeader.length).concat(Array(Math.max(0, tableHeader.length - row.length)).fill("")));
          index += 1;
        }
        index -= 1;
        flushParagraph();
        flushList();
        html.push(renderMarkdownTable(rows, tableAlignments));
        continue;
      }

      if (isThematicBreak(line.trim())) {
        flushParagraph();
        flushList();
        html.push("<hr>");
        continue;
      }

      const listItem = parseListItem(line);
      if (listItem) {
        renderListItem(listItem);
        continue;
      }

      const quote = line.match(/^\s*>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
        continue;
      }

      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        html.push(`<p><strong>${renderInlineMarkdown(heading[1])}</strong></p>`);
        continue;
      }

      flushList();
      paragraph.push(line.trim());
    }

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

  function getExtensionAssetUrl(path) {
    try {
      return globalThis.DogeclawPlatform?.api?.runtime?.getURL?.(path) || globalThis.chrome?.runtime?.getURL?.(path) || "";
    } catch {
      return "";
    }
  }

  function createTipIcon(icon) {
    if (icon === false || icon === null) {
      return null;
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "pig-tip-logo";
    const iconValue = icon === undefined ? "logo" : icon;
    const iconUrl = iconValue === "logo" ? getExtensionAssetUrl("icons/icon-32.png") : String(iconValue || "");

    if (/^(https?:|data:image\/|blob:)/i.test(iconUrl)) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = iconUrl;
      iconWrap.append(img);
    } else {
      iconWrap.textContent = String(iconValue || "d").slice(0, 2);
    }

    return iconWrap;
  }

  function createCloseIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M6 6L18 18M18 6L6 18");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);
    return svg;
  }

  function renderTipMessage({ message, onAction, onClose }) {
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-tip";

    const panel = document.createElement("div");
    panel.className = "pig-chat-bubble pig-tip-message";
    stopComponentPropagation(panel);

    const icon = createTipIcon(message.icon);
    if (!icon) {
      panel.classList.add("has-no-icon");
    }

    const body = document.createElement("div");
    body.className = "pig-tip-body";
    body.innerHTML = renderMarkdown(message.text);

    const actionButton = document.createElement("button");
    actionButton.className = "pig-tip-action";
    actionButton.type = "button";
    actionButton.textContent = message.actionLabel || "";
    actionButton.hidden = !message.actionLabel;
    actionButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onAction?.();
    });

    const closeButton = document.createElement("button");
    closeButton.className = "pig-tip-close";
    closeButton.type = "button";
    closeButton.title = t("tips.close");
    closeButton.setAttribute("aria-label", t("tips.close"));
    closeButton.append(createCloseIcon());
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    });

    panel.append(...[icon, body, actionButton, closeButton].filter(Boolean));
    row.append(panel);
    return row;
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

  function renderLlmConfigForm({ state, onSave, onClose }) {
    const llmDefaults = globalThis.DogeclawConfig?.llm?.defaultConfig || {};
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-component";

    const panel = document.createElement("form");
    panel.className = "pig-chat-bubble pig-component-card pig-llm-config-form";
    stopComponentPropagation(panel);

    const title = document.createElement("div");
    title.className = "pig-config-title";
    title.textContent = t("llm.configTitle");

    const closeButton = document.createElement("button");
    closeButton.className = "pig-config-close";
    closeButton.type = "button";
    closeButton.title = t("tips.close");
    closeButton.setAttribute("aria-label", t("tips.close"));
    closeButton.append(createCloseIcon());
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    });

    const header = document.createElement("div");
    header.className = "pig-config-header";
    header.append(title, closeButton);

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
      header,
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

  function renderSkillConfigForm({ state, onToggle, onClose }) {
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-component";

    const panel = document.createElement("div");
    panel.className = "pig-chat-bubble pig-component-card pig-skill-config-form";
    stopComponentPropagation(panel);

    const title = document.createElement("div");
    title.className = "pig-config-title";
    title.textContent = t("skill.configTitle");

    const closeButton = document.createElement("button");
    closeButton.className = "pig-config-close";
    closeButton.type = "button";
    closeButton.title = t("tips.close");
    closeButton.setAttribute("aria-label", t("tips.close"));
    closeButton.append(createCloseIcon());
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    });

    const header = document.createElement("div");
    header.className = "pig-config-header";
    header.append(title, closeButton);

    const body = document.createElement("div");
    body.className = "pig-skill-config-body";

    if (state.skillConfig.loading) {
      const loading = document.createElement("div");
      loading.className = "pig-skill-hint";
      loading.textContent = t("skill.loading");
      body.append(loading);
    } else if (!state.skillConfig.skills.length) {
      const empty = document.createElement("div");
      empty.className = "pig-skill-hint";
      empty.textContent = t("skill.empty");
      body.append(empty);
    } else {
      const list = document.createElement("div");
      list.className = "pig-skill-list";
      state.skillConfig.skills.forEach((skill) => {
        const item = document.createElement("div");
        item.className = "pig-skill-item";

        const icon = document.createElement("div");
        icon.className = "pig-skill-icon";
        icon.textContent = skill.emoji || skill.name?.slice(0, 1) || "?";

        const text = document.createElement("div");
        text.className = "pig-skill-text";

        const name = document.createElement("div");
        name.className = "pig-skill-name";
        name.textContent = skill.name || skill.id || t("common.empty");

        const description = document.createElement("div");
        description.className = "pig-skill-description";
        description.textContent = skill.description || skill.id || "";

        text.append(name, description);

        const switchLabel = document.createElement("label");
        switchLabel.className = "pig-skill-switch";
        switchLabel.title = skill.enabled ? t("skill.enabled") : t("skill.disabled");
        switchLabel.setAttribute("aria-label", `${skill.name || skill.id || t("common.empty")}: ${switchLabel.title}`);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(skill.enabled);
        checkbox.disabled = state.skillConfig.loading || state.skillConfig.savingId === skill.id;
        checkbox.addEventListener("change", (event) => {
          event.stopPropagation();
          onToggle?.(skill, checkbox.checked);
        });

        const track = document.createElement("span");
        track.className = "pig-skill-switch-track";
        switchLabel.append(checkbox, track);

        item.append(icon, text, switchLabel);
        list.append(item);
      });
      body.append(list);
    }

    if (state.skillConfig.error) {
      const error = document.createElement("div");
      error.className = "pig-config-error";
      error.textContent = state.skillConfig.error;
      body.append(error);
    }

    panel.append(header, body);
    row.append(panel);
    return row;
  }

  function formatDateTime(ms) {
    const value = Number(ms) || 0;
    if (!value) {
      return "";
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString();
    }
  }

  function formatTaskSchedule(schedule = {}) {
    if (schedule.kind === "once") {
      return t("task.schedule.once", { time: formatDateTime(schedule.runAtMs) || schedule.runAt || "" });
    }
    if (schedule.kind === "interval") {
      return t("task.schedule.interval", { count: schedule.everyMinutes || "" });
    }
    if (schedule.kind === "daily") {
      return t("task.schedule.daily", { time: schedule.timeOfDay || "" });
    }
    if (schedule.kind === "weekly") {
      return t("task.schedule.weekly", {
        days: Array.isArray(schedule.weekdays) ? schedule.weekdays.join(",") : "",
        time: schedule.timeOfDay || ""
      });
    }
    return t("task.schedule.unknown");
  }

  function getTaskStatusText(task = {}) {
    if (task.enabled === false) {
      return task.pauseReason ? t("task.pausedWithReason", { reason: task.pauseReason }) : t("task.paused");
    }
    if (task.nextRunAtMs) {
      return t("task.nextRun", { time: formatDateTime(task.nextRunAtMs) });
    }
    return t("task.enabled");
  }

  function renderTaskConfigForm({ state, onToggle, onClose }) {
    const row = document.createElement("div");
    row.className = "pig-chat-row is-left is-component";

    const panel = document.createElement("div");
    panel.className = "pig-chat-bubble pig-component-card pig-task-config-form";
    stopComponentPropagation(panel);

    const title = document.createElement("div");
    title.className = "pig-config-title";
    title.textContent = t("task.configTitle");

    const closeButton = document.createElement("button");
    closeButton.className = "pig-config-close";
    closeButton.type = "button";
    closeButton.title = t("tips.close");
    closeButton.setAttribute("aria-label", t("tips.close"));
    closeButton.append(createCloseIcon());
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    });

    const header = document.createElement("div");
    header.className = "pig-config-header";
    header.append(title, closeButton);

    const body = document.createElement("div");
    body.className = "pig-task-config-body";

    if (state.taskConfig.loading) {
      const loading = document.createElement("div");
      loading.className = "pig-task-hint";
      loading.textContent = t("task.loading");
      body.append(loading);
    } else if (!state.taskConfig.tasks.length) {
      const empty = document.createElement("div");
      empty.className = "pig-task-hint";
      empty.textContent = t("task.empty");
      body.append(empty);
    } else {
      const list = document.createElement("div");
      list.className = "pig-task-list";
      state.taskConfig.tasks.forEach((task) => {
        const item = document.createElement("div");
        item.className = `pig-task-item${task.enabled === false ? " is-paused" : ""}`;

        const text = document.createElement("div");
        text.className = "pig-task-text";

        const name = document.createElement("div");
        name.className = "pig-task-name";
        name.textContent = task.name || task.id || t("common.empty");

        const description = document.createElement("div");
        description.className = "pig-task-description";
        description.textContent = [formatTaskSchedule(task.schedule || {}), getTaskStatusText(task)]
          .filter(Boolean)
          .join(" · ");
        text.append(name, description);

        if (task.lastStatus || task.lastError) {
          const meta = document.createElement("div");
          meta.className = "pig-task-meta";
          meta.textContent = task.lastError || task.lastStatus;
          text.append(meta);
        }

        const actions = document.createElement("div");
        actions.className = "pig-task-actions";

        const switchLabel = document.createElement("label");
        switchLabel.className = "pig-skill-switch pig-task-switch";
        switchLabel.title = task.enabled ? t("task.enabled") : t("task.paused");
        switchLabel.setAttribute("aria-label", `${task.name || task.id || t("common.empty")}: ${switchLabel.title}`);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.enabled !== false;
        checkbox.disabled = state.taskConfig.loading || state.taskConfig.savingId === `pause:${task.id}` || state.taskConfig.savingId === `resume:${task.id}` || state.taskConfig.savingId === `delete:${task.id}`;
        checkbox.addEventListener("change", (event) => {
          event.stopPropagation();
          onToggle?.(task, checkbox.checked);
        });

        const track = document.createElement("span");
        track.className = "pig-skill-switch-track";
        switchLabel.append(checkbox, track);

        actions.append(switchLabel);
        item.append(text, actions);
        list.append(item);
      });
      body.append(list);
    }

    if (state.taskConfig.error) {
      const error = document.createElement("div");
      error.className = "pig-config-error";
      error.textContent = state.taskConfig.error;
      body.append(error);
    }

    panel.append(header, body);
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
    renderTipMessage,
    renderChannelConfigForm,
    renderLlmConfigForm,
    renderSkillConfigForm,
    renderTaskConfigForm,
    renderMarkdown
  };
})();
