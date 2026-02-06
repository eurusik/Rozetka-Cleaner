(function () {
  "use strict";

  const CONFIG = globalThis.RZC_CONFIG || {};
  const STORAGE_KEY = CONFIG.storageKey || "rzc_settings";
  const DEFAULTS = CONFIG.defaults || {};
  const SELECTORS = CONFIG.selectors || { promo: [], ai: [], aiTextNodes: "" };

  const statusEl = document.getElementById("status");
  const activeSelectorsEl = document.getElementById("activeSelectors");
  const checkboxKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "boolean");
  const textKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "string");
  let statusTimer = 0;
  let saveTimer = 0;
  let currentSettings = { ...DEFAULTS };

  function getCustomSelectors(raw) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  function getBuiltInSelectors() {
    const promoMain = (SELECTORS.promoMain || SELECTORS.promo || [])
      .map((rule) => (rule && rule.query ? rule.query : ""))
      .filter(Boolean);

    const redBonus = (SELECTORS.redBonus || [])
      .map((rule) => (rule && rule.query ? rule.query : ""))
      .filter(Boolean);

    const advertising = (SELECTORS.advertising || [])
      .map((rule) => (rule && rule.query ? rule.query : ""))
      .filter(Boolean);

    const quickFilters = (SELECTORS.quickFilters || [])
      .map((rule) => (rule && rule.query ? rule.query : ""))
      .filter(Boolean);

    const aiButton = (SELECTORS.aiButton || SELECTORS.ai || []).filter(Boolean);
    const aiConsultation = (SELECTORS.aiConsultation || []).filter(Boolean);
    const popularSearchChips = (SELECTORS.popularSearchChips || [])
      .map((rule) => (rule && rule.query ? rule.query : ""))
      .filter(Boolean);

    return { promoMain, redBonus, advertising, quickFilters, aiButton, aiConsultation, popularSearchChips };
  }

  function renderActiveSelectors(settings) {
    if (!activeSelectorsEl) return;
    const builtIn = getBuiltInSelectors();
    const custom = getCustomSelectors(settings.customHideSelectors);

    const lines = [
      "# Promo selectors (built-in)",
      ...builtIn.promoMain,
      "",
      "# Red bonus selectors (built-in)",
      ...builtIn.redBonus,
      "",
      "# Advertising selectors (built-in)",
      ...builtIn.advertising,
      "",
      "# Quick filters selectors (built-in)",
      ...builtIn.quickFilters,
      "",
      "# Rozetka AI button selectors (built-in)",
      ...builtIn.aiButton,
      "",
      "# Rozetka AI consultation selectors (built-in)",
      ...builtIn.aiConsultation,
      "",
      "# Popular search chips selectors (built-in)",
      ...builtIn.popularSearchChips
    ];

    if (custom.length) {
      lines.push("", "# Custom selectors (your settings)", ...custom);
    }

    activeSelectorsEl.value = lines.join("\n");
  }

  function showStatus(text, variant = "success") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("status-error", variant === "error");
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      if (statusEl.textContent === text) {
        statusEl.textContent = "";
        statusEl.classList.remove("status-error");
      }
      statusTimer = 0;
    }, 1200);
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.sync) {
        resolve({ ...DEFAULTS });
        return;
      }

      chrome.storage.sync.get({ ...DEFAULTS, [STORAGE_KEY]: null }, (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ ...DEFAULTS });
          return;
        }

        const namespaced =
          stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
            ? stored[STORAGE_KEY]
            : {};
        const legacy = {};
        Object.keys(DEFAULTS).forEach((key) => {
          if (key in stored) legacy[key] = stored[key];
        });

        resolve({ ...DEFAULTS, ...legacy, ...namespaced });
      });
    });
  }

  function saveSettings(nextSettings) {
    if (!chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [STORAGE_KEY]: nextSettings }, () => {
      const runtimeError = chrome.runtime && chrome.runtime.lastError;
      if (runtimeError) {
        console.error("[RZC] Failed to save settings:", runtimeError);
        showStatus("Помилка збереження", "error");
        return;
      }
      showStatus("Збережено", "success");
    });
  }

  function scheduleSave(delayMs) {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      saveSettings(currentSettings);
    }, delayMs);
  }

  function flushPendingSave() {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
      saveSettings(currentSettings);
    }
  }

  loadSettings().then((settings) => {
    currentSettings = settings;
    renderActiveSelectors(currentSettings);

    checkboxKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = Boolean(currentSettings[key]);
      el.addEventListener("change", () => {
        currentSettings[key] = el.checked;
        scheduleSave(0);
      });
    });

    textKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.value = typeof currentSettings[key] === "string" ? currentSettings[key] : "";
      el.addEventListener("input", () => {
        currentSettings[key] = el.value;
        renderActiveSelectors(currentSettings);
        scheduleSave(250);
      });
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingSave();
    }
  });
  window.addEventListener("pagehide", flushPendingSave, { once: true });
})();
