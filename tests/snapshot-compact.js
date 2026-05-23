#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_BASE = "tests/snapshot-compact-output";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const DEFAULT_MAX_INTERACTIONS = 120;
const DEFAULT_MAX_TEXT_CHARS = 3000;

function usage() {
  return [
    "Usage: node tests/snapshot-compact.js <url> [options]",
    "",
    "Options:",
    `  --out-base <path>          Output prefix. Default: ${DEFAULT_BASE}`,
    "  --scope <name>            viewport or all. Default: viewport",
    "  --viewport <WxH>          Browser viewport. Default: 1280x900",
    "  --scroll-x <n>            Scroll document x before snapshot",
    "  --scroll-y <n>            Scroll document y before snapshot",
    "  --wait-ms <n>             Extra wait after page load. Default: 0",
    "  --timeout-ms <n>          Navigation/DevTools timeout. Default: 15000",
    "  --max-interactions <n>    Max interaction refs in compact text. Default: 120",
    "  --max-text-chars <n>      Visible text budget. Whole chunks are omitted instead of truncated. Default: 3000",
    "  --include-unchanged       Include unchanged fixed/sticky region interactions in compact text",
    "  --chrome <path>           Chrome/Chromium executable path",
    "  --port <n>                Remote debugging port. Default: auto",
    "  --no-headless             Show browser window",
    "  --keep-open               Leave browser running after snapshot",
    "  -h, --help                Show this help",
    "",
    "Outputs:",
    "  <out-base>.json       Full structured snapshot",
    "  <out-base>.txt        Compact text intended for agent context",
    "  <out-base>.diff.txt   Human-readable diff from previous JSON output",
    "  <out-base>.refs.json  ref -> raw element/region map"
  ].join("\n");
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseFiniteNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number`);
  }
  return parsed;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value || "").trim());
  if (!match) {
    throw new Error("--viewport must use WxH, for example 1280x900");
  }
  return {
    width: parsePositiveInteger(match[1], "viewport width"),
    height: parsePositiveInteger(match[2], "viewport height")
  };
}

function parseScope(value) {
  const scope = String(value || "").trim().toLowerCase();
  if (!["viewport", "all"].includes(scope)) {
    throw new Error("--scope must be viewport or all");
  }
  return scope;
}

function parseArgs(argv) {
  const options = {
    chromePath: process.env.CHROME_PATH || "",
    headless: true,
    includeUnchanged: false,
    keepOpen: false,
    maxInteractions: DEFAULT_MAX_INTERACTIONS,
    maxTextChars: DEFAULT_MAX_TEXT_CHARS,
    outBase: DEFAULT_BASE,
    port: 0,
    scope: "viewport",
    scrollX: null,
    scrollY: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: "",
    viewport: DEFAULT_VIEWPORT,
    waitMs: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--include-unchanged") {
      options.includeUnchanged = true;
      continue;
    }
    if (arg === "--no-headless") {
      options.headless = false;
      continue;
    }
    if (arg === "--keep-open") {
      options.keepOpen = true;
      continue;
    }
    if (arg === "--out-base") {
      options.outBase = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--scope") {
      options.scope = parseScope(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--viewport") {
      options.viewport = parseViewport(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--scroll-x") {
      options.scrollX = parseFiniteNumber(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--scroll-y") {
      options.scrollY = parseFiniteNumber(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--wait-ms") {
      const waitMs = parseFiniteNumber(readValue(argv, index, arg), arg);
      if (waitMs < 0) {
        throw new Error("--wait-ms must be non-negative");
      }
      options.waitMs = waitMs;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--max-interactions") {
      options.maxInteractions = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--max-text-chars") {
      options.maxTextChars = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--chrome") {
      options.chromePath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.url) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.url = arg;
  }

  return options;
}

function normalizeUrl(input) {
  const url = String(input || "").trim();
  if (!url) {
    throw new Error("A URL argument is required");
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(url)) {
    return `http://${url}`;
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(url) || /^(about|data|file):/i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

function findChromeExecutable(explicitPath = "") {
  const candidates = [
    explicitPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "msedge"
  ].filter(Boolean);

  const firstExisting = candidates.find((candidate) => candidate.includes("/") && existsSync(candidate));
  return firstExisting || candidates.find((candidate) => !candidate.includes("/")) || "";
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`);
}

async function createTarget(endpoint) {
  const response = await fetch(`${endpoint}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT"
  });
  if (!response.ok) {
    throw new Error(`Failed to create DevTools target: ${response.status} ${response.statusText}`);
  }
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) {
    throw new Error("DevTools target did not include a webSocketDebuggerUrl");
  }
  return target;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.id = 0;
    this.listeners = new Map();
    this.pending = new Map();
    this.ws = new WebSocket(webSocketUrl);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.handleMessage(event));
    this.ws.addEventListener("close", () => this.rejectPending(new Error("DevTools socket closed")));
  }

  async open() {
    await this.opened;
  }

  close() {
    this.ws.close();
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || new Set();
    callbacks.add(callback);
    this.listeners.set(method, callbacks);
    return () => callbacks.delete(callback);
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    const callbacks = this.listeners.get(message.method);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(message.params || {});
      }
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  send(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { method, reject, resolve, timer });
    });
  }
}

