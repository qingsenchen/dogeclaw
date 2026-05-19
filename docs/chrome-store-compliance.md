# Chrome Web Store Compliance Notes

This document keeps the Chrome Web Store review materials close to the codebase. It does not change extension behavior.

## Current submission status

Status: almost ready after privacy and disclosure updates, with one review-sensitive item that must be explained clearly.

The extension is Manifest V3, uses packaged local scripts, and does not intentionally load remote JavaScript. The main review risk is the broad `<all_urls>` access required to show the assistant on webpages and run page tools.

## Single purpose

dogeclaw is an in-page browser AI assistant. Its single purpose is to let the user talk to the current webpage, run user-requested browser-side tools, and optionally bridge messages through a user-configured channel.

All major features support that purpose:

- Floating assistant and page chat.
- Browser-control tools such as snapshot, screenshot, click, type, scroll, navigation, and tab coordination.
- OpenAI-compatible provider configuration supplied by the user.
- Optional WeChat channel that forwards channel messages through the same assistant workflow.
- Weather lookup as a small assistant tool.

## Permission justification

Use these justifications in the Chrome Web Store developer dashboard.

| Permission | Justification |
| --- | --- |
| `activeTab` | Allows dogeclaw to interact with the active tab after the user opens the assistant or requests a browser action. |
| `scripting` | Loads the packaged assistant UI and page-action bridge into webpages. |
| `storage` | Stores local extension settings, model provider settings, UI state, optional channel settings, and local conversation state. |
| `alarms` | Schedules optional polling for the WeChat channel and related background tasks. |
| `tabs` | Lets the assistant list tabs, identify the current tab, open tabs, navigate, reload, and coordinate browser actions requested by the user. |
| `contextMenus` | Adds a right-click action so selected text can be sent to the assistant. |
| `<all_urls>` | Allows the in-page assistant to appear across webpages and lets user-requested page tools inspect or act on the current page. This is core to the browser-side assistant purpose. |

## Data practices draft

Use the Chrome Web Store privacy form to disclose the following data categories when applicable:

| Data category | Used by dogeclaw |
| --- | --- |
| Authentication information | User-provided model API keys and optional WeChat channel tokens are stored locally. |
| Website content | Selected text, page context, screenshots, images, and tool results may be sent to the configured model provider. |
| User activity | Browser action requests, tab state, conversation history, and channel workflow state are processed to provide assistant features. |
| Communications | Optional WeChat channel messages and replies are processed when the channel is enabled. |
| Location | Weather lookup sends the location string entered by the user to `wttr.in`. |

Recommended privacy form statements:

- Data is not sold.
- Data is not used for advertising.
- Data is used only to provide or improve the extension's user-facing functionality.
- Data is transmitted to third parties only when required by user-enabled features: the configured model provider, WeChat iLink/CDN, `wttr.in`, or source websites for user-selected images.
- The extension itself does not operate a hosted backend.

## Remote hosted code review

The extension package should include all executable JavaScript locally. The model provider returns text and structured tool-call arguments, not JavaScript to execute. The local code only executes predefined packaged tools.

Remote model provider URLs must use HTTPS, except localhost loopback endpoints used for local development.

Before submission, run:

```sh
rg -n "eval\\(|new Function|import\\(|importScripts|https?://.*\\.js" .
npm run check
npm run build:chrome
```

Expected result: `importScripts` should only reference packaged local files.

## Store listing copy

Short description:

```text
Browser-side AI assistant for in-page chat, tool calls, screenshots, and user-configured model providers.
```

Detailed description:

```text
dogeclaw brings a local-first AI assistant into the webpage you are using. Open the floating assistant, configure your own OpenAI-compatible model provider, and ask the assistant to summarize selected text, inspect page context, capture screenshots, or run user-requested browser tools such as click, type, scroll, navigation, tab coordination, and page snapshots.

The extension does not include a built-in API key. Your provider settings are stored in Chrome extension local storage on your device. Content you send to the assistant may be sent to the model provider you configure.

Optional features include a WeChat channel for message workflows and a weather lookup tool. These integrations are disabled unless configured or requested by the user.
```

## Required assets before submission

- Privacy policy URL: publish `PRIVACY.md` on the public repository or project site.
- Screenshots: prepare Chrome Web Store screenshots that show the floating assistant, chat panel, provider settings, and browser-tool workflow.
- Promotional image: prepare a store promo asset if needed for the listing.
- Support/contact URL: use the GitHub Issues page or a dedicated support page.
- Final ZIP: build `dist/chrome` and upload the packaged Chrome extension.

## Remaining review risk

`<all_urls>` is intentionally retained to avoid changing the core feature: dogeclaw appears on webpages and can work with arbitrary sites. If review feedback rejects this broad access, the next remediation should be a functional change: move to `optional_host_permissions` plus user-granted site access or inject only after user action with `activeTab`.
