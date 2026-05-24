<p align="center">
  <img src="icons/icon-128.png" alt="dogeclaw" width="96" height="96">
</p>

<h1 align="center">dogeclaw</h1>

<p align="center">
  一个可直接加载到 Chrome 的浏览器端 AI agent，把页面对话、工具调用、浏览器操作、截图、定时任务、Skills 和微信消息通道放进网页里。
</p>

<p align="center">
  <a href="README.md">English</a>
  · 简体中文
  · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#演示">演示</a>
  · <a href="#项目亮点">亮点</a>
  · <a href="#功能">功能</a>
  · <a href="ROADMAP.md">Roadmap</a>
  · <a href="#快速开始">快速开始</a>
  · <a href="#配置">配置</a>
  · <a href="#隐私和权限">隐私</a>
  · <a href="#开发">开发</a>
</p>

## 演示

<p align="center">
  <img src="docs/demo.gif" alt="dogeclaw 演示" width="720">
</p>

## 它是什么？

dogeclaw 是一个本地优先的浏览器 AI 助手，以 Chrome 未打包扩展的形式运行。它会在网页中注入一个可拖动的悬浮宠物，打开页面内聊天面板，调用浏览器端工具，并接入你配置的 OpenAI-compatible Chat Completions 模型服务。

它适合想快速验证浏览器端 agent 的开发者：不需要额外桌面应用，不在仓库里内置 API Key，加载扩展后即可在真实网页中试用。

## 项目亮点

- **agent 直接住在浏览器里**：在当前页面对话，读取可交互元素，点击、输入、滚动、跳转、开标签页和截图都通过一个扩展完成。
- **核心方向是站点定制工具**：许多业务系统、后台、看板和金融工具都有强领域流程，通用视觉自动化并不稳定；dogeclaw 面向这些场景暴露更聚焦的工具调用。
- **本地加载，启动成本低**：用 Chrome 开发者模式加载仓库，填入自己的 OpenAI-compatible 服务，就能开始测试。
- **消息通道可扩展**：内置可选微信频道，支持扫码配置、长轮询、消息处理、媒体处理和模型回复。
- **持久化定时任务**：支持一次性提醒和周期任务，调度层拆分为 job 定义、运行态 state、run 执行记录和可替换的 alarm provider。
- **与 openclaw 互补**：dogeclaw 负责浏览器侧动作和站点工具，后续可通过 A2A 与 openclaw 协作，让 openclaw 做更大的 agent 编排。

## 功能

- 网页内可拖动的悬浮助手
- 页面内聊天 UI，支持模型流式回复
- OpenAI-compatible 服务配置：Base URL、模型、API Key、系统提示词
- 支持 agent loop 和工具调用
- 输入框内置 Slash 命令：`/new`、`/model`、`/skills`、`/tasks`
- 支持本地 Skill 加载和 `/skills` 管理，可按需启用更聚焦的工具指导
- 基于 `chrome.alarms` provider 的持久化定时任务，调度 API 已与 provider 解耦
- `/tasks` 管理界面：支持启用/暂停开关、下次执行时间、暂停原因和最近执行状态
- 定时任务结果会回到创建任务的原聊天标签页；原标签页不可达时不会兜底发送到其他页面
- 浏览器控制工具：当前标签页、标签页列表、新建标签页、跳转、页面快照、截图、点击、输入、滚动、后退、前进、刷新
- 右键菜单将选中文本发送给助手
- 截图结果可直接显示在聊天中
- 天气查询工具
- 可选微信频道：扫码登录、长轮询、消息处理、媒体处理
- 内置英文、简体中文、日文界面
- 支持 Chrome、Edge、Firefox 构建目标

## 适合场景

- 在任意网页中总结、翻译、改写选中文本
- 阅读页面时就地提问，不必在多个应用之间切换
- 为数据看板、业务后台、电商系统、金融工具等专业网站原型化浏览器 agent
- 用站点定制工具替代单纯依赖像素或 DOM 推理的自动化方案
- 创建一次性提醒或周期性的浏览器端 agent 任务，并把结果发送回创建任务的页面
- 将浏览器端动作接入微信等外部消息通道

## 快速开始

1. 克隆或下载本仓库。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择仓库根目录。
6. 打开或刷新任意网页，右下角会出现 dogeclaw 悬浮按钮。

修改扩展文件后，需要在 `chrome://extensions/` 的扩展卡片中点击“重新加载”，然后刷新正在测试的网页。

## 配置

dogeclaw 不包含 API Key。使用聊天或 agent 工具前，请打开悬浮面板，配置你自己的 OpenAI-compatible 模型服务：

| 字段 | 示例 |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| Model | `gpt-4o-mini` |
| API Key | 你的服务商密钥 |

API Key 会保存在 Chrome 扩展本地存储中。你可以使用 OpenAI、DashScope-compatible 网关、DeepSeek-compatible 网关、OpenRouter 类网关，或其它兼容 Chat Completions API 的服务。

### Slash 命令和 Skills

在页面内输入框输入 `/` 可以打开命令菜单：

