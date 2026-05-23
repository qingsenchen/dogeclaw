#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_ITEMS = 80;
const DEFAULT_OUTPUT_FILE = "tests/snapshot-output.json";
const DEFAULT_SNAPSHOT_SOURCE = "dogeclaw-raw";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

function usage() {
  return [
    "Usage: node tests/snapshot.js <url> [options]",
    "",
    "Options:",
    "  --max-items <n>     Limit interactive elements. dogeclaw default: 80; raw/agent only when provided",
    "  --source <name>     Snapshot source: dogeclaw-raw, dogeclaw, browser, agent, or both. Default: dogeclaw-raw",
    "  --timeout-ms <n>    Navigation/DevTools timeout. Default: 15000",
    "  --wait-ms <n>       Extra wait after page load before snapshot. Default: 0",
    "  --scroll-x <n>      Scroll to document x before snapshot. Default: current x",
    "  --scroll-y <n>      Scroll to document y before snapshot. Default: current y",
    "  --document-y-range <start:end>  dogeclaw-raw only: keep elements in this document y range",
    "  --document-y-contained          Require full element bounds inside --document-y-range",
    "  --viewport <WxH>    Browser viewport. Default: 1280x900",
    "  --viewport-only    dogeclaw-raw only: keep elements intersecting the current viewport",
    "  --chrome <path>     Chrome/Chromium executable path",
    `  --out <path>        Full snapshot JSON output path. Default: ${DEFAULT_OUTPUT_FILE}`,
    "  --port <n>          Remote debugging port. Default: auto",
    "  --no-headless       Show the browser window",
    "  --keep-open         Leave the browser running after snapshot",
    "  --pretty            Save pretty JSON. This is the default",
    "  --compact           Save compact JSON instead of pretty JSON",
    "  -h, --help          Show this help",
    "",
    "Example:",
    "  node tests/snapshot.js https://example.com --out /tmp/snapshot.json"
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

function parseNumberRange(value, name) {
  const match = /^(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/.exec(String(value || "").trim());
  if (!match) {
    throw new Error(`${name} must use start:end, for example 400:800`);
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error(`${name} must have finite numbers with end greater than start`);
  }
  return { end, start };
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value || "").trim());
  if (!match) {
    throw new Error("--viewport must use the WxH format, for example 1280x900");
  }
  return {
    width: parsePositiveInteger(match[1], "viewport width"),
    height: parsePositiveInteger(match[2], "viewport height")
  };
}

function parseSnapshotSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "raw") {
    return "dogeclaw-raw";
  }
  if (source === "semantic" || source === "modern") {
    return "agent";
  }
  if (!["browser", "dogeclaw", "dogeclaw-raw", "agent", "both"].includes(source)) {
    throw new Error("--source must be browser, dogeclaw, dogeclaw-raw, agent, or both");
  }
  return source;
}