function formatRuntimeException(details = {}) {
  const exception = details.exception || {};
  return exception.description || exception.value || details.text || "Runtime.evaluate failed";
}

async function evaluateValue(client, expression, timeoutMs) {
  const response = await client.send(
    "Runtime.evaluate",
    {
      awaitPromise: true,
      expression,
      returnByValue: true
    },
    timeoutMs
  );
  if (response.exceptionDetails) {
    throw new Error(formatRuntimeException(response.exceptionDetails));
  }
  return response.result?.value;
}

async function waitForPageLoad(client, url, timeoutMs) {
  let loadEventFired = false;
  const offLoad = client.on("Page.loadEventFired", () => {
    loadEventFired = true;
  });

  const navigation = await client.send("Page.navigate", { url }, timeoutMs);
  if (navigation.errorText) {
    offLoad();
    throw new Error(`Navigation failed: ${navigation.errorText}`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (loadEventFired) {
      offLoad();
      return;
    }
    const readyState = await evaluateValue(client, "document.readyState", timeoutMs).catch(() => "");
    if (readyState === "complete") {
      offLoad();
      return;
    }
    await sleep(100);
  }

  offLoad();
  throw new Error(`Timed out waiting for page load: ${url}`);
}

async function scrollPage(client, { scrollX, scrollY, timeoutMs }) {
  if (scrollX === null && scrollY === null) {
    return;
  }
  await evaluateValue(
    client,
    `JSON.stringify((() => {
      window.scrollTo({
        left: ${JSON.stringify(scrollX === null ? 0 : scrollX)},
        top: ${JSON.stringify(scrollY === null ? 0 : scrollY)},
        behavior: "instant"
      });
      return { scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY) };
    })())`,
    timeoutMs
  );
}

function compactSnapshotExpression(options) {
  return `JSON.stringify((() => {
    const options = ${JSON.stringify(options)};
    const scope = options.scope || "viewport";
    const maxInteractions = Number(options.maxInteractions || 120);
    const maxTextChars = Number(options.maxTextChars || 3000);

    function normalizeText(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }

    function isElementNode(node) {
      return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
    }

    function isHtmlElement(node) {
      return isElementNode(node) && typeof node.tagName === "string";
    }

    function shortUrl(value) {
      try {
        const url = new URL(value, location.href);
        if (url.origin === location.origin) {
          return url.pathname + url.search + url.hash;
        }
        return url.href;
      } catch {
        return String(value || "");
      }
    }

    function rectObject(rect) {
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    function docRectObject(rect) {
      return {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    function intersectsViewport(rect) {
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0 &&
        (scope !== "viewport" || intersectsViewport(rect))
      );
    }

    function roleFor(element) {
      const explicitRole = element.getAttribute("role");
      if (explicitRole) return explicitRole;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") return element.type || "input";
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (tag === "nav") return "navigation";
      if (tag === "aside") return "complementary";
      if (tag === "main") return "main";
      if (tag === "header") return "banner";
      if (tag === "footer") return "contentinfo";
      if (/^h[1-6]$/.test(tag)) return "heading";
      if (element.isContentEditable) return "editable";
      return tag;
    }

    function labelledByName(element) {
      return String(element.getAttribute("aria-labelledby") || "")
        .split(/\\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .map((node) => normalizeText(node?.innerText || node?.textContent || ""))
        .filter(Boolean)
        .join(" ");
    }

    function elementOwnName(element) {
      const ariaLabel = element.getAttribute("aria-label") || "";
      const labelledBy = labelledByName(element);
      const title = element.getAttribute("title") || "";
      const alt = element.getAttribute("alt") || "";
      const placeholder = element.getAttribute("placeholder") || "";
      const value = ["button", "submit", "reset"].includes(element.type) ? element.value || "" : "";
      return normalizeText(ariaLabel || labelledBy || title || alt || placeholder || value);
    }

    function elementName(element) {
      const tag = element.tagName.toLowerCase();
      const ownName = elementOwnName(element);
      const text = tag === "input" ? "" : element.innerText || element.textContent || "";
      return ownName || normalizeText(text);
    }

    function elementKey(item) {
      return [
        item.role,
        item.tag,
        item.name,
        item.href || "",
        item.regionStableKey || ""
      ].join("|");
    }

    function hash(value) {
      let h = 2166136261;
      const text = String(value || "");
      for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16);
    }

    function isScrollable(element) {
      const style = window.getComputedStyle(element);
      return (
        /(auto|scroll|overlay)/.test(style.overflowY + style.overflowX) &&
        (element.scrollHeight > element.clientHeight + 8 || element.scrollWidth > element.clientWidth + 8)
      );
    }

    function isRegionElement(element) {
      const tag = element.tagName.toLowerCase();
      const style = window.getComputedStyle(element);
      return (
        isScrollable(element) ||
        ["fixed", "sticky"].includes(style.position) ||
        ["nav", "aside", "main", "header", "footer", "form", "section"].includes(tag) ||
        Boolean(element.getAttribute("role") && !["button", "link"].includes(element.getAttribute("role")))
      );
    }

    function regionLabel(element) {
      const tag = element.tagName.toLowerCase();
      const role = roleFor(element);
      const ownName = elementOwnName(element);
      const heading = element.querySelector("h1,h2,h3,h4,h5,h6");
      const name = ownName || (heading && heading !== element ? elementName(heading) : "");
      return name || role || tag;
    }

    const regionElements = Array.from(document.querySelectorAll("nav,aside,main,header,footer,form,section,[role]"))
      .filter((element) => isHtmlElement(element) && isVisible(element) && isRegionElement(element));
    const regionByElement = new Map();
    const regions = [];
    let regionCounter = 0;

    function addRegion(element, fallbackKind = "") {
      if (!element || regionByElement.has(element)) {
        return regionByElement.get(element) || null;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const ref = "r" + (++regionCounter);
      const kind = fallbackKind || element.tagName.toLowerCase();
      const region = {
        ref,
        stableKey: [kind, roleFor(element), regionLabel(element), Math.round(rect.left), Math.round(rect.top)].join("|"),
        kind,
        role: roleFor(element),
        label: regionLabel(element),
        position: style.position || "static",
        scrollable: isScrollable(element),
        scrollTop: Math.round(element.scrollTop || 0),
        scrollHeight: Math.round(element.scrollHeight || 0),
        clientHeight: Math.round(element.clientHeight || rect.height || 0),
        bounds: rectObject(rect),
        documentBounds: docRectObject(rect),
        itemCount: 0,
        contentHash: ""
      };
      regionByElement.set(element, region);
      regions.push(region);
      return region;
    }

    for (const element of regionElements) {
      addRegion(element);
    }

    function nearestRegion(element) {
      let node = element.parentElement;
      while (node && node !== document.body) {
        if (regionByElement.has(node)) {
          return regionByElement.get(node);
        }
        if (isHtmlElement(node) && isVisible(node) && isRegionElement(node)) {
          return addRegion(node);
        }
        node = node.parentElement;
      }
      return null;
    }

    const interactionSelector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const interactions = [];
    const refs = {};
    let interactionCounter = 0;

    for (const element of Array.from(document.querySelectorAll(interactionSelector))) {
      if (!isHtmlElement(element) || !isVisible(element)) {
        continue;
      }
      const region = nearestRegion(element);
      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const item = {
        ref: "b" + (++interactionCounter),
        tag,
        role: roleFor(element),
        name: elementName(element),
        href: tag === "a" ? shortUrl(element.href || element.getAttribute("href") || "") : "",
        value: element.value && element.type !== "password" ? String(element.value) : "",
        region: region?.ref || "",
        regionStableKey: region?.stableKey || "",
        bounds: rectObject(rect),
        documentBounds: docRectObject(rect)
      };
      item.stableKey = elementKey(item);
      item.contentHash = hash(JSON.stringify({
        role: item.role,
        name: item.name,
        href: item.href,
        value: item.value,
        region: item.regionStableKey
      }));
      interactions.push(item);
      refs[item.ref] = item;
      if (region) {
        region.itemCount += 1;
      }
    }

    for (const region of regions) {
      const children = interactions
        .filter((item) => item.region === region.ref)
        .map((item) => item.contentHash)
        .join("|");
      region.contentHash = hash([region.label, region.position, region.scrollTop, children].join("|"));
      refs[region.ref] = region;
    }

    const textSelector = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "li",
      "td",
      "th",
      "summary",
      "label",
      "blockquote",
      "figcaption"
    ].join(",");
    const textChunks = [];
    const seenText = new Set();
    for (const element of Array.from(document.querySelectorAll(textSelector))) {
      if (!isHtmlElement(element) || !isVisible(element)) {
        continue;
      }
      const text = normalizeText(element.innerText || element.textContent || "");
      if (!text || seenText.has(text)) {
        continue;
      }
      seenText.add(text);
      const region = nearestRegion(element);
      textChunks.push({
        region: region?.ref || "",
        tag: element.tagName.toLowerCase(),
        text,
        stableKey: [element.tagName.toLowerCase(), text, region?.stableKey || ""].join("|"),
        contentHash: hash(text)
      });
    }

    let textBudget = maxTextChars;
    const compactTextChunks = [];
    let omittedTextChunks = 0;
    for (const chunk of textChunks) {
      if (chunk.text.length > textBudget) {
        omittedTextChunks += 1;
        continue;
      }
      compactTextChunks.push(chunk);
      textBudget -= chunk.text.length + 1;
    }

    return {
      source: "compact_agent_snapshot",
      capturedAt: new Date().toISOString(),
      page: {
        title: document.title || "",
        url: location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY)
        },
        scope
      },
      stats: {
        regions: regions.length,
        interactions: interactions.length,
        visibleTextChunks: compactTextChunks.length,
        totalTextChunks: textChunks.length,
        omittedTextChunks,
        fullTextLength: (document.body?.innerText || "").length
      },
      regions,
      interactions: interactions.slice(0, maxInteractions),
      omittedInteractions: Math.max(0, interactions.length - maxInteractions),
      textChunks: compactTextChunks,
      refs
    };
  })())`;
}

function hashText(value) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function loadPreviousSnapshot(jsonPath) {
  if (!existsSync(jsonPath)) {
    return null;
  }
  try {
    const snapshot = JSON.parse(readFileSync(jsonPath, "utf8"));
    return snapshot?.source === "compact_agent_snapshot" ? snapshot : null;
  } catch {
    return null;
  }
}

function mapByStableKey(items = []) {
  return new Map(items.map((item) => [item.stableKey, item]));
}

function diffItems(previousItems = [], currentItems = []) {
  const previous = mapByStableKey(previousItems);
  const current = mapByStableKey(currentItems);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, item] of current) {
    const old = previous.get(key);
    if (!old) {
      added.push(item);
    } else if (old.contentHash !== item.contentHash) {
      changed.push(item);
    }
  }
  for (const [key, item] of previous) {
    if (!current.has(key)) {
      removed.push(item);
    }
  }
  return { added, changed, removed };
}