| 命令 | 作用 |
| --- | --- |
| `/new` | 清空当前会话 |
| `/model` | 打开 LLM Provider 配置 |
| `/skills` | 管理内置 Skills |
| `/tasks` | 管理定时任务 |

Skill 是本地指令文件，用来指导 agent 在特定工作流中选择和使用工具。当前内置 current-page search 和 weather 相关 Skill，可以在 `/skills` 中启用或关闭。

### 定时任务

dogeclaw 可以通过 `scheduled_task` 工具创建后台定时任务。调度器将 job 定义、运行态 state 和 run 执行记录分开保存，`chrome.alarms` 只是当前的唤醒 provider，后续可以替换。

支持的计划类型：

| 类型 | 适用场景 |
| --- | --- |
| `once` | “10 分钟后”或某个未来时间点的一次性提醒 |
| `interval` | 明确要求重复的间隔任务，例如“每 30 分钟” |
| `daily` | 每天在浏览器本地时间执行 |
| `weekly` | 每周指定星期执行 |

一次性任务自动执行成功后默认会删除；手动执行不会删除任务。如果任务从某个页面创建，而原始标签页已经不可达，dogeclaw 会暂停任务并记录暂停原因，不会把结果发送到其它页面兜底。

### 可选微信频道

从悬浮面板进入频道配置视图，发起二维码登录并等待配置完成。启用后，dogeclaw 可以轮询微信频道消息，处理收到的内容，并通过已配置的模型服务回复。

## 隐私和权限

dogeclaw 以本地浏览器扩展形式运行，但你发送给助手的内容可能会发往你配置的模型服务商。这些内容可能包括输入消息、选中文本、页面上下文、截图、工具结果、定时任务指令/结果和微信频道内容。

发布到扩展商店或正式安装前，请先查看 [Privacy Policy](PRIVACY.md) 和 [Chrome Web Store 合规说明](docs/chrome-store-compliance.md)。

扩展会请求以下权限：

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 与当前活动页面交互 |
| `scripting` | 注入助手脚本 |
| `storage` | 保存本地模型和频道配置 |
| `alarms` | 调度频道轮询和定时任务唤醒 |
| `tabs` | 协调标签页状态和浏览器操作 |
| `contextMenus` | 添加选中文本右键菜单 |
| `<all_urls>` | 在网页中加载助手 |

发送私密页面或敏感内容前，请先确认模型服务商的数据政策。

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `manifest.json` | Chrome 本地开发 manifest |
| `manifest/` | 不同浏览器目标的 manifest 模板 |
| `content/` | 页面内助手 UI、浏览器动作桥接和样式 |
| `background.js` | Service Worker 路由、agent 调用、工具、频道和定时任务投递 |
| `agent.js` | Agent loop 和流式编排 |
| `tools.js` | 暴露给模型的工具 schema |
| `browser.js` | 浏览器控制工具运行时 |
| `skills.js` | 内置 Skill 加载、筛选和配置 |
| `scheduler.js` | 定时任务 job 定义、运行态 state、run 记录和 alarm provider |
| `channels/wechat.js` | 微信登录、轮询、消息和媒体处理 |
| `ui.js` | 页面内 UI 渲染辅助模块 |
| `i18n.js` | 英文、简体中文、日文运行时文案 |
| `config.js` | 运行时存储键、限制和默认配置 |
| `llm.js` | OpenAI-compatible LLM 客户端 |
| `platform/extension-api.js` | Chrome/Edge/Firefox API 适配层 |
| `scripts/build-extension.mjs` | Chrome、Edge、Firefox 构建脚本 |

## 开发

运行 JavaScript 语法检查：

```sh
npm run check
```

构建不同浏览器目标：

```sh
npm run build:chrome
npm run build:edge
npm run build:firefox
```

构建产物会写入 `dist/<target>`。Chrome 和 Edge 日常开发可以直接加载仓库根目录；Firefox 建议加载生成后的 `dist/firefox/manifest.json` 临时扩展。

新增浏览器 API 时，请通过 `platform/extension-api.js` 调用，不要在功能模块里直接使用 `chrome.*` 或 `browser.*`。这样可以把跨浏览器兼容性集中到一层。

发布前建议执行：

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
npm run check
```

## 贡献

欢迎贡献，尤其是浏览器端 agent 能力、站点定制工具、模型服务兼容性、微信频道稳定性、文档和 i18n。

项目方向和适合参与的主题见 [ROADMAP.md](ROADMAP.md)。

提交 Pull Request 前：

- 使用 Chrome 开发者模式测试被修改的工作流。
- 运行 `npm run check`。
- 不要提交 API Key、token、cookie、本地日志、`.env` 文件、生成的扩展包或私有截图。
- 修改用户可见界面文案时，同步更新英文、简体中文和日文 UI 字符串。

更多细节见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 第三方声明

- `vendor/qrcode-generator.js` 基于 Kazuhiko Arase 的 QR Code Generator for JavaScript，使用 MIT License。

## License

MIT。见 [LICENSE](LICENSE)。
