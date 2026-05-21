---
name: current-page-search
description: Find and answer questions using the current tab or current page content.
metadata: {"dogeclaw":{"emoji":"🔎","requires":{"tools":["browser_control","curl"]}}}
---

# Current Page Search Skill

Use this skill when the user asks to find, locate, summarize, verify, or answer information from the current page, current tab, this document, this article, or an open documentation page.

Do not answer from memory for current-page questions. Use observed page content.

Follow this workflow:

1. Use `browser_control` with `action: "current_tab"` if the active tab or URL is unclear.
2. Use `browser_control` with `action: "snapshot"` to inspect the page title, URL, visible state, page text sample, and interactive elements.
3. Search `snapshot.text` for the user's exact query, close variants, translated terms, and likely section headings.
4. Treat `snapshot.text` as a sample. It may be truncated or dominated by navigation/sidebar text.
5. For documentation pages, ignore header, sidebar, footer, and navigation noise when possible. Prefer the main article heading and nearby paragraphs.
6. If the answer is not in the snapshot, scroll and snapshot again, but compare the new `scrollY` with the previous `scrollY`. If `scrollY` does not change, stop scrolling.
7. Do not repeat the same scroll/snapshot loop. If the text sample is unchanged or scrolling reaches the bottom, switch strategy.
8. On public HTTP or HTTPS documentation pages, use `curl` on the current page URL as a fallback when browser snapshots are insufficient. Search the returned HTML or text for the user's query and likely headings.
9. Do not use `screenshot` to read text unless image data is actually available to the model. A screenshot result without text or included image data is not evidence.
10. If the information is found, answer concisely and mention the matched heading or nearby phrase when useful.
11. If the information is still not found, say that the inspected page content did not contain it. Do not invent an answer.