function parseArgs(argv) {
  const options = {
    chromePath: process.env.CHROME_PATH || "",
    compact: false,
    documentYContained: false,
    documentYRange: null,
    headless: true,
    keepOpen: false,
    maxItems: DEFAULT_MAX_ITEMS,
    maxItemsProvided: false,
    outputPath: DEFAULT_OUTPUT_FILE,
    port: 0,
    scrollX: null,
    scrollY: null,
    source: DEFAULT_SNAPSHOT_SOURCE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: "",
    viewport: DEFAULT_VIEWPORT,
    viewportOnly: false,
    waitMs: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--compact") {
      options.compact = true;
      continue;
    }
    if (arg === "--pretty") {
      options.compact = false;
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
    if (arg === "--max-items") {
      options.maxItems = parsePositiveInteger(readValue(argv, index, arg), arg);
      options.maxItemsProvided = true;
      index += 1;
      continue;
    }
    if (arg === "--source") {
      options.source = parseSnapshotSource(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(readValue(argv, index, arg), arg);
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
    if (arg === "--document-y-range") {
      options.documentYRange = parseNumberRange(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--document-y-contained") {
      options.documentYContained = true;
      continue;
    }
    if (arg === "--wait-ms") {
      const waitMs = Number(readValue(argv, index, arg));
      if (!Number.isFinite(waitMs) || waitMs < 0) {
        throw new Error("--wait-ms must be a non-negative number");
      }
      options.waitMs = waitMs;
      index += 1;
      continue;
    }
    if (arg === "--viewport") {
      options.viewport = parseViewport(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--viewport-only") {
      options.viewportOnly = true;
      continue;
    }
    if (arg === "--chrome") {
      options.chromePath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.outputPath = readValue(argv, index, arg);
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

function truncateText(value, maxLength = 120) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function valueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function describeStructure(value, depth = 0) {
  if (Array.isArray(value)) {
    return value.length ? [describeStructure(value[0], depth + 1)] : [];
  }
  if (!value || typeof value !== "object") {
    return valueType(value);
  }
  if (depth >= 4) {
    return "object";
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, describeStructure(item, depth + 1)])
  );
}

function summarizeBrowserSnapshot(snapshot) {
  const page = snapshot.page || {};
  return {
    source: snapshot.source,
    title: truncateText(page.title),
    urlLength: String(page.url || "").length,
    textLength: String(page.text || "").length,
    outerHTMLLength: String(page.outerHTML || "").length,
    domSnapshotDocuments: Array.isArray(snapshot.domSnapshot?.documents) ? snapshot.domSnapshot.documents.length : 0,
    domSnapshotStrings: Array.isArray(snapshot.domSnapshot?.strings) ? snapshot.domSnapshot.strings.length : 0,
    accessibilityNodes: Array.isArray(snapshot.accessibilityTree?.nodes) ? snapshot.accessibilityTree.nodes.length : 0
  };
}

function summarizeDogeclawSnapshot(snapshot) {
  return {
    source: snapshot.source || "dogeclaw",
    ...(Object.prototype.hasOwnProperty.call(snapshot, "viewportOnly")
      ? { viewportOnly: Boolean(snapshot.viewportOnly) }
      : {}),
    title: truncateText(snapshot.title),
    urlLength: String(snapshot.url || "").length,
    textLength: String(snapshot.text || "").length,
    ...(Object.prototype.hasOwnProperty.call(snapshot, "fullTextLength")
      ? { fullTextLength: Number(snapshot.fullTextLength) || 0 }
      : {}),
    elementsCount: Array.isArray(snapshot.elements) ? snapshot.elements.length : 0
  };
}

function summarizeAgentSnapshot(snapshot) {
  const semanticNodes = snapshot.semanticTree?.nodes || [];
  const interactionNodes = snapshot.interactionGraph?.nodes || [];
  return {
    source: snapshot.source,
    title: truncateText(snapshot.page?.title),
    urlLength: String(snapshot.page?.url || "").length,
    rawDomNodes: snapshot.rawStats?.domNodes || 0,
    rawAxNodes: snapshot.rawStats?.accessibilityNodes || 0,
    rawSnapshotStrings: snapshot.rawStats?.domSnapshotStrings || 0,
    semanticNodes: semanticNodes.length,
    interactionNodes: interactionNodes.length,
    diff: snapshot.diff?.summary || null
  };
}

function buildConsoleSummary(snapshot, outputPath) {
  if (snapshot?.source === "browser_cdp") {
    return {
      savedTo: outputPath,
      ...summarizeBrowserSnapshot(snapshot),
      structure: describeStructure(snapshot)
    };
  }

  if (snapshot?.source === "combined") {
    return {
      savedTo: outputPath,
      source: snapshot.source,
      browser: summarizeBrowserSnapshot(snapshot.browser),
      dogeclaw: summarizeDogeclawSnapshot(snapshot.dogeclaw),
      structure: describeStructure(snapshot)
    };
  }

  if (snapshot?.source === "browser_agent_semantic") {
    return {
      savedTo: outputPath,
      ...summarizeAgentSnapshot(snapshot),
      structure: describeStructure(snapshot)
    };
  }

  return {
    savedTo: outputPath,
    ...summarizeDogeclawSnapshot(snapshot),
    structure: describeStructure(snapshot)
  };
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
      return {
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
      };
    })())`,
    timeoutMs
  );
}

async function captureBrowserSnapshot(client, timeoutMs) {
  const pageJson = await evaluateValue(
    client,
    `JSON.stringify({
      title: document.title || "",
      url: location.href,
      readyState: document.readyState,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
      },
      text: document.body?.innerText || "",
      outerHTML: document.documentElement?.outerHTML || ""
    })`,
    timeoutMs
  );
  const [domSnapshot, accessibilityTree] = await Promise.all([
    client.send(
      "DOMSnapshot.captureSnapshot",
      {
        computedStyles: [],
        includeDOMRects: true,
        includePaintOrder: true
      },
      timeoutMs
    ),
    client.send("Accessibility.getFullAXTree", {}, timeoutMs).catch((error) => ({
      error: error.message
    }))
  ]);

  return {
    source: "browser_cdp",
    capturedAt: new Date().toISOString(),
    page: JSON.parse(pageJson),
    domSnapshot,
    accessibilityTree
  };
}

function hashText(value) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function attributesToObject(attributes = []) {
  const result = {};
  for (let index = 0; index < attributes.length; index += 2) {
    result[attributes[index]] = attributes[index + 1] || "";
  }
  return result;
}

function pickAttributes(attrs = {}) {
  const keys = [
    "id",
    "name",
    "type",
    "href",
    "placeholder",
    "aria-label",
    "title",
    "alt",
    "value",
    "role",
    "contenteditable",
    "tabindex"
  ];
  return Object.fromEntries(keys.filter((key) => attrs[key]).map((key) => [key, attrs[key]]));
}

function cdpValue(field) {
  if (!field || typeof field !== "object") {
    return "";
  }
  return field.value === undefined || field.value === null ? "" : String(field.value);
}

function countDomNodes(node) {
  return 1 + (node.children || []).reduce((count, child) => count + countDomNodes(child), 0);
}

function flattenDomTree(root) {
  const records = [];
  const byPath = new Map();
  const byBackend = new Map();

  function walk(node, parentPath = "", path = "0", depth = 0) {
    const attrs = attributesToObject(node.attributes || []);
    const tag = String(node.localName || node.nodeName || "").toLowerCase();
    const record = {
      attrs,
      backendDOMNodeId: node.backendNodeId || 0,
      depth,
      node,
      nodeId: node.nodeId || 0,
      nodeName: node.nodeName || "",
      nodeType: node.nodeType,
      parentPath,
      path,
      tag
    };
    records.push(record);
    byPath.set(path, record);
    if (record.backendDOMNodeId) {
      byBackend.set(record.backendDOMNodeId, record);
    }
    (node.children || []).forEach((child, index) => walk(child, path, `${path}.${index}`, depth + 1));
  }

  walk(root);
  return { records, byPath, byBackend };
}

function buildAxByBackend(accessibilityTree = {}) {
  const byBackend = new Map();
  for (const node of accessibilityTree.nodes || []) {
    const backendId = node.backendDOMNodeId || 0;
    if (!backendId) {
      continue;
    }
    const previous = byBackend.get(backendId);
    if (!previous || previous.ignored || (!node.ignored && cdpValue(node.name))) {
      byBackend.set(backendId, node);
    }
  }
  return byBackend;
}

function buildLayoutByBackend(domSnapshot = {}) {
  const document = domSnapshot.documents?.[0];
  const layout = document?.layout || {};
  const backends = document?.nodes?.backendNodeId || [];
  const byBackend = new Map();
  for (let index = 0; index < (layout.nodeIndex || []).length; index += 1) {
    const nodeIndex = layout.nodeIndex[index];
    const backendId = backends[nodeIndex];
    if (!backendId) {
      continue;
    }
    byBackend.set(backendId, {
      bounds: layout.bounds?.[index] || null,
      paintOrder: layout.paintOrders?.[index] || 0
    });
  }
  return byBackend;
}

function createDomTextReader(records) {
  const byPath = new Map(records.map((record) => [record.path, record]));
  const cache = new Map();

  function read(record) {
    if (!record) {
      return "";
    }
    if (cache.has(record.path)) {
      return cache.get(record.path);
    }

    let text = "";
    if (record.nodeType === 3) {
      text = record.node.nodeValue || "";
    } else {
      text = (record.node.children || [])
        .map((child, index) => read(byPath.get(`${record.path}.${index}`)))
        .filter(Boolean)
        .join(" ");
    }
    text = normalizeWhitespace(text);
    cache.set(record.path, text);
    return text;
  }

  return read;
}

function readDirectText(record) {
  return normalizeWhitespace(
    (record.node.children || [])
      .filter((child) => child.nodeType === 3)
      .map((child) => child.nodeValue || "")
      .join(" ")
  );
}

function implicitRole(tag, attrs = {}) {
  if (attrs.role) return attrs.role;
  if (tag === "a" && attrs.href) return "link";
  if (tag === "button") return "button";
  if (tag === "input") return attrs.type || "input";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "header") return "banner";
  if (tag === "footer") return "contentinfo";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "img") return "img";
  return "";
}

function accessibleName(record, axNode, text) {
  const attrs = record.attrs;
  return normalizeWhitespace(
    cdpValue(axNode?.name) ||
      attrs["aria-label"] ||
      attrs.title ||
      attrs.alt ||
      attrs.placeholder ||
      attrs.value ||
      readDirectText(record) ||
      text
  );
}

const SEMANTIC_TAGS = new Set([
  "a",
  "article",
  "aside",
  "button",
  "caption",
  "details",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "iframe",
  "img",
  "input",
  "label",
  "legend",
  "li",
  "main",
  "nav",
  "option",
  "p",
  "section",
  "select",
  "summary",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "ol"
]);

const SKIP_TAGS = new Set(["script", "style", "template", "noscript", "meta", "link", "head", "title", "path"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox"
]);

function isInteractiveSemantic(record, role) {
  const tag = record.tag;
  const attrs = record.attrs;
  return (
    ["a", "button", "input", "textarea", "select", "summary"].includes(tag) ||
    INTERACTIVE_ROLES.has(role) ||
    attrs.contenteditable === "true" ||
    (attrs.tabindex && attrs.tabindex !== "-1")
  );
}

function interactionAction(record, role) {
  const tag = record.tag;
  const type = String(record.attrs.type || "").toLowerCase();
  if (tag === "select" || role === "combobox") return "select";
  if (tag === "textarea" || role === "textbox" || role === "searchbox") return "type";
  if (tag === "input" && ["checkbox", "radio"].includes(type)) return "toggle";
  if (tag === "input" && !["button", "submit", "reset"].includes(type)) return "type";
  if (tag === "a" || role === "link") return "navigate";
  return "click";
}

function trimSemanticText(text, maxLength = 500) {
  const value = normalizeWhitespace(text);
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function buildAgentSemantic({ accessibilityTree, domSnapshot, domTree, maxItems, maxItemsProvided, page }) {
  const { records, byPath } = flattenDomTree(domTree.root);
  const axByBackend = buildAxByBackend(accessibilityTree);
  const layoutByBackend = buildLayoutByBackend(domSnapshot);
  const readText = createDomTextReader(records);
  const semanticNodes = [
    {
      id: "page",
      kind: "page",
      role: "document",
      name: page.title || "",
      text: trimSemanticText(page.text || "", 700),
      children: []
    }
  ];
  const semanticByPath = new Map([["0", semanticNodes[0]]]);
  const interactionNodes = [];
  const interactionEdges = [];
  const semanticLimit = maxItemsProvided ? Math.max(maxItems * 10, maxItems) : 1200;
  const interactionLimit = maxItemsProvided ? maxItems : 300;

  for (const record of records) {
    if (record.nodeType !== 1 || !record.tag || SKIP_TAGS.has(record.tag)) {
      continue;
    }

    const axNode = axByBackend.get(record.backendDOMNodeId);
    const role = cdpValue(axNode?.role) || implicitRole(record.tag, record.attrs);
    const rawText = readText(record);
    const name = accessibleName(record, axNode, rawText);
    const isInteractive = isInteractiveSemantic(record, role);
    const hasUsefulText = rawText && (SEMANTIC_TAGS.has(record.tag) || Boolean(readDirectText(record)));
    const isLandmark = Boolean(role && !["generic", "none", "presentation"].includes(role));
    if (!isInteractive && !SEMANTIC_TAGS.has(record.tag) && !hasUsefulText && !isLandmark) {
      continue;
    }
    if (semanticNodes.length >= semanticLimit) {
      break;
    }

    let parentRecord = byPath.get(record.parentPath);
    let parentId = "page";
    while (parentRecord) {
      const semanticParent = semanticByPath.get(parentRecord.path);
      if (semanticParent) {
        parentId = semanticParent.id;
        break;
      }
      parentRecord = byPath.get(parentRecord.parentPath);
    }

    const layout = layoutByBackend.get(record.backendDOMNodeId) || {};
    const stableKey = [
      record.path,
      record.tag,
      role,
      record.attrs.id || "",
      record.attrs.name || "",
      record.attrs.type || ""
    ].join("|");
    const id = `s_${hashText(stableKey)}`;
    const node = {
      id,
      parentId,
      backendDOMNodeId: record.backendDOMNodeId || null,
      nodeId: record.nodeId || null,
      path: record.path,
      tag: record.tag,
      role: role || "",
      name: trimSemanticText(name, 240),
      text: trimSemanticText(rawText, 500),
      attrs: pickAttributes(record.attrs),
      bounds: layout.bounds || null,
      interactive: isInteractive,
      children: []
    };
    node.contentHash = hashText(JSON.stringify({
      attrs: node.attrs,
      bounds: node.bounds,
      name: node.name,
      role: node.role,
      tag: node.tag,
      text: node.text
    }));

    semanticNodes.push(node);
    semanticByPath.set(record.path, node);
    const parentNode = semanticNodes.find((item) => item.id === parentId);
    parentNode?.children?.push(id);

    if (isInteractive && interactionNodes.length < interactionLimit) {
      const ref = `i${interactionNodes.length + 1}`;
      const previous = interactionNodes[interactionNodes.length - 1];
      const interaction = {
        ref,
        nodeId: id,
        backendDOMNodeId: node.backendDOMNodeId,
        action: interactionAction(record, role),
        tag: node.tag,
        role: node.role,
        name: node.name,
        text: node.text,
        href: record.attrs.href || "",
        value: record.attrs.type === "password" ? "" : record.attrs.value || "",
        bounds: node.bounds,
        contentHash: node.contentHash
      };
      interactionNodes.push(interaction);
      if (previous) {
        interactionEdges.push({ from: previous.ref, to: ref, type: "next-interaction" });
      }
      interactionEdges.push({ from: parentId, to: ref, type: "contained-by-semantic-node" });
    }
  }

  return {
    semanticTree: {
      nodes: semanticNodes,
      rootId: "page"
    },
    interactionGraph: {
      nodes: interactionNodes,
      edges: interactionEdges
    },
    rawStats: {
      domNodes: countDomNodes(domTree.root),
      accessibilityNodes: Array.isArray(accessibilityTree.nodes) ? accessibilityTree.nodes.length : 0,
      domSnapshotDocuments: Array.isArray(domSnapshot.documents) ? domSnapshot.documents.length : 0,
      domSnapshotStrings: Array.isArray(domSnapshot.strings) ? domSnapshot.strings.length : 0
    }
  };
}

function mapById(items = []) {
  return new Map(items.map((item) => [item.id || item.nodeId || item.ref, item]));
}

function buildAgentDiff(previous, current) {
  if (!previous || previous.source !== "browser_agent_semantic") {
    return {
      base: "none",
      summary: {
        semanticAdded: current.semanticTree.nodes.length,
        semanticRemoved: 0,
        semanticChanged: 0,
        interactionsAdded: current.interactionGraph.nodes.length,
        interactionsRemoved: 0,
        interactionsChanged: 0
      },
      semantic: { added: current.semanticTree.nodes.map((node) => node.id), removed: [], changed: [] },
      interactions: { added: current.interactionGraph.nodes.map((node) => node.nodeId), removed: [], changed: [] }
    };
  }

  const previousSemantic = mapById(previous.semanticTree?.nodes || []);
  const currentSemantic = mapById(current.semanticTree?.nodes || []);
  const previousInteractions = mapById((previous.interactionGraph?.nodes || []).map((node) => ({ ...node, id: node.nodeId })));
  const currentInteractions = mapById((current.interactionGraph?.nodes || []).map((node) => ({ ...node, id: node.nodeId })));

  const semanticAdded = [];
  const semanticRemoved = [];
  const semanticChanged = [];
  const interactionsAdded = [];
  const interactionsRemoved = [];
  const interactionsChanged = [];

  for (const [id, node] of currentSemantic) {
    const oldNode = previousSemantic.get(id);
    if (!oldNode) {
      semanticAdded.push(id);
    } else if (oldNode.contentHash !== node.contentHash) {
      semanticChanged.push(id);
    }
  }
  for (const id of previousSemantic.keys()) {
    if (!currentSemantic.has(id)) {
      semanticRemoved.push(id);
    }
  }

  for (const [id, node] of currentInteractions) {
    const oldNode = previousInteractions.get(id);
    if (!oldNode) {
      interactionsAdded.push(id);
    } else if (oldNode.contentHash !== node.contentHash) {
      interactionsChanged.push(id);
    }
  }
  for (const id of previousInteractions.keys()) {
    if (!currentInteractions.has(id)) {
      interactionsRemoved.push(id);
    }
  }

  return {
    base: previous.capturedAt || "previous-output",
    summary: {
      semanticAdded: semanticAdded.length,
      semanticRemoved: semanticRemoved.length,
      semanticChanged: semanticChanged.length,
      interactionsAdded: interactionsAdded.length,
      interactionsRemoved: interactionsRemoved.length,
      interactionsChanged: interactionsChanged.length
    },
    semantic: { added: semanticAdded, removed: semanticRemoved, changed: semanticChanged },
    interactions: { added: interactionsAdded, removed: interactionsRemoved, changed: interactionsChanged }
  };
}

async function captureAgentSnapshot(client, { maxItems, maxItemsProvided, previousSnapshot, timeoutMs }) {
  await Promise.all([
    client.send("DOM.enable", {}, timeoutMs).catch(() => ({})),
    client.send("Accessibility.enable", {}, timeoutMs).catch(() => ({}))
  ]);

  const [pageJson, domTree, accessibilityTree, domSnapshot] = await Promise.all([
    evaluateValue(
      client,
      `JSON.stringify({
        title: document.title || "",
        url: location.href,
        readyState: document.readyState,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY)
        },
        text: document.body?.innerText || ""
      })`,
      timeoutMs
    ),
    client.send("DOM.getDocument", { depth: -1, pierce: true }, timeoutMs),
    client.send("Accessibility.getFullAXTree", {}, timeoutMs).catch((error) => ({
      error: error.message,
      nodes: []
    })),
    client.send(
      "DOMSnapshot.captureSnapshot",
      {
        computedStyles: ["display", "visibility", "opacity"],
        includeDOMRects: true,
        includePaintOrder: true
      },
      timeoutMs
    )
  ]);

  const page = JSON.parse(pageJson);
  const semantic = buildAgentSemantic({
    accessibilityTree,
    domSnapshot,
    domTree,
    maxItems,
    maxItemsProvided,
    page
  });
  const snapshot = {
    source: "browser_agent_semantic",
    capturedAt: new Date().toISOString(),
    page,
    rawStats: semantic.rawStats,
    semanticTree: semantic.semanticTree,
    interactionGraph: semantic.interactionGraph,
    raw: {
      domTree,
      accessibilityTree,
      domSnapshot
    }
  };
  snapshot.diff = buildAgentDiff(previousSnapshot, snapshot);
  return snapshot;
}

async function captureDogeclawSnapshot(client, { maxItems, repoRoot, timeoutMs }) {
  const browserActionsPath = join(repoRoot, "content", "browser-actions.js");
  const browserActionsSource = readFileSync(browserActionsPath, "utf8");

  await evaluateValue(
    client,
    `${browserActionsSource}\n//# sourceURL=dogeclaw-content-browser-actions.js`,
    timeoutMs
  );

  const snapshotJson = await evaluateValue(
    client,
    `JSON.stringify(globalThis.DogeclawContentBrowserActions.createController().handleAction({ action: "snapshot", maxItems: ${maxItems} }))`,
    timeoutMs
  );
  return JSON.parse(snapshotJson);
}

