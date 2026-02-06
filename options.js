(function () {
  "use strict";

  const CONFIG = globalThis.RZC_CONFIG || {};
  const STORAGE_KEY = CONFIG.storageKey || "rzc_settings";
  const DEFAULTS = CONFIG.defaults || {
    hidePromoBlocks: true,
    hideRedBonusBlocks: true,
    hideRozetkaAI: true,
    hideAiConsultationBlock: true,
    normalizePriceLayout: true,
    customHideSelectors: ""
  };
  const SELECTORS = CONFIG.selectors || { promo: [], ai: [], aiTextNodes: "" };

  const statusEl = document.getElementById("status");
  const activeSelectorsEl = document.getElementById("activeSelectors");
  const checkboxKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "boolean");
  const textKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "string");

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

    const aiButton = (SELECTORS.aiButton || SELECTORS.ai || []).filter(Boolean);
    const aiConsultation = (SELECTORS.aiConsultation || []).filter(Boolean);
    return { promoMain, redBonus, aiButton, aiConsultation };
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
      "# Rozetka AI button selectors (built-in)",
      ...builtIn.aiButton,
      "",
      "# Rozetka AI consultation selectors (built-in)",
      ...builtIn.aiConsultation
    ];

    if (custom.length) {
      lines.push("", "# Custom selectors (your settings)", ...custom);
    }

    activeSelectorsEl.value = lines.join("\n");
  }

  function showStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    window.setTimeout(() => {
      if (statusEl.textContent === text) statusEl.textContent = "";
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
      if (chrome.runtime && chrome.runtime.lastError) return;
      showStatus("Збережено");
    });
  }

  loadSettings().then((settings) => {
    renderActiveSelectors(settings);

    checkboxKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = Boolean(settings[key]);
      el.addEventListener("change", () => {
        settings[key] = el.checked;
        saveSettings(settings);
      });
    });

    textKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.value = typeof settings[key] === "string" ? settings[key] : "";
      el.addEventListener("input", () => {
        settings[key] = el.value;
        renderActiveSelectors(settings);
        saveSettings(settings);
      });
    });
  });
})();
