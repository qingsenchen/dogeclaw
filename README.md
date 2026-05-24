<p align="center">
  <img src="icons/icon-128.png" alt="dogeclaw" width="96" height="96">
</p>

<h1 align="center">dogeclaw</h1>

<p align="center">
  A Chrome MV3 browser agent that brings chat, tool calling, page control, screenshots, scheduled jobs, skills, and optional WeChat messages into any webpage.
</p>

<p align="center">
  English
  · <a href="README.zh-CN.md">简体中文</a>
  · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#demo">Demo</a>
  · <a href="#why-it-stands-out">Why</a>
  · <a href="#features">Features</a>
  · <a href="ROADMAP.md">Roadmap</a>
  · <a href="#quick-start">Quick Start</a>
  · <a href="#configuration">Configuration</a>
  · <a href="#privacy-and-permissions">Privacy</a>
  · <a href="#development">Development</a>
</p>

## Demo

<p align="center">
  <img src="docs/demo.gif" alt="dogeclaw demo" width="720">
</p>

## What Is It?

dogeclaw is a local-first browser AI assistant packaged as an unpacked Chrome extension. It adds a draggable floating pet to webpages, opens an in-page chat panel, calls browser-side tools, and works with any OpenAI-compatible Chat Completions provider you configure.

It is built for teams and makers who want a practical browser-side agent without running a separate desktop app or shipping an API key in the repository.

## Why It Stands Out

- **Agent lives inside the browser**: chat with the current page, inspect interactive elements, click, type, scroll, navigate, open tabs, and capture screenshots from one extension.
- **Site-specific tools are the core direction**: professional sites often have custom workflows that generic visual automation handles poorly. dogeclaw is designed to expose focused tools for those sites.
- **Low-friction local setup**: load the repository as an unpacked Chrome extension, add your own OpenAI-compatible provider, and start testing.
- **Channel-ready architecture**: optional WeChat channel support can poll messages, process media, and reply through the configured model provider.
- **Persistent scheduled jobs**: reminders and recurring tasks run through a decoupled scheduler with job definitions, runtime state, run history, and a replaceable alarm provider.
- **Complementary to openclaw**: dogeclaw focuses on browser-side actions and site tools; future A2A integration can let openclaw orchestrate broader workflows while dogeclaw handles the page.

## Features

- Draggable floating assistant on every supported webpage
- In-page chat UI with streaming model responses
- OpenAI-compatible provider settings for Base URL, model, API key, and system prompt
- Agent loop with tool calling
- Slash commands for `/new`, `/model`, `/skills`, and `/tasks`
- Skill loading and `/skills` management for enabling focused tool guidance
- Persistent scheduled tasks powered by `chrome.alarms` behind a decoupled scheduler API
- `/tasks` management panel with enable/pause switches, next-run status, pause reasons, and recent run status
- Scheduled task delivery back to the original chat tab, with no fallback to unrelated pages
- Browser control tools: current tab, list tabs, new tab, navigate, snapshot, screenshot, click, type, scroll, back, forward, reload
- Right-click menu to send selected text into the assistant
- Screenshot artifacts that can be shown in chat
- Weather lookup tool
- Optional WeChat QR login, long polling, message handling, and media support
- English, Simplified Chinese, and Japanese localization
- Chrome, Edge, and Firefox build targets

## Good Fits

- Summarize, translate, or rewrite selected text on any page
- Ask questions while staying inside the page you are reading
- Prototype browser agents for dashboards, back offices, ecommerce systems, financial tools, and other specialized websites
- Build site-specific tool calls instead of relying only on generic pixel or DOM inference
- Create one-shot reminders or recurring browser-side agent jobs that report back into the page where they were created
- Connect browser-side actions with external message channels such as WeChat

## Quick Start

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the repository root.
6. Open or refresh a webpage. The dogeclaw floating button appears in the lower-right corner.

After editing extension files, click Reload on the extension card in `chrome://extensions/`, then refresh the page you are testing.

## Configuration

dogeclaw does not include an API key. Before using chat or agent tools, open the floating panel and configure your own OpenAI-compatible provider:

| Field | Example |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| Model | `gpt-4o-mini` |
| API Key | Your provider key |

The key is stored in Chrome extension storage. You can use OpenAI, DashScope-compatible gateways, DeepSeek-compatible gateways, OpenRouter-style gateways, or other services that expose an OpenAI-compatible Chat Completions API.

### Slash Commands And Skills

Type `/` in the in-page input to open the command menu:

| Command | Purpose |
| --- | --- |
| `/new` | Clear the current conversation |
| `/model` | Open LLM provider settings |
| `/skills` | Manage bundled skills |
| `/tasks` | Manage scheduled tasks |

