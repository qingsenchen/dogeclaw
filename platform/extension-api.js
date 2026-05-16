(function () {
  const root = globalThis;
  const promiseApi = root.browser && root.browser.runtime ? root.browser : null;
  const chromeApi = root.chrome && root.chrome.runtime ? root.chrome : null;
  const api = promiseApi || chromeApi || null;

  if (promiseApi && root.chrome !== promiseApi) {
    try {
      root.chrome = promiseApi;
    } catch {}
  }

  function resolve(path) {
    const parts = String(path || "").split(".").filter(Boolean);
    let owner = api;
    for (let index = 0; index < parts.length - 1; index += 1) {
      owner = owner?.[parts[index]];
    }
    const key = parts[parts.length - 1];
    return { owner, fn: owner?.[key] };
  }

  function invoke(path, args = []) {
    const { owner, fn } = resolve(path);
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`Extension API unavailable: ${path}`));
    }

    try {
      const result = fn.apply(owner, args);
      if (result && typeof result.then === "function") {
        return result;
      }
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function supports(path) {
    const { fn } = resolve(path);
    return typeof fn === "function";
  }

  function detectBrowserName() {
    const ua = root.navigator?.userAgent || "";
    if (/Firefox\//i.test(ua)) return "firefox";
    if (/Edg\//i.test(ua)) return "edge";
    if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua)) return "chrome";
    return "unknown";
  }

  function getManifest() {
    try {
      return api?.runtime?.getManifest?.() || {};
    } catch {
      return {};
    }
  }

  function getBackgroundKind(manifest) {
    if (manifest?.background?.service_worker) return "service_worker";
    if (Array.isArray(manifest?.background?.scripts)) return "scripts";
    return "unknown";
  }

  const manifest = getManifest();
  const platform = {
    api,
    isAvailable: Boolean(api),
    namespace: promiseApi ? "browser" : chromeApi ? "chrome" : "none",
    capabilities: {
      browserName: detectBrowserName(),
      manifestVersion: Number(manifest.manifest_version || 0) || 0,
      backgroundKind: getBackgroundKind(manifest),
      supportsAction: Boolean(api?.action),
      supportsAlarms: supports("alarms.create"),
      supportsContextMenus: supports("contextMenus.create"),
      supportsScripting: supports("scripting.executeScript"),
      supportsTabsCapture: supports("tabs.captureVisibleTab")
    },
    runtime: {
      get id() {
        return api?.runtime?.id || "";
      },
      getManifest,
      sendMessage(message, options) {
        return invoke("runtime.sendMessage", options === undefined ? [message] : [message, options]);
      },
      connect(connectInfo) {
        if (!api?.runtime?.connect) {
          throw new Error("Extension API unavailable: runtime.connect");
        }
        return api.runtime.connect(connectInfo);
      },
      onMessage: api?.runtime?.onMessage,
      onConnect: api?.runtime?.onConnect,
      onInstalled: api?.runtime?.onInstalled,
      onStartup: api?.runtime?.onStartup
    },
    storage: {
      local: {
        get(keys) {
          return invoke("storage.local.get", [keys]).then((result) => result || {});
        },
        set(items) {
          return invoke("storage.local.set", [items]);
        },
        remove(keys) {
          return invoke("storage.local.remove", [keys]);
        }
      },
      session: api?.storage?.session
        ? {
            get(keys) {
              return invoke("storage.session.get", [keys]).then((result) => result || {});
            },
            set(items) {
              return invoke("storage.session.set", [items]);
            },
            remove(keys) {
              return invoke("storage.session.remove", [keys]);
            }
          }
        : null
    },
    tabs: {
      query(queryInfo) {
        return invoke("tabs.query", [queryInfo]);
      },
      get(tabId) {
        return invoke("tabs.get", [tabId]);
      },
      update(tabId, updateProperties) {
        return invoke("tabs.update", [tabId, updateProperties]);
      },
      create(createProperties) {
        return invoke("tabs.create", [createProperties]);
      },
      sendMessage(tabId, message, options) {
        return invoke("tabs.sendMessage", options === undefined ? [tabId, message] : [tabId, message, options]);
      },
      captureVisibleTab(windowId, options) {
        return invoke("tabs.captureVisibleTab", [windowId, options]);
      },
      goBack(tabId) {
        return invoke("tabs.goBack", [tabId]);
      },
      goForward(tabId) {
        return invoke("tabs.goForward", [tabId]);
      },
      reload(tabId, reloadProperties) {
        return invoke("tabs.reload", reloadProperties === undefined ? [tabId] : [tabId, reloadProperties]);
      }
    },
    windows: {
      update(windowId, updateInfo) {
        return invoke("windows.update", [windowId, updateInfo]);
      }
    },
    scripting: {
      executeScript(injection) {
        return invoke("scripting.executeScript", [injection]);
      }
    },
    action: {
      setBadgeBackgroundColor(details) {
        return invoke("action.setBadgeBackgroundColor", [details]);
      },
      setBadgeText(details) {
        return invoke("action.setBadgeText", [details]);
      },
      setTitle(details) {
        return invoke("action.setTitle", [details]);
      },
      onClicked: api?.action?.onClicked
    },
    alarms: {
      create(name, alarmInfo) {
        return invoke("alarms.create", [name, alarmInfo]);
      },
      clear(name) {
        return invoke("alarms.clear", [name]);
      },
      onAlarm: api?.alarms?.onAlarm
    },
    contextMenus: {
      create(createProperties) {
        return invoke("contextMenus.create", [createProperties]);
      },
      removeAll() {
        return invoke("contextMenus.removeAll");
      },
      onClicked: api?.contextMenus?.onClicked
    },
    supports
  };

  root.DogeclawPlatform = platform;
})();
