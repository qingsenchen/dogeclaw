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
    "content/game.js",
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
    },
    {
      type: "function",
      function: {
        name: "scheduled_task",
        description:
          "管理 dogeclaw 后台定时任务。把用户的自然语言意图转换成结构化 job/schedule/selector；运行时只接受 canonical 枚举，不做同义词猜测。创建提醒用 create；查看用 list/get；修改用 update；暂停/恢复用 pause/resume；立即执行用 run；查看执行记录用 runs/history；删除用 delete + selector。不要要求用户提供任务 ID；如果 pause/resume/run/update 需要 id，先 list 并用任务名称、类型、状态或关键词在结果中定位。用户说“X 分钟后/稍后/提醒我一次”必须创建 once；只有明确说“每 X 分钟/重复/循环/周期性”才创建 interval。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "get", "create", "update", "delete", "pause", "resume", "run", "history", "runs", "refresh"],
              description: "操作类型。create 创建任务；list/get 查看；update 修改；pause/resume 开关任务；run 手动执行一次；runs/history 查看执行记录；delete 按 selector 删除；refresh 重新同步 alarms。"
            },
            id: {
              type: "string",
              description: "内部任务 ID，仅在已经从 list/get 结果中拿到时用于 get/update/pause/resume/run/history；不要向用户索要 ID。"
            },
            name: {
              type: "string",
              description: "任务显示名称。create/update 可用；delete 时请使用 selector.name。"
            },
            selector: {
              type: "object",
              description: "delete 的结构化选择器。由 LLM 把“全部、同类型、暂停/暂时、吃饭相关”等自然语言映射成 canonical 字段；不要传原始中文状态词，不要让用户输入 ID。常用：{scope:\"all\"}；{scope:\"matching\", scheduleKind:\"once\"}；{scope:\"matching\", status:\"paused\"}；{scope:\"matching\", query:\"吃饭\"}；{scope:\"one\", name:\"提醒吃饭\"}。",
              properties: {
                scope: {
                  type: "string",
                  enum: ["one", "matching", "all"],
                  description: "删除范围。one=必须唯一匹配；matching=删除所有匹配条件；all=删除所有任务。"
                },
                name: {
                  type: "string",
                  description: "按任务名称匹配；通常配合 scope=one。"
                },
                query: {
                  type: "string",
                  description: "按任务名称或 prompt 关键词匹配；删除同主题多任务时配合 scope=matching。"
                },
                scheduleKind: {
                  type: "string",
                  enum: ["once", "interval", "daily", "weekly"],
                  description: "按计划类型过滤。一次性/单次/几分钟后 => once；周期/每隔 N 分钟 => interval；每天 => daily；每周 => weekly。"
                },
                enabled: {
                  type: "boolean",
                  description: "按启用状态过滤；通常用 status=paused 表达暂停任务。"
                },
                lastStatus: {
                  type: "string",
                  enum: ["succeeded", "failed", "running", "skipped", "timed_out"],
                  description: "按最近一次 run 的执行状态过滤。"
                },
                status: {
                  type: "string",
                  enum: ["enabled", "paused", "succeeded", "failed", "running", "skipped", "timed_out"],
                  description: "按任务/最近执行状态过滤。暂停、暂时、原 tab 不可达这类用户表达应映射为 paused。"
                },
                pauseReasonCode: {
                  type: "string",
                  description: "按暂停原因代码过滤；原 tab 不可达为 notification_target_unavailable。"
                },
                pauseReasonQuery: {
                  type: "string",
                  description: "按暂停原因文本关键词过滤。"
                },
                deleteAfterRun: {
                  type: "boolean",
                  description: "按执行后是否自动删除过滤。"
                }
              }
            },
            prompt: {
              type: "string",
              description: "任务触发时交给 agent 的指令。create 必填；也可放在 payload.prompt。"
            },
            payload: {
              type: "object",
              description: "任务执行载荷。当前只支持 agent_turn；简单场景优先使用顶层 prompt。",
              properties: {
                kind: {
                  type: "string",
                  enum: ["agent_turn"],
                  description: "执行类型，目前固定为 agent_turn。"
                },
                prompt: {
                  type: "string",
                  description: "任务触发时交给 agent 的指令。"
                },
                modelOverride: {
                  type: "string",
                  description: "可选模型覆盖。"
                },
                timeoutMs: {
                  type: "number",
                  description: "可选执行超时毫秒数。"
                }
              }
            },
            delivery: {
              type: "object",
              description: "执行结果投递设置。默认从当前页面创建 chat/tab 投递；notify=false 或 delivery.mode=none 表示不投递。原 tab 不可达时 scheduler 会暂停任务并记录原因，不会找其他页面兜底。",
              properties: {
                mode: {
                  type: "string",
                  enum: ["chat", "none"],
                  description: "chat=把结果发送到原聊天；none=不发送聊天提醒。"
                },
                target: {
                  type: "object",
                  description: "投递目标。通常由运行时根据当前页面自动填充，不需要用户提供。",
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["tab"],
                      description: "目标类型，目前支持 tab。"
                    },
                    tabId: {
                      type: "number",
                      description: "目标标签页 ID。"
                    },
                    url: {
                      type: "string",
                      description: "目标标签页 URL，仅用于记录和校验。"
                    }
                  }
                },
                unavailablePolicy: {
                  type: "string",
                  enum: ["pause"],
                  description: "目标不可达策略，目前固定为 pause。"
                }
              }
            },
            enabled: {
              type: "boolean",
              description: "任务是否启用。create/update 可选，默认启用。"
            },
            reason: {
              type: "string",
              description: "pause 或 enabled=false 时记录的暂停原因。"
            },
            deleteAfterRun: {
              type: "boolean",
              description: "计划触发完成后是否删除任务记录。once 默认 true；其他计划默认 false。"
            },
            keepRuns: {
              type: "boolean",
              description: "delete 时是否保留 run history，默认 false。"
            },
            limit: {
              type: "number",
              description: "runs/history 返回的执行记录数量。"
            },
            full: {
              type: "boolean",
              description: "runs/history 是否返回完整输出内容，默认 false。"
            },
            schedule: {
              type: "object",
              description: "任务计划。由 LLM 将用户时间表达映射为 canonical schedule；daily/weekly 当前按浏览器本地时区解释。",
              properties: {
                kind: {
                  type: "string",
                  enum: ["once", "interval", "daily", "weekly"],
                  description: "计划类型。once=单次/几分钟后/某个时间点；interval=每隔一段时间重复；daily=每日；weekly=每周。"
                },
                runAt: {
                  type: "string",
                  description: "once 的绝对触发时间，ISO 字符串。"
                },
                delayMinutes: {
                  type: "number",
                  description: "once 的相对延迟分钟数。用户说“1 分钟后/10 分钟后”时用 delayMinutes，不要用 everyMinutes。"
                },
                everyMinutes: {
                  type: "number",
                  description: "interval 的重复间隔分钟数，当前最小 1。仅当用户明确要求“每 N 分钟/重复/周期性”时使用。"
                },
                startAt: {
                  type: "string",
                  description: "interval 可选首次运行 ISO 时间。"
                },
                timeOfDay: {
                  type: "string",
                  description: "daily/weekly 使用的本地时间，HH:MM。"
                },
                weekdays: {
                  type: "array",
                  items: {
                    type: "number"
                  },
                  description: "weekly 使用，0=周日，1=周一，...，6=周六。"
                },
                timezone: {
                  type: "string",
                  description: "记录用途的时区名；当前计算仍使用浏览器本地时间。"
                }
              },
              required: ["kind"]
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

    if (name === "scheduled_task") {
      if (!globalThis.DogeclawScheduler?.execute) {
        throw new Error(t("scheduler.runtimeUnavailable"));
      }
      return DogeclawScheduler.execute(args, context);
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
