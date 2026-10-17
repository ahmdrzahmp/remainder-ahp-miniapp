(function () {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------

  function randomId() {
    return (
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function getLaunchParams() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;

    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    function get(name) {
      return hashParams.get(name) || searchParams.get(name) || "";
    }

    return {
      initData: get("tgWebAppData"),
      version: get("tgWebAppVersion"),
      platform: get("tgWebAppPlatform"),
      themeParamsRaw: get("tgWebAppThemeParams"),
    };
  }

  function parseInitData(initData) {
    const result = {};

    if (!initData) {
      return result;
    }

    try {
      const params = new URLSearchParams(initData);

      for (const [key, value] of params.entries()) {
        result[key] = value;
      }

      ["user", "receiver", "chat"].forEach((field) => {
        if (result[field]) {
          try {
            result[field] = JSON.parse(result[field]);
          } catch (_) {}
        }
      });

      return result;
    } catch (error) {
      console.error("Could not parse initData:", error);
      return {};
    }
  }

  function parseThemeParams(raw) {
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  // -----------------------------
  // Telegram event bridge
  // -----------------------------

  const pendingCallbacks = new Map();

  function postTelegramEvent(eventType, eventData) {
    const data = eventData || {};

    // Telegram Desktop / mobile WebView
    if (
      window.TelegramWebviewProxy &&
      typeof window.TelegramWebviewProxy.postEvent === "function"
    ) {
      window.TelegramWebviewProxy.postEvent(
        eventType,
        JSON.stringify(data)
      );

      return true;
    }

    // Windows Phone / legacy style
    if (
      window.external &&
      typeof window.external.notify === "function"
    ) {
      window.external.notify(
        JSON.stringify({
          eventType: eventType,
          eventData: data,
        })
      );

      return true;
    }

    // iframe fallback
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({
          eventType: eventType,
          eventData: data,
        }),
        "*"
      );

      return true;
    }

    console.warn("No Telegram bridge available for:", eventType);

    return false;
  }

  function handleTelegramEvent(eventType, eventData) {
    let data = eventData;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {}
    }

    if (eventType === "custom_method_invoked") {
      const requestId = data?.req_id;

      if (!requestId) {
        return;
      }

      const callback = pendingCallbacks.get(requestId);

      if (!callback) {
        return;
      }

      pendingCallbacks.delete(requestId);

      if (data.error) {
        callback(data.error, null);
        return;
      }

      let result = data.result;

      // Some clients may return JSON as a string.
      if (typeof result === "string") {
        try {
          result = JSON.parse(result);
        } catch (_) {}
      }

      callback(null, result);
    }
  }

  // Telegram clients commonly call these global receive methods.
  window.TelegramGameProxy_receiveEvent = function (
    eventType,
    eventData
  ) {
    handleTelegramEvent(eventType, eventData);
  };

  window.TelegramGameProxy = {
    receiveEvent: function (eventType, eventData) {
      handleTelegramEvent(eventType, eventData);
    },
  };

  // -----------------------------
  // WebView API
  // -----------------------------

  const WebView = {
    postEvent: postTelegramEvent,

    receiveEvent: function (eventType, eventData) {
      handleTelegramEvent(eventType, eventData);
    },
  };

  // -----------------------------
  // Custom methods
  // -----------------------------

  function invokeCustomMethod(method, params, callback) {
    const requestId = randomId();

    if (typeof callback === "function") {
      pendingCallbacks.set(requestId, callback);
    }

    const success = postTelegramEvent(
      "web_app_invoke_custom_method",
      {
        req_id: requestId,
        method: method,
        params: params || {},
      }
    );

    if (!success) {
      pendingCallbacks.delete(requestId);

      if (typeof callback === "function") {
        callback(
          "Telegram bridge unavailable",
          null
        );
      }
    }

    // Avoid callbacks hanging forever.
    setTimeout(function () {
      if (pendingCallbacks.has(requestId)) {
        const cb = pendingCallbacks.get(requestId);

        pendingCallbacks.delete(requestId);

        cb(
          "Telegram request timeout",
          null
        );
      }
    }, 10000);
  }

  // -----------------------------
  // CloudStorage
  // -----------------------------

  const CloudStorage = {};

  CloudStorage.setItem = function (
    key,
    value,
    callback
  ) {
    invokeCustomMethod(
      "saveStorageValue",
      {
        key: String(key),
        value: String(value),
      },
      callback
    );

    return CloudStorage;
  };

  CloudStorage.getItem = function (
    key,
    callback
  ) {
    CloudStorage.getItems(
      [key],
      function (error, result) {
        if (error) {
          callback?.(error);
          return;
        }

        callback?.(
          null,
          result ? result[key] : undefined
        );
      }
    );

    return CloudStorage;
  };

  CloudStorage.getItems = function (
    keys,
    callback
  ) {
    invokeCustomMethod(
      "getStorageValues",
      {
        keys: keys.map(String),
      },
      callback
    );

    return CloudStorage;
  };

  CloudStorage.removeItem = function (
    key,
    callback
  ) {
    CloudStorage.removeItems(
      [key],
      callback
    );

    return CloudStorage;
  };

  CloudStorage.removeItems = function (
    keys,
    callback
  ) {
    invokeCustomMethod(
      "deleteStorageValues",
      {
        keys: keys.map(String),
      },
      callback
    );

    return CloudStorage;
  };

  CloudStorage.getKeys = function (
    callback
  ) {
    invokeCustomMethod(
      "getStorageKeys",
      {},
      callback
    );

    return CloudStorage;
  };

  // -----------------------------
  // Mini App initialization
  // -----------------------------

  const launch = getLaunchParams();

  const initDataUnsafe =
    parseInitData(launch.initData);

  const themeParams =
    parseThemeParams(
      launch.themeParamsRaw
    );

  const WebApp = {
    initData: launch.initData || "",

    initDataUnsafe: initDataUnsafe,

    version:
      launch.version || "unknown",

    platform:
      launch.platform || "unknown",

    themeParams: themeParams,

    CloudStorage: CloudStorage,

    ready: function () {
      postTelegramEvent(
        "web_app_ready",
        {}
      );
    },

    expand: function () {
      postTelegramEvent(
        "web_app_expand",
        {}
      );
    },

    close: function () {
      postTelegramEvent(
        "web_app_close",
        {}
      );
    },
  };

  // -----------------------------
  // Theme variables
  // -----------------------------

  const cssMap = {
    bg_color:
      "--tg-theme-bg-color",

    text_color:
      "--tg-theme-text-color",

    hint_color:
      "--tg-theme-hint-color",

    button_color:
      "--tg-theme-button-color",

    button_text_color:
      "--tg-theme-button-text-color",

    secondary_bg_color:
      "--tg-theme-secondary-bg-color",
  };

  Object.entries(cssMap).forEach(
    ([telegramKey, cssVariable]) => {
      if (themeParams[telegramKey]) {
        document.documentElement.style.setProperty(
          cssVariable,
          themeParams[telegramKey]
        );
      }
    }
  );

  // -----------------------------
  // Export global Telegram object
  // -----------------------------

  window.Telegram =
    window.Telegram || {};

  window.Telegram.WebView =
    WebView;

  window.Telegram.WebApp =
    WebApp;

  console.log(
    "TaskFlow Telegram bridge loaded"
  );

  console.log(
    "Platform:",
    WebApp.platform
  );

  console.log(
    "Version:",
    WebApp.version
  );

  console.log(
    "User:",
    WebApp.initDataUnsafe.user
  );
})();