function dogeclawRawSnapshotExpression({ documentYContained, documentYRange, maxItems, viewportOnly }) {
  return `JSON.stringify((() => {
    const browserRefs = new Map();
    let browserRefCounter = 0;
    const maxItemLimit = ${JSON.stringify(maxItems)};
    const keepViewportOnly = ${JSON.stringify(viewportOnly)};
    const documentYRange = ${JSON.stringify(documentYRange)};
    const documentYContained = ${JSON.stringify(documentYContained)};

    function isElementNode(node) {
      return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
    }

    function isHtmlElement(node) {
      return isElementNode(node) && typeof node.tagName === "string";
    }

    function getBrowserElementRole(element) {
      const explicitRole = element.getAttribute("role");
      if (explicitRole) {
        return explicitRole;
      }

      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") return element.type || "input";
      if (tag === "textarea") return "textarea";
      if (tag === "select") return "select";
      if (element.isContentEditable) return "editable";
      return tag;
    }

    function getBrowserElementText(element) {
      const ariaLabel = element.getAttribute("aria-label") || "";
      const label = element.getAttribute("title") || element.getAttribute("alt") || "";
      const placeholder = element.getAttribute("placeholder") || "";
      const value = ["button", "submit", "reset"].includes(element.type) ? element.value || "" : "";
      const text = element.innerText || element.textContent || "";
      return [ariaLabel, label, placeholder, value, text]
        .map((item) => String(item || "").replace(/\\s+/g, " ").trim())
        .filter(Boolean)[0] || "";
    }

    function getBrowserRef(element) {
      const existing = element.getAttribute("data-dogeclaw-browser-ref");
      if (existing) {
        browserRefs.set(existing, element);
        return existing;
      }

      const ref = "b" + (++browserRefCounter);
      element.setAttribute("data-dogeclaw-browser-ref", ref);
      browserRefs.set(ref, element);
      return ref;
    }

    function isBrowserElementVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0
      );
    }

    function isBrowserElementInViewport(element) {
      const rect = element.getBoundingClientRect();
      return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    }

    function getBrowserDocumentBounds(rect) {
      return {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    function isBrowserElementInDocumentYRange(element) {
      if (!documentYRange) {
        return true;
      }
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (documentYContained) {
        return top >= documentYRange.start && bottom <= documentYRange.end;
      }
      return bottom > documentYRange.start && top < documentYRange.end;
    }

    function matchesBrowserSpatialFilters(element) {
      return (
        isBrowserElementVisible(element) &&
        (!keepViewportOnly || isBrowserElementInViewport(element)) &&
        isBrowserElementInDocumentYRange(element)
      );
    }

    function getBrowserFullPageText() {
      return document.body?.innerText || "";
    }

    function getBrowserFilteredPageText() {
      if (!keepViewportOnly && !documentYRange) {
        return getBrowserFullPageText();
      }

      const selector = [
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
      const texts = [];
      const seen = new Set();
      for (const element of Array.from(document.querySelectorAll(selector))) {
        if (!isHtmlElement(element) || !matchesBrowserSpatialFilters(element)) {
          continue;
        }
        const text = (["input", "textarea", "select"].includes(element.tagName.toLowerCase())
          ? getBrowserElementText(element)
          : element.innerText || element.textContent || "")
          .replace(/\\s+/g, " ")
          .trim();
        if (!text || seen.has(text)) {
          continue;
        }
        seen.add(text);
        texts.push(text);
      }
      return texts.join("\\n");
    }

    function collectBrowserInteractives() {
      const selector = [
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

      let elements = Array.from(document.querySelectorAll(selector))
        .filter((element) => (
          isHtmlElement(element) &&
          matchesBrowserSpatialFilters(element)
        ));
      if (Number.isInteger(maxItemLimit) && maxItemLimit > 0) {
        elements = elements.slice(0, maxItemLimit);
      }

      return elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const documentBounds = getBrowserDocumentBounds(rect);
        return {
          ref: getBrowserRef(element),
          role: getBrowserElementRole(element),
          tag: element.tagName.toLowerCase(),
          text: getBrowserElementText(element),
          href: element.href || "",
          value: element.value && element.type !== "password" ? String(element.value) : "",
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          documentBounds
        };
      });
    }

    const fullText = getBrowserFullPageText();
    const text = getBrowserFilteredPageText();

    return {
      source: "dogeclaw_dom_raw",
      ok: true,
      viewportOnly: keepViewportOnly,
      documentYRange,
      documentYContained,
      title: document.title || "",
      url: location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
      },
      text,
      fullTextLength: fullText.length,
      elements: collectBrowserInteractives()
    };
  })())`;
}

