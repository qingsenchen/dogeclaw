# Roadmap

dogeclaw is moving toward a trustworthy browser-side agent: local-first, store-ready, useful on real webpages, and extensible through focused site tools.

This roadmap is intentionally outcome-based instead of date-based. Priorities may change as browser store review, user feedback, and provider compatibility evolve.

## Guiding Principles

- Keep the extension local-first and user-configured. Do not ship built-in provider keys.
- Make permissions understandable, reviewable, and tied to the in-page assistant purpose.
- Prefer reliable site-specific tools over fragile generic automation when a workflow deserves structure.
- Keep browser actions visible to the user and easier to audit.
- Support multiple model providers through OpenAI-compatible APIs without locking users into one vendor.

## 0. Store Readiness And Trust

Goal: make dogeclaw ready for public extension-store review and safer everyday use.

- Publish the privacy policy and keep Chrome Web Store privacy disclosures in sync.
- Prepare Chrome Web Store screenshots, promo assets, support URL, and final listing copy.
- Document permission justifications for `activeTab`, `scripting`, `storage`, `alarms`, `tabs`, `contextMenus`, and `<all_urls>`.
- Add a repeatable release checklist for syntax checks, secret scanning, packaged-script checks, and Chrome build packaging.
- Evaluate a future `optional_host_permissions` or user-granted site access mode if store review pushes back on `<all_urls>`.

## 1. Browser Agent Core

Goal: improve the day-to-day agent loop on real pages without making the UI heavier.

- Add clearer confirmations for high-impact browser actions such as navigation, form submission, credential-adjacent input, or provider configuration changes.
- Improve page snapshots so the model gets cleaner interactive-element context with less noise.
- Make screenshot and artifact handling more predictable across long pages, fixed headers, and dynamic layouts.
- Improve tool-result summaries so failed clicks, missing selectors, and blocked pages are easier to recover from.
- Add focused regression fixtures for common browser actions.

## 2. Site-Specific Tooling

Goal: turn dogeclaw from a generic page assistant into a practical browser-side tool platform.

- Define a lightweight pattern for site-specific tool modules.
- Add examples for professional workflows such as dashboards, back-office systems, ecommerce operations, and analytics tools.
- Let site tools expose structured actions that are easier for the model to call than raw visual or DOM inference.
- Document how contributors can add and test a site tool without touching the whole agent runtime.
- Explore a curated tool registry that can stay packaged with the extension and avoid remote code loading.

## 3. Model Provider Experience

Goal: make provider setup safer and smoother while preserving user choice.

- Add provider presets for common OpenAI-compatible gateways.
- Improve capability detection for image input, streaming, tool calls, and provider-specific model names.
- Make configuration errors more actionable in the chat UI.
- Keep API keys local and avoid logging prompts, page content, or credentials by default.
- Add migration handling for future config schema changes.

## 4. Channels And Collaboration

Goal: make external message channels useful without letting them blur the browser-agent boundary.

- Improve optional WeChat channel reliability, reconnect behavior, and media handling.
- Separate channel transport concerns from agent execution concerns more clearly.
- Add clearer user-facing state for channel configuration, polling, and failures.
- Explore additional channel adapters after the browser agent core is stable.
- Prepare future A2A collaboration with openclaw so dogeclaw can focus on page execution while other agents orchestrate broader workflows.

## 5. Cross-Browser And Release Quality

Goal: keep Chrome first while maintaining a path for Edge and Firefox.

- Keep browser APIs routed through `platform/extension-api.js`.
- Add CI checks for JavaScript syntax, build output, and packaged extension contents.
- Keep Chrome, Edge, and Firefox manifests aligned where possible.
- Document browser-specific limitations when behavior differs.
- Add a predictable versioning and changelog process before public releases.

## Not Planned

- Shipping a hosted backend as a required dependency.
- Bundling or hiding a shared model provider API key.
- Selling user data or adding advertising/tracking behavior.
- Executing arbitrary remote JavaScript returned by a model or external service.
- Replacing openclaw. dogeclaw should stay focused on browser-side page actions and site tools.

## Good First Contributions

- Store listing screenshots and copy improvements.
- Permission and privacy wording improvements.
- Provider preset additions.
- Browser action reliability fixes with manual test notes.
- Site-specific tool prototypes for real professional workflows.
- English, Simplified Chinese, and Japanese documentation updates.
