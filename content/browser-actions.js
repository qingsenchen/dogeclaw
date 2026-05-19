(function () {
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const browserRefs = new Map();
  let browserRefCounter = 0;

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
      .map((item) => String(item || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)[0] || "";
  }

  function getBrowserRef(element) {
    const existing = element.getAttribute("data-dogeclaw-browser-ref");
    if (existing) {
      browserRefs.set(existing, element);
      return existing;
    }

    const ref = `b${++browserRefCounter}`;
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

  function findBrowserElement({ ref, selector, text } = {}) {
    if (ref && browserRefs.has(ref)) {
      const element = browserRefs.get(ref);
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

  function collectBrowserInteractives(maxItems = 80) {
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

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => isHtmlElement(element) && isBrowserElementVisible(element))
      .slice(0, maxItems)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          ref: getBrowserRef(element),
          role: getBrowserElementRole(element),
          tag: element.tagName.toLowerCase(),
          text: getBrowserElementText(element).slice(0, 180),
          href: element.href || "",
          value: element.value && element.type !== "password" ? String(element.value).slice(0, 120) : "",
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
    return text.replace(/\s+/g, " ").trim().slice(0, 3000);
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
      return {
        ok: true,
        title: document.title || "",
        url: location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY)
        },
        text: getBrowserPageText(),
        elements: collectBrowserInteractives(message.maxItems || 80)
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
      window.scrollBy({ left: Number(message.x) || 0, top: Number(message.y) || 0, behavior: "smooth" });
      return {
        ok: true,
        action: "scroll",
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY)
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