function buildDiff(previous, current) {
  if (!previous) {
    return {
      base: "none",
      regions: { added: current.regions, changed: [], removed: [] },
      interactions: { added: current.interactions, changed: [], removed: [] },
      text: { added: current.textChunks, changed: [], removed: [] }
    };
  }
  return {
    base: previous.capturedAt || "previous-output",
    regions: diffItems(previous.regions, current.regions),
    interactions: diffItems(previous.interactions, current.interactions),
    text: diffItems(previous.textChunks, current.textChunks)
  };
}

function quoteText(value) {
  return JSON.stringify(String(value || ""));
}

function regionLine(region, unchanged = false) {
  const scroll = region.scrollable
    ? ` scrollTop=${region.scrollTop}/${Math.max(region.scrollHeight - region.clientHeight, 0)}`
    : "";
  const state = unchanged ? " unchanged" : "";
  return `@${region.ref} ${region.kind} role=${region.role} ${quoteText(region.label)} pos=${region.position}${scroll} items=${region.itemCount}${state}`;
}

function interactionLine(item) {
  const href = item.href ? ` href=${item.href}` : "";
  const value = item.value ? ` value=${quoteText(item.value)}` : "";
  const region = item.region ? ` region=@${item.region}` : "";
  return `@${item.ref} ${item.role} ${quoteText(item.name)} tag=${item.tag}${href}${value}${region}`;
}

