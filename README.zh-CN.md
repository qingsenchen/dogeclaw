<p align="center">
  <img src="icons/icon-128.png" alt="dogeclaw" width="96" height="96">
</p>

<h1 align="center">dogeclaw</h1>

<p align="center">
  面向 Chrome 的浏览器端 agent，提供站点定制工具、页面对话和自动化能力。
</p>

<p align="center">
  <a href="README.md">English</a>
  · 简体中文
  · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#功能">功能</a>
  · <a href="#演示">演示</a>
  · <a href="#为什么是-dogeclaw">为什么是 dogeclaw?</a>
  · <a href="#快速开始">快速开始</a>
  · <a href="#配置">配置</a>
  · <a href="#使用说明">使用说明</a>
  · <a href="#隐私和权限">隐私</a>
  · <a href="#开发">开发</a>
</p>

## 概览

dogeclaw 是一个基于 Chrome Manifest V3 的浏览器 AI 助手扩展。它会在网页中添加一个可拖动的悬浮宠物，支持页面内对话、OpenAI-compatible LLM 提供商、工具调用、浏览器操作、选中文本发送，以及可选的微信频道集成。

项目设计为本地加载的未打包扩展使用。仓库不会内置任何 API Key。

## 为什么是 dogeclaw?

dogeclaw 致力于浏览器端 agent。许多专业网站，例如股票网站、电商后台、数据看板和业务系统，都有高度定制的页面结构和领域工作流。这些差异使得纯 AI 操作很难仅依靠通用页面理解稳定完成任务。

我们的思路是为不同的网站和工作流定制工具调用。相比让 AI 从像素或 DOM 快照中推断所有操作，dogeclaw 可以暴露更聚焦的浏览器端工具，让工具理解目标网站的行为。这使得一些通用浏览器自动化难以完成的功能，可以通过 dogeclaw 更稳定地完成。

相比 openclaw，dogeclaw 减少了许多配置，更适合直接在浏览器中加载和使用。但 dogeclaw 的目的不是替代 openclaw，而是打造 openclaw 的得力助手。后续 dogeclaw 会通过 A2A 协议与 openclaw 交互：openclaw 负责更广泛的 agent 编排，dogeclaw 负责专业网站中的浏览器端动作和站点定制工具。

因此，dogeclaw 和 openclaw 是互补关系。dogeclaw 聚焦实际浏览器端 agent 能力，尤其适合那些需要专用工具调用、无法完全依赖通用 AI 操作完成的网站场景。

## 演示

<p align="center">
  <img src="docs/demo.gif" alt="dogeclaw 演示" width="720">
</p>

## 功能

- 在网页中显示可拖动的桌面宠物式悬浮助手
- 可通过 Chrome 扩展图标按页面开启或关闭
- 页面内聊天 UI，支持流式 LLM 回复
- 支持 OpenAI-compatible 模型服务配置
- 支持 agent loop、工具调用和浏览器控制
- 支持天气查询工具
- 支持通过右键菜单把选中文本发送给 dogeclaw
- 可选的微信频道登录、轮询、消息和媒体处理
- 内置英文、简体中文和日文界面本地化

## 快速开始

1. 克隆或下载本仓库。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 启用“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择项目目录。
6. 打开或刷新任意网页，右下角会出现 dogeclaw 悬浮按钮。

修改扩展文件后，需要在 `chrome://extensions/` 中点击扩展卡片上的“重新加载”，然后刷新目标网页。

## 配置

### LLM 提供商

dogeclaw 使用 OpenAI-compatible Chat Completions API。使用聊天功能前，需要配置你自己的模型服务。

打开 dogeclaw 悬浮面板，进入 LLM 提供商配置视图，并填写：

- Base URL，例如 `https://api.openai.com/v1`
- Model，例如 `gpt-4o-mini`
- 你的模型服务 API Key

你可以把 `model` 和 `apiBase` 替换为任何兼容服务，例如 OpenAI、DashScope-compatible 网关、DeepSeek-compatible 网关或其他 OpenAI-compatible 服务。

### 调试日志

LLM 调试日志默认关闭。如果在 `config.js` 中开启，请求和响应内容可能会写入浏览器控制台。处理私密页面内容或敏感提示词时，不建议开启调试日志。

## 使用说明

### 打开和开关 dogeclaw

点击 Chrome 工具栏中的 dogeclaw 图标，可以在当前页面开启或关闭悬浮助手。如果安装或重新加载后没有看到悬浮按钮，请刷新目标网页。

### 配置模型服务

打开悬浮面板，进入 LLM 提供商配置视图，保存 Base URL、模型名称和 API Key。API Key 会保存在 Chrome 扩展本地存储中，不会提交到本仓库。

### 页面内对话

点击悬浮宠物可以打开聊天面板。你可以提问、总结页面内容、请求浏览器操作，或使用支持的工具。如果模型服务支持流式输出，回复会实时显示在面板中。

### 发送选中文本

在任意网页中选中文本，右键选择 dogeclaw 菜单项，即可把选中内容发送到助手输入框。这个功能适合用来总结、翻译、改写或针对局部文本继续提问。

### 浏览器和工具操作

dogeclaw 可以调用天气查询和浏览器控制等受支持工具。浏览器操作属于用户指令驱动的自动化；在处理私密页面或敏感内容前，请先确认要发送给模型服务的信息。

### 微信频道

