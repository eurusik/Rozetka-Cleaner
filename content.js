(function () {
  "use strict";

  if (globalThis.__RZC_CONTENT_INIT__) return;
  globalThis.__RZC_CONTENT_INIT__ = true;

  const HIDDEN_ATTR = "data-rz-clean-hidden";
  const HIDDEN_FEATURES_ATTR = "data-rzc-hide-features";
  const PREV_DISPLAY_ATTR = "data-rzc-prev-display";
  const PREV_DISPLAY_PRIORITY_ATTR = "data-rzc-prev-display-priority";
  const PREV_VISIBILITY_ATTR = "data-rzc-prev-visibility";
  const PREV_VISIBILITY_PRIORITY_ATTR = "data-rzc-prev-visibility-priority";

  const FEATURE = {
    PROMO_MAIN: "promo-main",
    RED_BONUS: "red-bonus",
    AI_BUTTON: "ai-button",
    AI_CONSULT: "ai-consultation",
    CUSTOM: "custom"
  };

  const CLEANUP_TIMEOUT_MS = 200;
  const MAX_PENDING_ROOTS = 200;

  const CONFIG = globalThis.RZC_CONFIG || {};
  const STORAGE_KEY = CONFIG.storageKey || "rzc_settings";
  const ROOT_CLASS_NORMALIZE = CONFIG.rootClassNormalizePrice || "rzc-normalize-price";
  const HIDDEN_CLASS = CONFIG.hiddenClass || "rzc-hidden";
  const DEFAULTS = CONFIG.defaults || {
    hidePromoBlocks: true,
    hideRedBonusBlocks: true,
    hideRozetkaAI: true,
    hideAiConsultationBlock: true,
    normalizePriceLayout: true,
    customHideSelectors: ""
  };
  const SELECTORS = CONFIG.selectors || {};
  const OBSERVER_HINT_SELECTOR = [
    "rz-product-tile",
    "rz-red-price",
    "rz-product-banner",
    "rz-tile-bonus",
    "rz-product-red-bonus",
    "rz-chat-bot-button-assist",
    "rz-chat-bot-button-placeholder",
    '[data-testid="promo-price"]',
    ".red-label",
    ".red-icon",
    ".bonus__red",
    ".loyalty__red-card"
  ].join(", ");

  let currentSettings = normalizeSettings(DEFAULTS);
  let observer = null;
  let cleanupRaf = 0;
  let cleanupTimer = 0;
  const pendingRoots = new Set();
  let onStorageChanged = null;

  function parseFeatureSet(el) {
    const raw = el.getAttribute(HIDDEN_FEATURES_ATTR) || "";
    if (!raw) return new Set();
    return new Set(raw.split(",").map((part) => part.trim()).filter(Boolean));
  }

  function writeFeatureSet(el, set) {
    if (!set.size) {
      el.removeAttribute(HIDDEN_FEATURES_ATTR);
      return;
    }
    el.setAttribute(HIDDEN_FEATURES_ATTR, Array.from(set).sort().join(","));
  }

  function rememberInlineStyle(el, prop, valueAttr, priorityAttr) {
    if (el.hasAttribute(valueAttr)) return;
    const value = el.style.getPropertyValue(prop);
    const priority = el.style.getPropertyPriority(prop);
    el.setAttribute(valueAttr, value === "" ? "__empty__" : value);
    el.setAttribute(priorityAttr, priority === "" ? "__empty__" : priority);
  }

  function restoreInlineStyle(el, prop, valueAttr, priorityAttr) {
    if (!el.hasAttribute(valueAttr)) {
      el.style.removeProperty(prop);
      return;
    }

    const value = el.getAttribute(valueAttr);
    const priority = el.getAttribute(priorityAttr);
    if (value === "__empty__") {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, value, priority === "__empty__" ? "" : priority);
    }

    el.removeAttribute(valueAttr);
    el.removeAttribute(priorityAttr);
  }

  function applyHideStyles(el) {
    rememberInlineStyle(el, "display", PREV_DISPLAY_ATTR, PREV_DISPLAY_PRIORITY_ATTR);
    rememberInlineStyle(el, "visibility", PREV_VISIBILITY_ATTR, PREV_VISIBILITY_PRIORITY_ATTR);
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
  }

  function revealElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    el.removeAttribute(HIDDEN_ATTR);
    el.classList.remove(HIDDEN_CLASS);
    restoreInlineStyle(el, "display", PREV_DISPLAY_ATTR, PREV_DISPLAY_PRIORITY_ATTR);
    restoreInlineStyle(el, "visibility", PREV_VISIBILITY_ATTR, PREV_VISIBILITY_PRIORITY_ATTR);
  }

  function hideElement(el, featureId) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    const featureSet = parseFeatureSet(el);
    if (featureId) featureSet.add(featureId);
    if (!featureSet.size) return;

    writeFeatureSet(el, featureSet);
    el.setAttribute(HIDDEN_ATTR, "1");
    el.classList.add(HIDDEN_CLASS);
    applyHideStyles(el);
  }

  function removeHideFeature(el, featureId) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    const featureSet = parseFeatureSet(el);
    if (!featureSet.has(featureId)) return;
    featureSet.delete(featureId);

    if (!featureSet.size) {
      writeFeatureSet(el, featureSet);
      revealElement(el);
      return;
    }

    writeFeatureSet(el, featureSet);
    el.setAttribute(HIDDEN_ATTR, "1");
    el.classList.add(HIDDEN_CLASS);
    applyHideStyles(el);
  }

  function removeFeatureFromAll(root, featureId) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(`[${HIDDEN_FEATURES_ATTR}]`).forEach((el) => {
      removeHideFeature(el, featureId);
    });
  }

  function hideRuleSelectors(root, rules, featureId) {
    const scope = root && root.querySelectorAll ? root : document;
    let matched = false;
    rules.forEach((rule) => {
      if (!rule || !rule.query) return;
      scope.querySelectorAll(rule.query).forEach((node) => {
        matched = true;
        const removable = rule.closest ? node.closest(rule.closest) || node : node;
        hideElement(removable, featureId);
      });
    });
    return matched;
  }

  function hideSelectorList(root, selectors, featureId, extraClosestSelectors = []) {
    const scope = root && root.querySelectorAll ? root : document;
    let matched = false;
    selectors.forEach((selector) => {
      scope.querySelectorAll(selector).forEach((el) => {
        matched = true;
        hideElement(el, featureId);
        extraClosestSelectors.forEach((closestSel) => hideElement(el.closest(closestSel), featureId));
      });
    });
    return matched;
  }

  function promoRules() {
    return SELECTORS.promoMain || SELECTORS.promo || [];
  }

  function redBonusRules() {
    return SELECTORS.redBonus || [];
  }

  function aiButtonSelectors() {
    return SELECTORS.aiButton || SELECTORS.ai || [];
  }

  function aiConsultationSelectors() {
    return SELECTORS.aiConsultation || [];
  }

  function hidePromoPrices(root, settings) {
    if (!settings.hidePromoBlocks) return;
    hideRuleSelectors(root, promoRules(), FEATURE.PROMO_MAIN);
  }

  function hideRedBonusBlocks(root, settings) {
    if (!settings.hideRedBonusBlocks) return;
    hideRuleSelectors(root, redBonusRules(), FEATURE.RED_BONUS);
  }

  function hideRozetkaAIWidget(root, settings) {
    if (!settings.hideRozetkaAI) return;
    const scope = root && root.querySelectorAll ? root : document;
    const matchedBySelectors = hideSelectorList(
      root,
      aiButtonSelectors(),
      FEATURE.AI_BUTTON,
      ["rz-chat-bot-button-assist"]
    );

    if (matchedBySelectors) return;
    if (scope !== document && !(scope.textContent || "").toLowerCase().includes("rozetka ai")) return;

    const textNodes = scope.querySelectorAll(SELECTORS.aiTextNodes || "button, a, div, span");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!text.includes("rozetka ai")) return;

      const style = window.getComputedStyle(el);
      const isFloating =
        style.position === "fixed" ||
        style.position === "sticky" ||
        style.zIndex !== "auto";

      if (isFloating) {
        hideElement(el, FEATURE.AI_BUTTON);
        hideElement(el.closest("button, a, div"), FEATURE.AI_BUTTON);
      }
    });
  }

  function hideAiConsultationBlock(root, settings) {
    if (!settings.hideAiConsultationBlock) return;
    const scope = root && root.querySelectorAll ? root : document;
    const matchedBySelectors = hideSelectorList(
      root,
      aiConsultationSelectors(),
      FEATURE.AI_CONSULT,
      ["rz-chat-bot-button-placeholder"]
    );

    if (matchedBySelectors) return;

    if (scope !== document) {
      const text = (scope.textContent || "").toLowerCase();
      if (!text.includes("потрібна консультація") && !text.includes("ai-помічник")) return;
    }

    const textNodes = scope.querySelectorAll(SELECTORS.aiTextNodes || "button, a, div, span");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      const consultation =
        text.includes("потрібна консультація") ||
        text.includes("ai-помічник");
      if (!consultation) return;
      hideElement(el, FEATURE.AI_CONSULT);
      hideElement(el.closest("rz-chat-bot-button-placeholder"), FEATURE.AI_CONSULT);
    });
  }

  function runCleanup(root, settings) {
    hidePromoPrices(root, settings);
    hideRedBonusBlocks(root, settings);
    hideRozetkaAIWidget(root, settings);
    hideAiConsultationBlock(root, settings);
    hideCustomSelectors(root, settings);
  }

  function containsHintTargets(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (typeof node.matches === "function" && node.matches(OBSERVER_HINT_SELECTOR)) return true;
    if (typeof node.querySelector === "function" && node.querySelector(OBSERVER_HINT_SELECTOR)) return true;
    return false;
  }

  function isRelevantAttributeTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (typeof node.matches === "function" && node.matches(OBSERVER_HINT_SELECTOR)) return true;
    if (typeof node.closest === "function" && node.closest(OBSERVER_HINT_SELECTOR)) return true;
    return false;
  }

  function isStableHiddenByUs(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return (
      node.getAttribute(HIDDEN_ATTR) === "1" &&
      node.classList.contains(HIDDEN_CLASS) &&
      node.style.getPropertyValue("display") === "none"
    );
  }

  function flushPendingCleanup() {
    if (cleanupRaf) {
      window.cancelAnimationFrame(cleanupRaf);
      cleanupRaf = 0;
    }
    if (cleanupTimer) {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = 0;
    }

    if (!pendingRoots.size) return;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    roots.forEach((node) => runCleanup(node, currentSettings));
  }

  function scheduleCleanup(root) {
    if (!root || !root.querySelectorAll) return;

    pendingRoots.add(root);
    if (pendingRoots.size > MAX_PENDING_ROOTS) {
      pendingRoots.clear();
      pendingRoots.add(document);
    }

    if (!cleanupRaf) {
      cleanupRaf = window.requestAnimationFrame(flushPendingCleanup);
    }
    if (!cleanupTimer) {
      cleanupTimer = window.setTimeout(flushPendingCleanup, CLEANUP_TIMEOUT_MS);
    }
  }

  function initObserver() {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (!containsHintTargets(node)) continue;
            scheduleCleanup(node);
          }
          continue;
        }

        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (!isRelevantAttributeTarget(target)) continue;
          if (isStableHiddenByUs(target)) continue;
          scheduleCleanup(target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (cleanupRaf) {
      window.cancelAnimationFrame(cleanupRaf);
      cleanupRaf = 0;
    }
    if (cleanupTimer) {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = 0;
    }
    pendingRoots.clear();

    if (onStorageChanged && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      onStorageChanged = null;
    }
  }

  function readSettings() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.sync) {
        resolve(normalizeSettings(DEFAULTS));
        return;
      }

      chrome.storage.sync.get({ ...DEFAULTS, [STORAGE_KEY]: null }, (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(normalizeSettings(DEFAULTS));
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

        resolve(normalizeSettings({ ...DEFAULTS, ...legacy, ...namespaced }));
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

  function normalizeSettings(raw) {
    const merged = { ...DEFAULTS, ...(raw || {}) };
    merged.customHideSelectors = typeof merged.customHideSelectors === "string" ? merged.customHideSelectors : "";
    merged.customHideSelectorList = getCustomSelectors(merged.customHideSelectors);
    return merged;
  }

  function hideCustomSelectors(root, settings) {
    const list = settings.customHideSelectorList || [];
    if (!list.length) return;
    const scope = root && root.querySelectorAll ? root : document;

    list.forEach((selector) => {
      try {
        scope.querySelectorAll(selector).forEach((node) => hideElement(node, FEATURE.CUSTOM));
      } catch (err) {
        // Ignore invalid selectors to keep extension resilient.
      }
    });
  }

  function applyLayoutMode(settings) {
    const root = document.documentElement;
    if (settings.normalizePriceLayout) {
      root.classList.add(ROOT_CLASS_NORMALIZE);
      return;
    }
    root.classList.remove(ROOT_CLASS_NORMALIZE);
  }

  function reconcileSettings(prevSettings, nextSettings) {
    if (prevSettings.hidePromoBlocks && !nextSettings.hidePromoBlocks) {
      removeFeatureFromAll(document, FEATURE.PROMO_MAIN);
    }
    if (prevSettings.hideRedBonusBlocks && !nextSettings.hideRedBonusBlocks) {
      removeFeatureFromAll(document, FEATURE.RED_BONUS);
    }
    if (prevSettings.hideRozetkaAI && !nextSettings.hideRozetkaAI) {
      removeFeatureFromAll(document, FEATURE.AI_BUTTON);
    }
    if (prevSettings.hideAiConsultationBlock && !nextSettings.hideAiConsultationBlock) {
      removeFeatureFromAll(document, FEATURE.AI_CONSULT);
    }
    if (prevSettings.customHideSelectors !== nextSettings.customHideSelectors) {
      removeFeatureFromAll(document, FEATURE.CUSTOM);
    }
  }

  function watchSettingsChanges() {
    if (!chrome.storage || !chrome.storage.onChanged) return;

    onStorageChanged = (changes, areaName) => {
      if (areaName !== "sync") return;

      const hasNamespaced = Boolean(changes[STORAGE_KEY]);
      const hasLegacy = Object.keys(DEFAULTS).some((key) => key in changes);
      if (!hasNamespaced && !hasLegacy) return;

      readSettings().then((settings) => {
        const prevSettings = currentSettings;
        currentSettings = settings;
        reconcileSettings(prevSettings, currentSettings);
        applyLayoutMode(currentSettings);
        scheduleCleanup(document);
      });
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  readSettings().then((settings) => {
    currentSettings = settings;
    applyLayoutMode(currentSettings);
    runCleanup(document, currentSettings);
    initObserver();
    watchSettingsChanges();
    window.addEventListener("pagehide", stopObserver, { once: true });
  });
})();