function buildCompactText(snapshot, diff, options) {
  const lines = [];
  const previousRegionKeys = new Set();
  if (diff.base !== "none") {
    const changedKeys = new Set([
      ...diff.regions.added.map((item) => item.stableKey),
      ...diff.regions.changed.map((item) => item.stableKey)
    ]);
    for (const region of snapshot.regions) {
      if (!changedKeys.has(region.stableKey)) {
        previousRegionKeys.add(region.stableKey);
      }
    }
  }

  const omittedRegions = snapshot.regions.filter((region) => (
    previousRegionKeys.has(region.stableKey) &&
    ["fixed", "sticky"].includes(region.position) &&
    !options.includeUnchanged
  ));
  const omittedRegionRefs = new Set(omittedRegions.map((region) => region.ref));

  lines.push(`Page ${quoteText(snapshot.page.title)}`);
  lines.push(`URL ${snapshot.page.url}`);
  lines.push(
    `Viewport ${snapshot.page.viewport.width}x${snapshot.page.viewport.height} ` +
      `scroll=(${snapshot.page.viewport.scrollX},${snapshot.page.viewport.scrollY}) scope=${snapshot.page.scope}`
  );
  lines.push(
    `Stats regions=${snapshot.stats.regions} interactions=${snapshot.stats.interactions}` +
      ` textChunks=${snapshot.stats.visibleTextChunks}/${snapshot.stats.totalTextChunks}` +
      ` omittedTextChunks=${snapshot.stats.omittedTextChunks} fullTextLength=${snapshot.stats.fullTextLength}`
  );
  lines.push("");
  lines.push("Regions:");
  for (const region of snapshot.regions) {
    if (omittedRegionRefs.has(region.ref)) {
      lines.push(regionLine(region, true));
      continue;
    }
    lines.push(regionLine(region));
  }

  lines.push("");
  lines.push("Interactions:");
  const visibleInteractions = snapshot.interactions.filter((item) => !omittedRegionRefs.has(item.region));
  for (const item of visibleInteractions) {
    lines.push(interactionLine(item));
  }
  if (snapshot.omittedInteractions > 0) {
    lines.push(`... ${snapshot.omittedInteractions} more interactions omitted by --max-interactions`);
  }

  lines.push("");
  lines.push("Visible Text:");
  for (const chunk of snapshot.textChunks) {
    if (omittedRegionRefs.has(chunk.region)) {
      continue;
    }
    const prefix = chunk.region ? `@${chunk.region} ` : "";
    lines.push(`${prefix}${chunk.tag}: ${chunk.text}`);
  }
  if (snapshot.stats.omittedTextChunks > 0) {
    lines.push(`... ${snapshot.stats.omittedTextChunks} more text chunks omitted by --max-text-chars`);
  }

  lines.push("");
  lines.push("Diff:");
  lines.push(
    `base=${diff.base} regions +${diff.regions.added.length}/~${diff.regions.changed.length}/-${diff.regions.removed.length}` +
      ` interactions +${diff.interactions.added.length}/~${diff.interactions.changed.length}/-${diff.interactions.removed.length}` +
      ` text +${diff.text.added.length}/~${diff.text.changed.length}/-${diff.text.removed.length}`
  );

  return `${lines.join("\n")}\n`;
}

