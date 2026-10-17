
(function () {
  "use strict";

  function getLaunchParams() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
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
      themeParamsRaw: get("tgWebAppThemeParams")
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

      if (result.user) {
        try {
          result.user = JSON.parse(result.user);
        } catch (error) {
          console.warn("Could not parse Telegram user:", error);
        }
      }

      if (result.receiver) {
        try {
          result.receiver = JSON.parse(result.receiver);
        } catch (error) {
          console.warn("Could not parse Telegram receiver:", error);
        }
      }

      if (result.chat) {
        try {
          result.chat = JSON.parse(result.chat);
        } catch (error) {
          console.warn("Could not parse Telegram chat:", error);
        }
      }

      return result;
    } catch (error) {
      console.error("Could not parse initData:", error);
      return {};
    }
  }

  function parseThemeParams(raw) {
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Could not parse theme params:", error);
      return {};
    }
  }

  function postTelegramEvent(eventType, eventData) {
    const data = eventData || {};

    try {
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
    } catch (error) {
      console.warn("TelegramWebviewProxy failed:", error);
    }

    try {
      if (
        window.external &&
        typeof window.external.notify === "function"
      ) {
        window.external.notify(
          JSON.stringify({
            eventType: eventType,
            eventData: data
          })
        );

        return true;
      }
    } catch (error) {
      console.warn("external.notify failed:", error);
    }

    return false;
  }

  const launch = getLaunchParams();

  const initDataUnsafe = parseInitData(launch.initData);
  const themeParams = parseThemeParams(launch.themeParamsRaw);

  const WebApp = {
    initData: launch.initData || "",

    initDataUnsafe: initDataUnsafe,

    version: launch.version || "unknown",

    platform: launch.platform || "unknown",

    themeParams: themeParams,

    colorScheme: "light",

    isExpanded: false,

    ready: function () {
      postTelegramEvent("web_app_ready", {});
    },

    expand: function () {
      const success = postTelegramEvent("web_app_expand", {});

      if (success) {
        this.isExpanded = true;
      }
    },

    close: function () {
      postTelegramEvent("web_app_close", {});
    }
  };

  if (themeParams.bg_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-bg-color",
      themeParams.bg_color
    );
  }

  if (themeParams.text_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-text-color",
      themeParams.text_color
    );
  }

  if (themeParams.hint_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-hint-color",
      themeParams.hint_color
    );
  }

  if (themeParams.button_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-button-color",
      themeParams.button_color
    );
  }

  if (themeParams.button_text_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-button-text-color",
      themeParams.button_text_color
    );
  }

  if (themeParams.secondary_bg_color) {
    document.documentElement.style.setProperty(
      "--tg-theme-secondary-bg-color",
      themeParams.secondary_bg_color
    );
  }

  window.Telegram = window.Telegram || {};
  window.Telegram.WebApp = WebApp;

  console.log("Local Telegram bridge loaded.");
  console.log("Platform:", WebApp.platform);
  console.log("Version:", WebApp.version);
  console.log("User:", WebApp.initDataUnsafe.user);
})();