async function captureDogeclawRawSnapshot(client, { documentYContained, documentYRange, maxItems, timeoutMs, viewportOnly }) {
  const snapshotJson = await evaluateValue(
    client,
    dogeclawRawSnapshotExpression({ documentYContained, documentYRange, maxItems, viewportOnly }),
    timeoutMs
  );
  return JSON.parse(snapshotJson);
}

async function captureSnapshot(client, {
  documentYContained,
  documentYRange,
  maxItems,
  maxItemsProvided,
  previousSnapshot,
  repoRoot,
  source,
  timeoutMs,
  viewportOnly
}) {
  if (source === "browser") {
    return captureBrowserSnapshot(client, timeoutMs);
  }
  if (source === "agent") {
    return captureAgentSnapshot(client, { maxItems, maxItemsProvided, previousSnapshot, timeoutMs });
  }
  if (source === "dogeclaw") {
    return captureDogeclawSnapshot(client, { maxItems, repoRoot, timeoutMs });
  }
  if (source === "dogeclaw-raw") {
    return captureDogeclawRawSnapshot(client, {
      documentYContained,
      documentYRange,
      maxItems: maxItemsProvided ? maxItems : 0,
      timeoutMs,
      viewportOnly
    });
  }

  const [browser, dogeclaw] = await Promise.all([
    captureBrowserSnapshot(client, timeoutMs),
    captureDogeclawSnapshot(client, { maxItems, repoRoot, timeoutMs })
  ]);
  return {
    source: "combined",
    capturedAt: new Date().toISOString(),
    browser,
    dogeclaw
  };
}

