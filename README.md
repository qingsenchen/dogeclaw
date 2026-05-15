<p align="center">
  <img src="icons/icon-128.png" alt="dogeclaw" width="96" height="96">
</p>

<h1 align="center">dogeclaw</h1>

<p align="center">
  A browser-side agent companion for openclaw, bringing site-specific tools and in-page automation to Chrome.
</p>

<p align="center">
  English
  · <a href="README.zh-CN.md">简体中文</a>
  · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#features">Features</a>
  · <a href="#demo">Demo</a>
  · <a href="#why-dogeclaw">Why dogeclaw?</a>
  · <a href="#quick-start">Quick Start</a>
  · <a href="#configuration">Configuration</a>
  · <a href="#usage">Usage</a>
  · <a href="#privacy-and-permissions">Privacy</a>
  · <a href="#development">Development</a>
</p>

## Overview

dogeclaw is a browser AI assistant packaged as a Chrome Manifest V3 extension. It adds a draggable floating pet to web pages, supports in-page chat, OpenAI-compatible LLM providers, tool calling, browser actions, selected-text handoff, and optional WeChat channel integration.

The project is designed to run locally as an unpacked extension. It does not ship with a built-in API key.

## Why dogeclaw?

dogeclaw is built for browser-side agents. Many professional websites, including stock trading platforms, e-commerce back offices, analytics dashboards, and operational tools, have highly specialized interfaces and domain-specific workflows. These differences make it difficult for a pure AI operator to complete tasks reliably with generic page understanding alone.

Our approach is to customize tool calls for different websites and workflows. Instead of asking an AI agent to infer every interaction from pixels or DOM snapshots, dogeclaw can expose focused browser-side tools that understand the target website's behavior. This makes it possible to complete tasks that are hard for general browser automation to finish on its own.

Compared with openclaw, dogeclaw reduces configuration and is easier to load directly in the browser. But dogeclaw is not intended to replace openclaw. The goal is to become a capable companion to openclaw. In future versions, dogeclaw will communicate with openclaw through the A2A protocol so the two systems can collaborate: openclaw can orchestrate broader agent work, while dogeclaw can handle specialized browser-side actions and site-specific tools.

In short, dogeclaw and openclaw are complementary. dogeclaw focuses on practical browser-side agent capabilities, especially where specialized websites require custom tools rather than generic AI operation.

## Demo

<p align="center">
  <img src="docs/demo.gif" alt="dogeclaw demo" width="720">
</p>

## Features

- Draggable desktop-pet style floating assistant on web pages
- Per-page enable/disable toggle from the Chrome extension action
- In-page chat UI with streaming LLM responses
- OpenAI-compatible model provider configuration
- Agent loop with tool calling and browser-control capabilities
- Weather lookup tool
- Right-click menu for sending selected text to dogeclaw
- Optional WeChat channel login, polling, message handling, and media support
- Built-in English, Simplified Chinese, and Japanese localization

## Quick Start

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the project directory.
6. Open or refresh a web page. The dogeclaw floating button should appear in the lower-right corner.

After editing extension files, click Reload on the extension card in `chrome://extensions/`, then refresh the target page.

## Configuration

### LLM Provider

dogeclaw uses an OpenAI-compatible chat completions API. Configure your own provider before using chat features.

Open the dogeclaw floating panel, choose the LLM Provider configuration view, and fill in:

- Base URL, for example `https://api.openai.com/v1`
- Model, for example `gpt-4o-mini`
- API Key from your provider

You can replace `model` and `apiBase` with any compatible provider, such as OpenAI, DashScope-compatible gateways, DeepSeek-compatible gateways, or other OpenAI-compatible services.

### Debug Logging

LLM debug logging is disabled by default. If you enable it in `config.js`, request and response payloads may be written to the browser console. Avoid enabling debug logs when handling private page content or sensitive prompts.

## Usage

### Open and Toggle dogeclaw

Click the dogeclaw icon in the Chrome toolbar to enable or disable the floating assistant on the current page. If the assistant does not appear after installation or reload, refresh the target page.

### Configure a Model Provider

