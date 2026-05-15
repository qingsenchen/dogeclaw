# Contributing to dogeclaw

Thanks for your interest in contributing to dogeclaw. The project focuses on browser-side agents, site-specific tool calling, and collaboration with openclaw through future A2A integration.

## Ways to contribute

- Report bugs with clear reproduction steps, browser version, extension version, and relevant Service Worker console logs.
- Propose site-specific tools for professional websites such as finance, e-commerce, analytics, or operational platforms.
- Improve browser-control reliability, WeChat channel behavior, LLM provider compatibility, or i18n coverage.
- Improve documentation, demos, examples, and onboarding materials.

## Development workflow

1. Fork the repository.
2. Create a feature branch from `main`.
3. Load the extension locally from `chrome://extensions/` using Load unpacked.
4. Make your changes.
5. Reload the extension and refresh the target page.
6. Run the checks below.
7. Open a pull request with a clear description and testing notes.

## Checks

Run JavaScript syntax checks before opening a pull request:

```sh
node --check background.js
node --check channels/wechat.js
node --check content.js
node --check i18n.js
node --check llm.js
node --check tools.js
```

Run a basic secret scan before publishing or opening a pull request:

```sh
rg -n "apiKey|secret|token|password|Authorization|Bearer|sk-" .
```

Matches that are runtime code paths are acceptable, but hard-coded credentials are not.

## Pull request guidelines

- Keep pull requests focused. Separate unrelated refactors from feature work.
- Explain the user-facing behavior change.
- Include manual testing steps and affected browsers/pages.
- Add or update i18n strings for English, Simplified Chinese, and Japanese when changing user-visible text.
- Avoid committing generated packages, local credentials, logs, `.env` files, or browser extension archives.

## i18n guidelines

User-visible extension text should go through `i18n.js` or Chrome `_locales` messages.

- Runtime UI text belongs in `i18n.js`.
- Manifest-level text belongs in `_locales/*/messages.json`.
- Keep English, Simplified Chinese, and Japanese entries in sync.

## Debugging

During development, inspect the extension Service Worker console for logs. Do not persist debug logs to `chrome.storage.local` unless there is a deliberate product need and privacy review.

LLM debug logging may include prompts, page content, and model responses. Do not enable or commit verbose debug settings for release builds unless the project explicitly agrees to it.

## Security

Never commit API keys, tokens, private keys, cookies, account IDs that identify a private deployment, or private screenshots. If a credential is accidentally committed, rotate it immediately and remove it from history before publishing.

## Relationship with openclaw

dogeclaw is not intended to replace openclaw. Contributions should preserve the complementary direction: openclaw can orchestrate broader agent workflows, while dogeclaw focuses on browser-side, site-specific capabilities and future A2A collaboration.