function launchChrome({ chromePath, headless, port, viewport }) {
  const userDataDir = mkdtempSync(join(tmpdir(), "dogeclaw-snapshot-"));
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

  const proc = spawn(chromePath, args, {
    stdio: ["ignore", "ignore", "pipe"]
  });

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

async function cleanup({ client, chrome, keepOpen }) {
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

function readPreviousSnapshot(outputPath) {
  if (!existsSync(outputPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(outputPath, "utf8"));
  } catch {
    return null;
  }
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

  const port = options.port || (await getFreePort());
  const endpoint = `http://127.0.0.1:${port}`;
  const chrome = launchChrome({ ...options, chromePath, port });
  let client = null;
  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(currentFile), "..");
  const outputPath = resolve(repoRoot, options.outputPath);
  const previousSnapshot = readPreviousSnapshot(outputPath);

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
    await scrollPage(client, {
      scrollX: options.scrollX,
      scrollY: options.scrollY,
      timeoutMs: options.timeoutMs
    });
    if (options.scrollX !== null || options.scrollY !== null) {
      await sleep(100);
    }

    const snapshot = await captureSnapshot(client, {
      documentYContained: options.documentYContained,
      documentYRange: options.documentYRange,
      maxItems: options.maxItems,
      maxItemsProvided: options.maxItemsProvided,
      previousSnapshot,
      repoRoot,
      source: options.source,
      timeoutMs: options.timeoutMs,
      viewportOnly: options.viewportOnly
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(snapshot, null, options.compact ? 0 : 2)}\n`);
    process.stdout.write(`${JSON.stringify(buildConsoleSummary(snapshot, outputPath), null, 2)}\n`);
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