Skills are local instruction files that help the agent choose and use tools for specific workflows. Bundled skills currently include current-page search and weather guidance, and they can be enabled or disabled from `/skills`.

### Scheduled Tasks

dogeclaw can create background scheduled jobs through the `scheduled_task` tool. The scheduler keeps job definitions, runtime state, and run history separately, while `chrome.alarms` is only the current wake-up provider.

Supported schedules:

| Kind | Use case |
| --- | --- |
| `once` | One-shot reminders such as "in 10 minutes" or a specific future time |
| `interval` | Explicitly recurring intervals such as "every 30 minutes" |
| `daily` | Daily jobs at a browser-local time |
| `weekly` | Weekly jobs on selected weekdays |

One-shot jobs are removed after a successful automatic run by default. Manual runs do not delete the job. If a job was created from a page and the original tab is no longer reachable, dogeclaw pauses the job, records the pause reason, and does not send the result to another page.

### Optional WeChat Channel

Open the channel configuration view from the floating panel, start the QR login flow, and wait for configuration to complete. Once enabled, dogeclaw can poll WeChat channel messages, process incoming content, and reply through the configured LLM provider.

## Privacy And Permissions

dogeclaw runs locally as a browser extension, but content you send to the assistant may be sent to the model provider you configure. This can include typed prompts, selected text, page context, screenshots, tool results, scheduled task prompts/results, and WeChat channel content.

Before publishing or installing from a store, review the [Privacy Policy](PRIVACY.md) and [Chrome Web Store compliance notes](docs/chrome-store-compliance.md).

Requested extension permissions:

| Permission | Purpose |
| --- | --- |
| `activeTab` | Interact with the active page |
| `scripting` | Inject assistant scripts |
| `storage` | Store local model and channel settings |
| `alarms` | Schedule channel polling and scheduled-task wake-ups |
| `tabs` | Coordinate tab state and browser actions |
| `contextMenus` | Add selected-text actions |
| `<all_urls>` | Load the assistant across webpages |

Review your model provider's data policy before sending private pages or sensitive content.

## Project Layout

| Path | Purpose |
| --- | --- |
| `manifest.json` | Chrome development manifest |
| `manifest/` | Browser-specific manifest templates |
| `content/` | In-page assistant UI, browser action bridge, and styles |
| `background.js` | Service worker routing, agent calls, tools, channels, and scheduled-task delivery |
| `agent.js` | Agent loop and streaming orchestration |
| `tools.js` | Tool schemas exposed to the model |
| `browser.js` | Browser-control tool runtime |
| `skills.js` | Bundled skill loading, filtering, and settings |
| `scheduler.js` | Scheduled job definitions, runtime state, run history, and alarm provider |
| `channels/wechat.js` | WeChat login, polling, messaging, and media handling |
| `ui.js` | Shared in-page UI rendering helpers |
| `i18n.js` | English, Simplified Chinese, and Japanese runtime strings |
| `config.js` | Runtime storage keys, limits, and feature defaults |
| `llm.js` | OpenAI-compatible LLM client |
| `platform/extension-api.js` | Chrome/Edge/Firefox API adapter |
| `scripts/build-extension.mjs` | Build script for Chrome, Edge, and Firefox |

## Development

Run JavaScript syntax checks:

```sh
npm run check
```

Build browser-specific extension directories:

```sh
npm run build:chrome
npm run build:edge
npm run build:firefox
```

Generated builds are written to `dist/<target>`. Chrome and Edge can load the repository root directly during development. Firefox should load the generated `dist/firefox/manifest.json` temporary add-on.

When adding browser APIs, call them through `platform/extension-api.js` instead of directly using `chrome.*` or `browser.*`. This keeps cross-browser compatibility in one layer.

Before publishing, run:

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
npm run check
```

## Contributing

Contributions are welcome, especially around browser-side agent capabilities, site-specific tools, provider compatibility, WeChat channel reliability, documentation, and i18n.

For the project direction and contribution themes, see [ROADMAP.md](ROADMAP.md).

Before opening a pull request:

- Test the changed workflow with Chrome Developer mode.
- Run `npm run check`.
- Do not commit API keys, tokens, cookies, local logs, `.env` files, generated extension packages, or private screenshots.
- Update English, Simplified Chinese, and Japanese UI strings when changing user-visible interface text.

For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Third-Party Notices

- `vendor/qrcode-generator.js` is based on QR Code Generator for JavaScript by Kazuhiko Arase and is licensed under the MIT License.

## License

MIT. See [LICENSE](LICENSE).
