# Privacy Policy

Effective date: May 19, 2026

dogeclaw is a local-first browser extension. The project does not operate a hosted backend for the extension, does not sell user data, and does not include a built-in model API key. The extension runs in the user's browser and sends data only when needed to provide the features the user enables.

## Data processed by the extension

Depending on the features used, dogeclaw may process:

- Prompts and chat messages typed by the user.
- Selected text and page content that the user sends to the assistant.
- Page metadata, interactive element snapshots, browser action results, and screenshots used by browser-control tools.
- Image files or image URLs that the user drops into the assistant.
- The user's OpenAI-compatible provider Base URL, model name, API key, and system prompt.
- Optional WeChat channel settings, QR login state, channel token, incoming messages, outgoing replies, and media handled by the WeChat channel.
- Weather locations entered by the user when using the weather tool.
- Local conversation and channel history required to keep the extension experience working.

dogeclaw does not intentionally collect financial information, health information, government identifiers, or children's data. Users should not send sensitive private content unless they understand the data practices of the provider or service they configure.

## Local storage

dogeclaw stores configuration and recent working state in Chrome extension local storage on the user's device. This can include model provider settings, API keys, optional WeChat channel credentials, floating button state, page conversation state, and channel history. The project does not receive this local storage data unless the user separately shares it.

Users can remove stored data by removing the extension or clearing the extension's local storage from the browser.

## Data sent to third parties

dogeclaw may send data to the following services when the corresponding feature is used:

- The OpenAI-compatible model provider configured by the user. Requests can include prompts, selected text, page context, screenshots, images, tool results, and conversation history needed for the current assistant task.
- WeChat iLink and related WeChat CDN endpoints when the optional WeChat channel is configured and enabled.
- `wttr.in` when the weather tool is used. The weather request includes the location entered by the user.
- The source website of an image URL when the user asks dogeclaw to read or attach that image.

The extension defaults to HTTPS endpoints for network services and blocks remote non-HTTPS model provider URLs, except loopback localhost endpoints used for local development. Users are responsible for reviewing the privacy and retention policies of any model provider, gateway, WeChat service, weather service, or website they use with the extension.

## Permissions

dogeclaw requests browser permissions to provide its single purpose: an in-page browser AI assistant that can chat with the current page, call local browser tools, and optionally connect to a user-configured message channel.

- `activeTab`: interact with the active page after user action.
- `scripting`: load assistant scripts into webpages.
- `storage`: store local model, channel, and UI settings.
- `alarms`: schedule optional polling tasks.
- `tabs`: read and coordinate tab state for browser-control tools.
- `contextMenus`: add selected-text actions.
- `<all_urls>`: make the floating assistant and page tools available across webpages.

## Data sharing and sale

dogeclaw does not sell user data. The project does not share user data with advertising networks or data brokers. Data is sent to third-party services only to provide user-enabled features, as described above.

## Security

The repository does not include hard-coded API keys or tokens. Users should protect their provider keys and avoid entering secrets into untrusted webpages. If a key or token may have been exposed, revoke or rotate it with the relevant provider.

## Changes

This policy may be updated as the extension changes. Material changes should be reflected in this file and in the Chrome Web Store privacy disclosures before a new public release.

## Contact

For privacy questions, open an issue at:

https://github.com/qingsenchen/dogeclaw/issues
