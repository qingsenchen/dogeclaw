(function () {
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const browserRefs = new Map();
  const browserRefCounters = { b: 0, r: 0 };
  let previousCompactSnapshot = null;

  function normalizeBrowserText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function hashBrowserText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function quoteCompact(value) {
    return JSON.stringify(String(value || ""));
  }

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

  function getBrowserLabelledByText(element) {
    const ids = String(element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .filter(Boolean);
    return ids
      .map((id) => document.getElementById(id))
      .map((node) => normalizeBrowserText(node?.innerText || node?.textContent || ""))
      .filter(Boolean)
      .join(" ");
  }

  function getBrowserElementOwnLabel(element) {
    const ariaLabel = element.getAttribute("aria-label") || "";
    const labelledBy = getBrowserLabelledByText(element);
    const label = element.getAttribute("title") || element.getAttribute("alt") || "";
    const placeholder = element.getAttribute("placeholder") || "";
    const value = ["button", "submit", "reset"].includes(element.type) ? element.value || "" : "";
    return [ariaLabel, labelledBy, label, placeholder, value].map(normalizeBrowserText).filter(Boolean)[0] || "";
  }

  function getBrowserElementText(element) {
    const ownLabel = getBrowserElementOwnLabel(element);
    const text = element.innerText || element.textContent || "";
    return ownLabel || normalizeBrowserText(text);
  }

  function getBrowserRef(element, prefix = "b") {
    const safePrefix = prefix === "r" ? "r" : "b";
    const attrName = safePrefix === "b" ? "data-dogeclaw-browser-ref" : `data-dogeclaw-browser-${safePrefix}-ref`;
    const existing = element.getAttribute(attrName);
    if (existing) {
      browserRefs.set(existing, element);
      return existing;
    }

    browserRefCounters[safePrefix] = (browserRefCounters[safePrefix] || 0) + 1;
    const ref = `${safePrefix}${browserRefCounters[safePrefix]}`;
    element.setAttribute(attrName, ref);
    browserRefs.set(ref, element);
    return ref;
  }

  function browserRect(bounds) {
    return {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    };
  }

  function browserDocumentRect(bounds) {
    return {
      x: Math.round(bounds.left + window.scrollX),
      y: Math.round(bounds.top + window.scrollY),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    };
  }

  function rectsIntersect(a, b) {
    return a.bottom > b.top && a.right > b.left && a.top < b.bottom && a.left < b.right;
  }

  function viewportRect() {
    return {
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }

  function clipsElement(element, rect) {
    let parent = element.parentElement;
    while (parent && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent);
      const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
      if (/(hidden|auto|scroll|clip|overlay)/.test(overflow)) {
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width > 0 && parentRect.height > 0 && !rectsIntersect(rect, parentRect)) {
          return true;
        }
      }
      parent = parent.parentElement;
    }
    return false;
  }

  function isBrowserElementVisible(element, { scope = "all" } = {}) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0 &&
      (scope !== "viewport" || rectsIntersect(rect, viewportRect())) &&
      !clipsElement(element, rect)
    );
  }

  function findBrowserElement({ ref, selector, text } = {}) {
    const normalizedRef = String(ref || "").replace(/^@/, "");
    if (normalizedRef && browserRefs.has(normalizedRef)) {
      const element = browserRefs.get(normalizedRef);
      if (element?.isConnected) {
        return element;
      }
    }

    if (selector) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    const queryText = String(text || "").trim().toLowerCase();
    if (queryText) {
      const candidates = collectBrowserInteractives(120);
      const item = candidates.find((candidate) => candidate.text.toLowerCase().includes(queryText));
      if (item?.ref) {
        return browserRefs.get(item.ref) || null;
      }
    }

    return null;
  }

  function collectBrowserInteractives(maxItems = 80, options = {}) {
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
    const scope = String(options.scope || "all").toLowerCase() === "viewport" ? "viewport" : "all";
    const limit = Number(maxItems);
    const elements = Array.from(document.querySelectorAll(selector))
      .filter((element) => isHtmlElement(element) && isBrowserElementVisible(element, { scope }));
    const limitedElements = Number.isFinite(limit) && limit > 0 ? elements.slice(0, limit) : elements;

    return limitedElements
      .map((element) => {
        const rect = element.getBoundingClientRect();
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
          }
        };
      });
  }

  function getBrowserPageText() {
    const text = document.body?.innerText || "";
    return normalizeBrowserText(text);
  }

  function shortBrowserUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (url.origin === location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return url.href;
    } catch {
      return String(value || "");
    }
  }

  function isBrowserScrollable(element) {
    const style = window.getComputedStyle(element);
    return (
      /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`) &&
      (element.scrollHeight > element.clientHeight + 8 || element.scrollWidth > element.clientWidth + 8)
    );
  }

  function isBrowserRegionElement(element) {
    const tag = element.tagName.toLowerCase();
    const style = window.getComputedStyle(element);
    const role = element.getAttribute("role") || "";
    return (
      isBrowserScrollable(element) ||
      ["fixed", "sticky"].includes(style.position) ||
      ["nav", "aside", "main", "header", "footer", "form", "section"].includes(tag) ||
      Boolean(role && !["button", "link"].includes(role))
    );
  }

  function getBrowserRegionLabel(element) {
    const ownLabel = getBrowserElementOwnLabel(element);
    if (ownLabel) {
      return ownLabel;
    }
    const heading = element.querySelector("h1,h2,h3,h4,h5,h6");
    const headingText = heading && heading !== element ? getBrowserElementText(heading) : "";
    return headingText || getBrowserElementRole(element) || element.tagName.toLowerCase();
  }

  function addBrowserRegion(element, regions, regionByElement) {
    if (!element) {
      return null;
    }
    if (regionByElement.has(element)) {
      return regionByElement.get(element);
    }
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const region = {
      ref: getBrowserRef(element, "r"),
      tag: element.tagName.toLowerCase(),
      role: getBrowserElementRole(element),
      label: getBrowserRegionLabel(element),
      position: style.position || "static",
      scrollable: isBrowserScrollable(element),
      scrollTop: Math.round(element.scrollTop || 0),
      scrollLeft: Math.round(element.scrollLeft || 0),
      scrollHeight: Math.round(element.scrollHeight || 0),
      scrollWidth: Math.round(element.scrollWidth || 0),
      clientHeight: Math.round(element.clientHeight || rect.height || 0),
      clientWidth: Math.round(element.clientWidth || rect.width || 0),
      bounds: browserRect(rect),
      documentBounds: browserDocumentRect(rect),
      itemCount: 0,
      stableKey: "",
      contentHash: ""
    };
    region.stableKey = [
      region.tag,
      region.role,
      region.label,
      region.position,
      Math.round(rect.left),
      Math.round(rect.top)
    ].join("|");
    regions.push(region);
    regionByElement.set(element, region);
    return region;
  }

  function nearestBrowserRegion(element, regions, regionByElement) {
    let node = element.parentElement;
    while (node && node !== document.body) {
      if (regionByElement.has(node)) {
        return regionByElement.get(node);
      }
      if (isHtmlElement(node) && isBrowserElementVisible(node, { scope: "viewport" }) && isBrowserRegionElement(node)) {
        return addBrowserRegion(node, regions, regionByElement);
      }
      node = node.parentElement;
    }
    return null;
  }

  function compactInteractionLine(item) {
    const href = item.href ? ` href=${item.href}` : "";
    const value = item.value ? ` value=${quoteCompact(item.value)}` : "";
    const region = item.region ? ` region=@${item.region}` : "";
    return `@${item.ref} ${item.role} ${quoteCompact(item.text)} tag=${item.tag}${href}${value}${region}`;
  }

  function compactRegionLine(region, unchanged = false) {
    const maxScrollTop = Math.max(0, region.scrollHeight - region.clientHeight);
    const scroll = region.scrollable ? ` scrollTop=${region.scrollTop}/${maxScrollTop}` : "";
    const state = unchanged ? " unchanged omitted" : "";
    return `@${region.ref} ${region.tag} role=${region.role} ${quoteCompact(region.label)} pos=${region.position}${scroll} items=${region.itemCount}${state}`;
  }

  function compactDiff(previousSnapshot, currentSnapshot) {
    const empty = {
      regions: { added: [], changed: [], removed: [] },
      interactions: { added: [], changed: [], removed: [] },
      text: { added: [], changed: [], removed: [] }
    };
    if (!previousSnapshot) {
      return {
        base: "none",
        regions: { ...empty.regions, added: currentSnapshot.regions },
        interactions: { ...empty.interactions, added: currentSnapshot.interactions },
        text: { ...empty.text, added: currentSnapshot.textChunks }
      };
    }

    function diffItems(previousItems = [], currentItems = []) {
      const previous = new Map(previousItems.map((item) => [item.stableKey, item]));
      const current = new Map(currentItems.map((item) => [item.stableKey, item]));
      const added = [];
      const changed = [];
      const removed = [];
      for (const [key, item] of current) {
        const oldItem = previous.get(key);
        if (!oldItem) {
          added.push(item);
        } else if (oldItem.contentHash !== item.contentHash) {
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

    return {
      base: previousSnapshot.capturedAt || "previous",
      regions: diffItems(previousSnapshot.regions, currentSnapshot.regions),
      interactions: diffItems(previousSnapshot.interactions, currentSnapshot.interactions),
      text: diffItems(previousSnapshot.textChunks, currentSnapshot.textChunks)
    };
  }

  function renderCompactSnapshot(snapshot, diff, options = {}) {
    const unchangedRegionKeys = new Set();
    if (diff.base !== "none") {
      const changedKeys = new Set([
        ...diff.regions.added.map((item) => item.stableKey),
        ...diff.regions.changed.map((item) => item.stableKey)
      ]);
      for (const region of snapshot.regions) {
        if (!changedKeys.has(region.stableKey) && ["fixed", "sticky"].includes(region.position)) {
          unchangedRegionKeys.add(region.stableKey);
        }
      }
    }

    const omittedRegionRefs = new Set();
    const lines = [];
    lines.push(`Page ${quoteCompact(snapshot.title)}`);
    lines.push(`URL ${snapshot.url}`);
    lines.push(`Viewport ${snapshot.viewport.width}x${snapshot.viewport.height} scroll=(${snapshot.viewport.scrollX},${snapshot.viewport.scrollY}) scope=${snapshot.scope}`);
    lines.push(
      `Stats regions=${snapshot.regions.length} interactions=${snapshot.totalInteractions}` +
        ` textChunks=${snapshot.textChunks.length}/${snapshot.totalTextChunks}` +
        ` omittedTextChunks=${snapshot.omittedTextChunks} fullTextLength=${snapshot.fullTextLength}`
    );
    lines.push("Refs: use b* refs for click/type, r* refs for scrolling a region. Re-run snapshot after scroll/click/type.");
    lines.push("");
    lines.push("Regions:");
    for (const region of snapshot.regions) {
      const omit = unchangedRegionKeys.has(region.stableKey) && options.includeUnchanged !== true;
      if (omit) {
        omittedRegionRefs.add(region.ref);
      }
      lines.push(compactRegionLine(region, omit));
    }
    lines.push("");
    lines.push("Interactions:");
    for (const item of snapshot.interactions) {
      if (!omittedRegionRefs.has(item.region)) {
        lines.push(compactInteractionLine(item));
      }
    }
    if (snapshot.omittedInteractions > 0) {
      lines.push(`... ${snapshot.omittedInteractions} more interactions omitted by maxItems`);
    }
    lines.push("");
    lines.push("Visible Text:");
    for (const chunk of snapshot.textChunks) {
      if (!omittedRegionRefs.has(chunk.region)) {
        lines.push(`${chunk.region ? `@${chunk.region} ` : ""}${chunk.tag}: ${chunk.text}`);
      }
    }
    if (snapshot.omittedTextChunks > 0) {
      lines.push(`... ${snapshot.omittedTextChunks} more text chunks omitted by maxTextChars`);
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

  function collectCompactSnapshot(message = {}) {
    const scope = String(message.scope || message.snapshotScope || "viewport").toLowerCase() === "all" ? "all" : "viewport";
    const maxItems = Math.max(1, Number(message.maxItems) || 80);
    const requestedMaxTextChars = Number(message.maxTextChars);
    const maxTextChars = Number.isFinite(requestedMaxTextChars) && requestedMaxTextChars >= 0
      ? requestedMaxTextChars
      : 3000;
    const regions = [];
    const regionByElement = new Map();
    const regionSelector = "nav,aside,main,header,footer,form,section,[role]";
    for (const element of Array.from(document.querySelectorAll(regionSelector))) {
      if (isHtmlElement(element) && isBrowserElementVisible(element, { scope }) && isBrowserRegionElement(element)) {
        addBrowserRegion(element, regions, regionByElement);
      }
    }

    const interactions = collectBrowserInteractives(Infinity, { scope })
      .map((item) => {
        const element = browserRefs.get(item.ref);
        const region = nearestBrowserRegion(element, regions, regionByElement);
        if (region) {
          region.itemCount += 1;
        }
        const nextItem = {
          ...item,
          href: shortBrowserUrl(item.href),
          region: region?.ref || "",
          regionStableKey: region?.stableKey || ""
        };
        nextItem.stableKey = [nextItem.role, nextItem.tag, nextItem.text, nextItem.href, nextItem.regionStableKey].join("|");
        nextItem.contentHash = hashBrowserText(JSON.stringify({
          role: nextItem.role,
          tag: nextItem.tag,
          text: nextItem.text,
          href: nextItem.href,
          value: nextItem.value,
          region: nextItem.regionStableKey
        }));
        return nextItem;
      });

    for (const region of regions) {
      const childHashes = interactions
        .filter((item) => item.region === region.ref)
        .map((item) => item.contentHash)
        .join("|");
      region.contentHash = hashBrowserText([region.label, region.position, region.scrollTop, childHashes].join("|"));
    }

    const textChunks = [];
    const seenText = new Set();
    const textSelector = "h1,h2,h3,h4,h5,h6,p,li,td,th,summary,label,blockquote,figcaption";
    let textCharCount = 0;
    let totalTextChunks = 0;
    let omittedTextChunks = 0;
    for (const element of Array.from(document.querySelectorAll(textSelector))) {
      if (!isHtmlElement(element) || !isBrowserElementVisible(element, { scope })) {
        continue;
      }
      const rawText = normalizeBrowserText(element.innerText || element.textContent || "");
      if (!rawText || seenText.has(rawText)) {
        continue;
      }
      seenText.add(rawText);
      totalTextChunks += 1;
      if (textCharCount + rawText.length > maxTextChars) {
        omittedTextChunks += 1;
        continue;
      }
      textCharCount += rawText.length + 1;
      const region = nearestBrowserRegion(element, regions, regionByElement);
      const chunk = {
        tag: element.tagName.toLowerCase(),
        text: rawText,
        region: region?.ref || "",
        regionStableKey: region?.stableKey || ""
      };
      chunk.stableKey = [chunk.tag, chunk.text, chunk.regionStableKey].join("|");
      chunk.contentHash = hashBrowserText(chunk.text);
      textChunks.push(chunk);
    }

    return {
      capturedAt: new Date().toISOString(),
      title: document.title || "",
      url: location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
      },
      scope,
      regions,
      interactions: interactions.slice(0, maxItems),
      totalInteractions: interactions.length,
      omittedInteractions: Math.max(0, interactions.length - maxItems),
      textChunks,
      totalTextChunks,
      omittedTextChunks,
      fullTextLength: (document.body?.innerText || "").length
    };
  }

  function buildCompactBrowserSnapshot(message = {}) {
    const snapshot = collectCompactSnapshot(message);
    const diff = compactDiff(previousCompactSnapshot, snapshot);
    const compact = renderCompactSnapshot(snapshot, diff, {
      includeUnchanged: message.includeUnchanged === true
    });
    previousCompactSnapshot = {
      capturedAt: snapshot.capturedAt,
      regions: snapshot.regions.map((item) => ({
        stableKey: item.stableKey,
        contentHash: item.contentHash
      })),
      interactions: snapshot.interactions.map((item) => ({
        stableKey: item.stableKey,
        contentHash: item.contentHash
      })),
      textChunks: snapshot.textChunks.map((item) => ({
        stableKey: item.stableKey,
        contentHash: item.contentHash
      }))
    };
    return {
      ok: true,
      format: "compact",
      title: snapshot.title,
      url: snapshot.url,
      viewport: snapshot.viewport,
      compact,
      stats: {
        regions: snapshot.regions.length,
        interactions: snapshot.totalInteractions,
        shownInteractions: snapshot.interactions.length,
        omittedInteractions: snapshot.omittedInteractions,
        textChunks: snapshot.textChunks.length,
        totalTextChunks: snapshot.totalTextChunks,
        omittedTextChunks: snapshot.omittedTextChunks,
        fullTextLength: snapshot.fullTextLength
      },
      diff: {
        base: diff.base,
        regions: {
          added: diff.regions.added.length,
          changed: diff.regions.changed.length,
          removed: diff.regions.removed.length
        },
        interactions: {
          added: diff.interactions.added.length,
          changed: diff.interactions.changed.length,
          removed: diff.interactions.removed.length
        },
        text: {
          added: diff.text.added.length,
          changed: diff.text.changed.length,
          removed: diff.text.removed.length
        }
      }
    };
  }

  function getBrowserScrollNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function findBrowserScrollableContainer(element) {
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (isHtmlElement(node) && isBrowserScrollable(node)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function browserWindowScrollState() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return {
      target: "window",
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      maxScrollX: Math.max(0, Math.round((scrollingElement?.scrollWidth || 0) - window.innerWidth)),
      maxScrollY: Math.max(0, Math.round((scrollingElement?.scrollHeight || 0) - window.innerHeight))
    };
  }

  function browserElementScrollState(element, requestedRef = "") {
    return {
      target: "region",
      requestedRef,
      ref: getBrowserRef(element, "r"),
      tag: element.tagName.toLowerCase(),
      role: getBrowserElementRole(element),
      scrollLeft: Math.round(element.scrollLeft || 0),
      scrollTop: Math.round(element.scrollTop || 0),
      maxScrollLeft: Math.max(0, Math.round((element.scrollWidth || 0) - (element.clientWidth || 0))),
      maxScrollTop: Math.max(0, Math.round((element.scrollHeight || 0) - (element.clientHeight || 0)))
    };
  }

  function dispatchBrowserInput(element, text, { clear = true, submit = false } = {}) {
    element.focus();

    if (element.isContentEditable) {
      if (clear) {
        element.textContent = "";
      }
      element.textContent = `${clear ? "" : element.textContent || ""}${text}`;
    } else if ("value" in element) {
      if (clear) {
        element.value = "";
      }
      element.value = `${clear ? "" : element.value || ""}${text}`;
    } else {
      throw new Error(t("browser.targetNotEditable"));
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    if (submit) {
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
      element.form?.requestSubmit?.();
    }
  }

  function handleBrowserAction(message) {
    const action = String(message?.action || "");
    if (action === "snapshot") {
      const snapshotFormat = String(message.snapshotFormat || message.format || "compact").toLowerCase();
      if (!["raw", "legacy"].includes(snapshotFormat)) {
        return buildCompactBrowserSnapshot(message);
      }
      return {
        ok: true,
        format: "raw",
        title: document.title || "",
        url: location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY)
        },
        text: getBrowserPageText(),
        elements: collectBrowserInteractives(message.maxItems || 80, {
          scope: String(message.scope || message.snapshotScope || "all").toLowerCase() === "viewport" ? "viewport" : "all"
        })
      };
    }

    if (action === "click") {
      const element = findBrowserElement(message);
      if (!element) {
        throw new Error(t("browser.targetElementNotFound"));
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return { ok: true, action: "click", ref: getBrowserRef(element), text: getBrowserElementText(element) };
    }

    if (action === "type") {
      const element = findBrowserElement(message);
      if (!element) {
        throw new Error(t("browser.targetElementNotFound"));
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      dispatchBrowserInput(element, String(message.text || ""), {
        clear: message.clear !== false,
        submit: Boolean(message.submit)
      });
      return { ok: true, action: "type", ref: getBrowserRef(element) };
    }

    if (action === "scroll") {
      const left = getBrowserScrollNumber(message.x, 0);
      const top = getBrowserScrollNumber(message.y, 0);
      const requestedRef = String(message.ref || "").replace(/^@/, "");
      const element = findBrowserElement(message);
      const scrollTarget = element ? findBrowserScrollableContainer(element) : null;
      if (scrollTarget) {
        scrollTarget.scrollBy({ left, top, behavior: "auto" });
        return {
          ok: true,
          action: "scroll",
          ...browserElementScrollState(scrollTarget, requestedRef)
        };
      }

      window.scrollBy({ left, top, behavior: "auto" });
      return {
        ok: true,
        action: "scroll",
        requestedRef,
        ...browserWindowScrollState()
      };
    }

    throw new Error(t("browser.unknownAction", { action: action || t("common.empty") }));
  }



  function createController() {
    return {
      handleAction: handleBrowserAction
    };
  }

  globalThis.DogeclawContentBrowserActions = {
    createController
  };
})();