如果启用微信频道，可以从悬浮面板进入频道配置视图，并按登录流程完成配置。配置完成后，dogeclaw 可以轮询频道消息、处理收到的内容，并通过已配置的 LLM 提供商回复。

### 常见问题

- 修改本地文件后，需要在 `chrome://extensions/` 中重新加载扩展。
- 重新加载扩展后，需要刷新目标网页。
- 如果聊天回复失败，请重新打开 LLM 提供商配置面板，确认 Base URL、模型名称和 API Key 正确。
- 开发调试时可以查看扩展的 Service Worker 控制台。

## 隐私和权限

dogeclaw 会请求以下 Chrome 扩展权限：

- `activeTab`: 与当前活动页面交互
- `scripting`: 向网页注入扩展脚本
- `storage`: 保存本地配置和频道状态
- `alarms`: 调度轮询任务
- `tabs`: 协调页面级助手状态和浏览器操作
- `contextMenus`: 添加选中文本相关的右键菜单
- `<all_urls>` host access: 在网页中加载助手 UI

你发送给 dogeclaw 的内容，包括输入消息、选中文本、页面上下文、截图或工具结果，可能会发送到你配置的 LLM 提供商。发送敏感信息前，请先确认服务商的数据政策。

本仓库不包含任何 API Key。请仅通过 Chrome 扩展本地存储保存你自己的 Key。

## 项目结构

```text
.
├── manifest.json              # Chrome 本地开发扩展清单
├── manifest/                  # 不同浏览器目标的 manifest 模板
├── scripts/build-extension.mjs # Chrome、Edge、Firefox 构建脚本
├── _locales/                  # Chrome WebExtension 本地化消息
├── platform/
│   └── extension-api.js       # 跨浏览器扩展 API 适配层
├── config.js                  # 运行时默认值和存储 Key
├── i18n.js                    # 运行时本地化字典和辅助函数
├── background.js              # 后台 agent 路由、工具和频道
├── background-loader.js       # Chrome/Edge Service Worker 脚本加载器
├── content.js                 # 页面内助手 UI 和页面桥接
├── ui.js                      # 共享 UI 渲染辅助
├── pet.js                     # 悬浮宠物动画和交互逻辑
├── llm.js                     # OpenAI-compatible LLM 客户端
├── agent.js                   # Agent loop 和流式编排
├── tools.js                   # 暴露给 agent 的工具定义
├── browser.js                 # 浏览器控制辅助
├── channels/
│   └── wechat.js              # 微信频道、登录、轮询和媒体处理
├── vendor/
│   └── qrcode-generator.js    # 第三方二维码生成库，MIT License
└── icons/                     # 扩展图标
```

## 开发

### 本地浏览器加载方式

Chrome 和 Edge 日常开发可以直接加载仓库根目录，因为根目录的 `manifest.json` 是 Chromium MV3 开发用 manifest。

- Chrome: 打开 `chrome://extensions/`，启用“开发者模式”，点击“加载已解压的扩展”，选择仓库根目录。
- Edge: 打开 `edge://extensions/`，启用“开发人员模式”，点击“加载解压缩的扩展”，选择仓库根目录。

修改文件后，在浏览器扩展管理页点击重新加载扩展，并刷新正在测试的网页。

Firefox 建议使用生成后的 Firefox 构建产物，因为它需要不同的后台加载方式。执行：

```sh
npm run build:firefox
```

然后打开 `about:debugging#/runtime/this-firefox`，点击 “Load Temporary Add-on”，选择 `dist/firefox/manifest.json`。修改文件后，需要重新构建 Firefox 产物并重新加载临时扩展。

构建不同浏览器目标的扩展目录：

```sh
npm run build:chrome
npm run build:edge
npm run build:firefox
```

构建产物会写入 `dist/<target>`。根目录的 `manifest.json` 继续用于 Chrome 本地开发加载，生成的 manifest 用于隔离不同浏览器的后台加载方式和兼容性差异。

运行 JavaScript 语法检查：

```sh
npm run check
```

发布前建议检查：

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
npm run check
```

新增浏览器 API 时，请通过 `platform/extension-api.js` 调用，不要在功能模块里直接使用 `chrome.*` 或 `browser.*`。这样 Chrome、Edge、Firefox 的兼容性工作可以集中在平台层和 manifest 模板里。

仓库会避免提交本地凭证、构建产物、浏览器扩展包和环境文件。

## 贡献

欢迎贡献，尤其是浏览器端 agent 能力、站点定制工具、LLM 提供商兼容性、微信频道稳定性、文档和 i18n 相关改进。

提交 Pull Request 前：

- Fork 本仓库，并基于 `main` 创建聚焦的功能分支。
- 使用 Chrome 开发者模式本地加载扩展，并测试被修改的工作流。
- 运行上面的 JavaScript 语法检查。
- 运行上面的基础敏感信息扫描。
- 修改用户可见文案时，同步更新英文、简体中文和日文 i18n 字符串。
- 不要提交 API Key、token、cookie、本地日志、`.env` 文件、生成的扩展包或私有截图。

请在 PR 中说明改动内容、手动测试步骤、受影响页面或浏览器；如果改动影响 UI，请附上截图或 GIF。

更多细节见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 第三方声明

- `vendor/qrcode-generator.js` 基于 Kazuhiko Arase 的 QR Code Generator for JavaScript，使用 MIT License。

## License

MIT。见 [LICENSE](LICENSE)。