Open the floating panel, switch to the LLM Provider configuration view, and save your Base URL, model name, and API key. The key is stored locally in Chrome extension storage and is not committed to this repository.

### Chat on a Page

Click the floating pet to open the chat panel. You can ask questions, summarize page content, request browser actions, or use supported tools. Responses stream into the panel when the configured provider supports streaming.

### Send Selected Text

Select text on any page, right-click, and choose the dogeclaw menu item to send the selection into the assistant input. This is useful for summarizing, translating, rewriting, or asking follow-up questions about a specific passage.

### Browser and Tool Actions

dogeclaw can run supported tools such as weather lookup and browser-control helpers. Treat browser actions as user-directed automation: review prompts before sending sensitive page content or asking the assistant to interact with private pages.

### WeChat Channel

If you enable the WeChat channel, open the channel configuration view from the floating panel and follow the login flow. After configuration, dogeclaw can poll the channel, process incoming messages, and reply through the configured LLM provider.

### Troubleshooting

- Reload the extension from `chrome://extensions/` after changing local files.
- Refresh the target page after reloading the extension.
- Reopen the LLM Provider panel if chat replies fail, and confirm that Base URL, model, and API key are correct.
- Check the extension Service Worker console for development errors.

## Privacy and Permissions

dogeclaw requests the following Chrome extension permissions:

- `activeTab`: interact with the currently active page
- `scripting`: inject extension scripts into pages
- `storage`: store local configuration and channel state
- `alarms`: schedule polling tasks
- `tabs`: coordinate page-level assistant state and browser actions
- `contextMenus`: add selected-text actions to the right-click menu
- `<all_urls>` host access: load the assistant UI across web pages

Content you send to dogeclaw, including typed messages, selected text, page context, screenshots, or tool results, may be sent to the LLM provider you configure. Review your provider's data policy before sending sensitive information.

No API key is included in this repository. Store only your own key locally through Chrome extension storage.

## Project Structure

```text
.
├── manifest.json              # Chrome Manifest V3 extension manifest
├── _locales/                  # Chrome WebExtension locale messages
├── config.js                  # Runtime defaults and storage keys
├── i18n.js                    # Runtime localization dictionaries and helpers
├── background.js              # Service worker, agent routing, tools, channels
├── content.js                 # In-page assistant UI and page bridge
├── ui.js                      # Shared UI rendering helpers
├── pet.js                     # Floating pet animation and interaction logic
├── llm.js                     # OpenAI-compatible LLM client
├── agent.js                   # Agent loop and streaming orchestration
├── tools.js                   # Tool definitions exposed to the agent
├── browser.js                 # Browser-control helpers
├── channels/
│   └── wechat.js              # WeChat channel, login, polling, media handling
├── vendor/
│   └── qrcode-generator.js    # Third-party QR code generator, MIT licensed
└── icons/                     # Extension icons
```

## Development

Run JavaScript syntax checks:

```sh
node --check background.js
node --check channels/wechat.js
node --check content.js
node --check llm.js
```

Recommended release checks before publishing:

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
node --check background.js
node --check channels/wechat.js
node --check content.js
node --check llm.js
```

The repository intentionally avoids committing local credentials, build artifacts, browser extension packages, and environment files.

## Contributing

Contributions are welcome, especially around browser-side agent capabilities, site-specific tools, LLM provider compatibility, WeChat channel reliability, documentation, and i18n.

Before opening a pull request:

- Fork the repository and create a focused feature branch.
- Load the extension locally with Chrome Developer mode and test the changed workflow.
- Run the JavaScript syntax checks listed above.
- Run the basic secret scan listed above.
- Update English, Simplified Chinese, and Japanese i18n strings when changing user-visible text.
- Do not commit API keys, tokens, cookies, local logs, `.env` files, generated extension packages, or private screenshots.

Please include a clear description, manual testing steps, affected pages or browsers, and screenshots or GIFs when the change affects UI behavior.

For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Third-Party Notices

- `vendor/qrcode-generator.js` is based on QR Code Generator for JavaScript by Kazuhiko Arase and is licensed under the MIT License.

## License

MIT. See [LICENSE](LICENSE).