function buildDiffText(diff) {
  const lines = [];
  lines.push(`base=${diff.base}`);
  lines.push(`regions added=${diff.regions.added.length} changed=${diff.regions.changed.length} removed=${diff.regions.removed.length}`);
  for (const item of diff.regions.added.slice(0, 30)) lines.push(`+ region @${item.ref} ${item.label}`);
  for (const item of diff.regions.changed.slice(0, 30)) lines.push(`~ region @${item.ref} ${item.label}`);
  for (const item of diff.regions.removed.slice(0, 30)) lines.push(`- region ${item.label}`);
  lines.push(`interactions added=${diff.interactions.added.length} changed=${diff.interactions.changed.length} removed=${diff.interactions.removed.length}`);
  for (const item of diff.interactions.added.slice(0, 50)) lines.push(`+ ${interactionLine(item)}`);
  for (const item of diff.interactions.changed.slice(0, 50)) lines.push(`~ ${interactionLine(item)}`);
  for (const item of diff.interactions.removed.slice(0, 50)) lines.push(`- ${item.role} ${quoteText(item.name)}`);
  lines.push(`text added=${diff.text.added.length} changed=${diff.text.changed.length} removed=${diff.text.removed.length}`);
  for (const item of diff.text.added.slice(0, 30)) lines.push(`+ text ${item.tag}: ${item.text}`);
  for (const item of diff.text.removed.slice(0, 30)) lines.push(`- text ${item.tag}: ${item.text}`);
  return `${lines.join("\n")}\n`;
}

