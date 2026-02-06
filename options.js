(function () {
  "use strict";

  const CONFIG = globalThis.RZC_CONFIG || {};
  const STORAGE_KEY = CONFIG.storageKey || "rzc_settings";
  const DIAGNOSTICS_STORAGE_KEY = `${STORAGE_KEY}_diagnostics`;
  const DEFAULTS = CONFIG.defaults || {};
  const SELECTORS = CONFIG.selectors || { promo: [], ai: [], aiTextNodes: "" };
  const FALLBACK_TEXT_KEYS = [
    "aiButtonTexts",
    "aiConsultationTexts",
    "popularSearchTexts",
    "advertisingTexts",
    "quickFiltersTexts"
  ].filter((key) => key in DEFAULTS);
  const CUSTOM_SELECTOR_KEY = "customHideSelectors";

  const statusEl = document.getElementById("status");
  const activeSelectorsEl = document.getElementById("activeSelectors");
  const resetFallbackBtn = document.getElementById("resetFallbackTexts");
  const resetCustomSelectorsBtn = document.getElementById("resetCustomSelectors");
  const diagnosticsSummaryEl = document.getElementById("diagnosticsSummary");
  const diagnosticsMetaEl = document.getElementById("diagnosticsMeta");
  const diagnosticsListEl = document.getElementById("diagnosticsList");
  const refreshDiagnosticsBtn = document.getElementById("refreshDiagnostics");
  const checkboxKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "boolean");
  const textKeys = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "string");
  const FEATURE_LABELS = {
    "promo-main": "Додаткова ціна “за Карткою Rozetka”",
    "red-bonus": "Бонусні блоки за оплату карткою",
    advertising: "Рекламні каруселі та рекламні картки",
    "quick-filters": "Блок “Швидкі фільтри”",
    "ai-button": "Кнопка Rozetka AI",
    "ai-consultation": "Картка “Потрібна консультація?”",
    "popular-search-chips": "Блок “Популярні запити”",
    custom: "Додаткові CSS-селектори"
  };
  const FEATURE_SETTING_KEYS = {
    "promo-main": "hidePromoBlocks",
    "red-bonus": "hideRedBonusBlocks",
    advertising: "hideAdvertisingSections",
    "quick-filters": "hideQuickFilters",
    "ai-button": "hideRozetkaAI",
    "ai-consultation": "hideAiConsultationBlock",
    "popular-search-chips": "hidePopularSearchChips",
    custom: "customHideSelectors"
  };
  let statusTimer = 0;
  let saveTimer = 0;
  let currentSettings = { ...DEFAULTS };

  function renderDiagnosticsEmpty(message) {
    if (diagnosticsSummaryEl) diagnosticsSummaryEl.textContent = message;
    if (diagnosticsMetaEl) diagnosticsMetaEl.textContent = "";
    if (diagnosticsListEl) diagnosticsListEl.innerHTML = "";
  }

  function getDiagnosticsStatusLabel(status) {
    if (status === "ok") return { text: "OK", className: "diag-badge diag-badge-ok" };
    if (status === "warning") return { text: "Перевірити", className: "diag-badge diag-badge-warn" };
    if (status === "not_on_page") return { text: "Немає на сторінці", className: "diag-badge diag-badge-info" };
    if (status === "not_configured") return { text: "Не налаштовано", className: "diag-badge diag-badge-info" };
    if (status === "stale") return { text: "Оновіть сторінку", className: "diag-badge diag-badge-warn" };
    return { text: "Неактивно", className: "diag-badge diag-badge-off" };
  }

  function isFeatureEnabledInCurrentOptions(featureId) {
    const key = FEATURE_SETTING_KEYS[featureId];
    if (!key) return false;

    if (key === "customHideSelectors") {
      return getCustomSelectors(currentSettings.customHideSelectors).length > 0;
    }

    return Boolean(currentSettings[key]);
  }

  function normalizeFeatureStatus(feature) {
    const expectedEnabled = isFeatureEnabledInCurrentOptions(feature.id);
    const rawStatus = feature.status || "disabled";

    if (expectedEnabled) {
      if (rawStatus === "disabled" || rawStatus === "not_configured") {
        return "stale";
      }
      return rawStatus;
    }

    if (feature.id === "custom") {
      return "not_configured";
    }

    if (rawStatus === "ok" || rawStatus === "warning" || rawStatus === "not_on_page") {
      return "stale";
    }
    return "disabled";
  }

  function renderDiagnostics(data) {
    if (!data || !Array.isArray(data.features)) {
      renderDiagnosticsEmpty("Відкрийте будь-яку сторінку Rozetka і оновіть її, щоб побачити статус.");
      return;
    }

    const updatedAt = typeof data.updatedAt === "number" ? new Date(data.updatedAt) : null;
    const features = data.features.map((feature) => ({
      ...feature,
      uiStatus: normalizeFeatureStatus(feature)
    }));
    const enabledCount = features.filter((f) => isFeatureEnabledInCurrentOptions(f.id)).length;
    const warningCount = features.filter((f) => f.uiStatus === "warning").length;
    const staleCount = features.filter((f) => f.uiStatus === "stale").length;
    const notOnPageCount = features.filter((f) => f.uiStatus === "not_on_page").length;

    if (diagnosticsSummaryEl) {
      if (!enabledCount) {
        diagnosticsSummaryEl.textContent = "Усі функції вимкнені або на сторінці немає елементів для перевірки.";
      } else if (staleCount > 0) {
        diagnosticsSummaryEl.textContent = "Частина даних застаріла. Відкрийте Rozetka і оновіть сторінку, потім натисніть “Оновити статус”.";
      } else if (warningCount > 0) {
        diagnosticsSummaryEl.textContent = `Є ${warningCount} пункт(и), які варто перевірити: елементи знайдені, але не були приховані.`;
      } else if (notOnPageCount > 0) {
        diagnosticsSummaryEl.textContent = "Критичних проблем не знайдено. Частини блоків просто немає на цій сторінці.";
      } else {
        diagnosticsSummaryEl.textContent = "Все виглядає добре: активні функції знаходять свої елементи.";
      }
    }

    if (diagnosticsMetaEl) {
      const host = data.host ? `Сторінка: ${data.host}` : "";
      const time = updatedAt ? `Оновлено: ${updatedAt.toLocaleString("uk-UA")}` : "";
      diagnosticsMetaEl.textContent = [host, time].filter(Boolean).join(" | ");
    }

    if (!diagnosticsListEl) return;
    diagnosticsListEl.innerHTML = "";

    features.forEach((feature) => {
      const li = document.createElement("li");
      li.className = "diag-item";

      const head = document.createElement("div");
      head.className = "diag-item-head";

      const title = document.createElement("span");
      title.className = "diag-title";
      title.textContent = FEATURE_LABELS[feature.id] || feature.id || "Невідома функція";

      const badge = document.createElement("span");
      const badgeInfo = getDiagnosticsStatusLabel(feature.uiStatus);
      badge.className = badgeInfo.className;
      badge.textContent = badgeInfo.text;

      head.appendChild(title);
      head.appendChild(badge);

      const details = document.createElement("p");
      details.className = "diag-details";
      if (feature.uiStatus === "disabled") {
        details.textContent = "Цю функцію вимкнено у блоці “Швидкі налаштування”.";
      } else if (feature.uiStatus === "not_configured") {
        details.textContent = "Додайте власні CSS-селектори в полі “Додаткові CSS-селектори для приховування”.";
      } else if (feature.uiStatus === "not_on_page") {
        details.textContent = "На поточній сторінці такого блоку немає. Це нормально.";
      } else if (feature.uiStatus === "stale") {
        details.textContent = "Статус застарів після змін у налаштуваннях. Оновіть сторінку Rozetka і натисніть “Оновити статус”.";
      } else {
        const selectorPart = `селектори: ${Number(feature.selectorMatches || 0)}`;
        const textPart =
          feature.textMatch === null || feature.textMatch === undefined
            ? "fallback-текст: -"
            : feature.textMatch
              ? "fallback-текст: знайдено"
              : "fallback-текст: не знайдено";
        const hiddenPart = `приховано: ${Number(feature.hiddenCount || 0)}`;
        details.textContent = `${selectorPart}; ${textPart}; ${hiddenPart}`;
      }

      li.appendChild(head);
      li.appendChild(details);
      diagnosticsListEl.appendChild(li);
    });
  }

  function loadDiagnostics() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.local) {
        renderDiagnosticsEmpty("Діагностика недоступна в цьому середовищі.");
        resolve(null);
        return;
      }

      chrome.storage.local.get({ [DIAGNOSTICS_STORAGE_KEY]: null }, (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          renderDiagnosticsEmpty("Не вдалося прочитати діагностику.");
          resolve(null);
          return;
        }

        const diagnostics = stored[DIAGNOSTICS_STORAGE_KEY];
        renderDiagnostics(diagnostics);
        resolve(diagnostics || null);
      });
    });
  }

  function getCustomSelectors(raw) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  function getTextPhrases(raw) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 50);
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
    const aiButtonTexts = getTextPhrases(settings.aiButtonTexts);
    const aiConsultationTexts = getTextPhrases(settings.aiConsultationTexts);
    const popularSearchTexts = getTextPhrases(settings.popularSearchTexts);
    const advertisingTexts = getTextPhrases(settings.advertisingTexts);
    const quickFiltersTexts = getTextPhrases(settings.quickFiltersTexts);

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
      ...builtIn.popularSearchChips,
      "",
      "# Запасний пошук: кнопка AI",
      ...aiButtonTexts,
      "",
      "# Запасний пошук: консультація AI",
      ...aiConsultationTexts,
      "",
      "# Запасний пошук: популярні запити",
      ...popularSearchTexts,
      "",
      "# Запасний пошук: реклама",
      ...advertisingTexts,
      "",
      "# Запасний пошук: швидкі фільтри",
      ...quickFiltersTexts
    ];

    if (custom.length) {
      lines.push("", "# Custom selectors (your settings)", ...custom);
    }

    activeSelectorsEl.value = lines.join("\n");
  }

  function applySettingsToUI(settings) {
    checkboxKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = Boolean(settings[key]);
    });

    textKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.value = typeof settings[key] === "string" ? settings[key] : "";
    });

    renderActiveSelectors(settings);
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
    applySettingsToUI(currentSettings);
    loadDiagnostics();

    checkboxKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.addEventListener("change", () => {
        currentSettings[key] = el.checked;
        scheduleSave(0);
      });
    });

    textKeys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.addEventListener("input", () => {
        currentSettings[key] = el.value;
        renderActiveSelectors(currentSettings);
        scheduleSave(250);
      });
    });

    if (resetFallbackBtn) {
      resetFallbackBtn.addEventListener("click", () => {
        FALLBACK_TEXT_KEYS.forEach((key) => {
          currentSettings[key] = typeof DEFAULTS[key] === "string" ? DEFAULTS[key] : "";
        });
        applySettingsToUI(currentSettings);
        scheduleSave(0);
      });
    }

    if (resetCustomSelectorsBtn) {
      resetCustomSelectorsBtn.addEventListener("click", () => {
        currentSettings[CUSTOM_SELECTOR_KEY] =
          typeof DEFAULTS[CUSTOM_SELECTOR_KEY] === "string" ? DEFAULTS[CUSTOM_SELECTOR_KEY] : "";
        applySettingsToUI(currentSettings);
        scheduleSave(0);
      });
    }

    if (refreshDiagnosticsBtn) {
      refreshDiagnosticsBtn.addEventListener("click", () => {
        loadDiagnostics();
      });
    }

    if (chrome.storage && chrome.storage.onChanged) {
      const onStorageChanged = (changes, areaName) => {
        if (areaName !== "local") return;
        if (!(DIAGNOSTICS_STORAGE_KEY in changes)) return;
        renderDiagnostics(changes[DIAGNOSTICS_STORAGE_KEY].newValue || null);
      };

      chrome.storage.onChanged.addListener(onStorageChanged);
      window.addEventListener(
        "pagehide",
        () => {
          chrome.storage.onChanged.removeListener(onStorageChanged);
        },
        { once: true }
      );
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingSave();
    }
  });
  window.addEventListener("pagehide", flushPendingSave, { once: true });
})();