async function captureCompactSnapshot(client, options) {
  const json = await evaluateValue(client, compactSnapshotExpression(options), options.timeoutMs);
  const snapshot = JSON.parse(json);
  snapshot.integrity = {
    refsHash: hashText(JSON.stringify(snapshot.refs)),
    compactInput: {
      maxInteractions: options.maxInteractions,
      maxTextChars: options.maxTextChars,
      scope: options.scope
    }
  };
  return snapshot;
}

function launchChrome({ chromePath, headless, port, viewport }) {
  const userDataDir = mkdtempSync(`${tmpdir()}/dogeclaw-compact-`);
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-popup-blocking",
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ];

  if (headless) {
    args.unshift("--headless=new", "--disable-gpu");
  }

  const proc = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let launchError = null;
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  proc.on("error", (error) => {
    launchError = error;
  });
  return { launchError: () => launchError, proc, stderr: () => stderr.trim(), userDataDir };
}

async function cleanup({ chrome, client, keepOpen }) {
  client?.close();
  if (!chrome || keepOpen) {
    return;
  }
  chrome.proc.kill("SIGTERM");
  await sleep(250);
  try {
    rmSync(chrome.userDataDir, { force: true, recursive: true });
  } catch {}
}

function outputPaths(outBase) {
  const base = resolve(outBase);
  return {
    compact: `${base}.txt`,
    diff: `${base}.diff.txt`,
    json: `${base}.json`,
    refs: `${base}.refs.json`
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const url = normalizeUrl(options.url);
  const chromePath = findChromeExecutable(options.chromePath);
  if (!chromePath) {
    throw new Error("Chrome/Chromium executable not found. Pass --chrome <path> or set CHROME_PATH.");
  }

  const paths = outputPaths(options.outBase);
  const previous = loadPreviousSnapshot(paths.json);
  const port = options.port || (await getFreePort());
  const endpoint = `http://127.0.0.1:${port}`;
  const chrome = launchChrome({ ...options, chromePath, port });
  let client = null;

  try {
    await waitForJson(`${endpoint}/json/version`, options.timeoutMs);
    if (chrome.launchError()) {
      throw chrome.launchError();
    }
    const target = await createTarget(endpoint);
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Page.enable", {}, options.timeoutMs);
    await client.send("Runtime.enable", {}, options.timeoutMs);
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        deviceScaleFactor: 1,
        height: options.viewport.height,
        mobile: false,
        width: options.viewport.width
      },
      options.timeoutMs
    );

    await waitForPageLoad(client, url, options.timeoutMs);
    if (options.waitMs > 0) {
      await sleep(options.waitMs);
    }
    await scrollPage(client, options);
    if (options.scrollX !== null || options.scrollY !== null) {
      await sleep(100);
    }

    const snapshot = await captureCompactSnapshot(client, options);
    const diff = buildDiff(previous, snapshot);
    const compactText = buildCompactText(snapshot, diff, options);
    const diffText = buildDiffText(diff);

    for (const path of Object.values(paths)) {
      mkdirSync(dirname(path), { recursive: true });
    }
    writeFileSync(paths.json, `${JSON.stringify({ ...snapshot, diff }, null, 2)}\n`);
    writeFileSync(paths.refs, `${JSON.stringify(snapshot.refs, null, 2)}\n`);
    writeFileSync(paths.compact, compactText);
    writeFileSync(paths.diff, diffText);

    process.stdout.write(`${JSON.stringify({
      compact: paths.compact,
      diff: paths.diff,
      json: paths.json,
      refs: paths.refs,
      compactLines: compactText.trimEnd().split("\n").length,
      interactions: snapshot.stats.interactions,
      regions: snapshot.stats.regions,
      textChunks: snapshot.stats.visibleTextChunks,
      omittedTextChunks: snapshot.stats.omittedTextChunks
    }, null, 2)}\n`);
  } catch (error) {
    const chromeError = chrome.stderr();
    if (chromeError) {
      error.message = `${error.message}\n\nChrome stderr:\n${chromeError}`;
    }
    throw error;
  } finally {
    await cleanup({ chrome, client, keepOpen: options.keepOpen });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
