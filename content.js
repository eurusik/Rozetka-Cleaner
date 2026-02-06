(function () {
  "use strict";

  const HIDDEN_ATTR = "data-rz-clean-hidden";
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

  function hideElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    el.setAttribute(HIDDEN_ATTR, "1");
    el.classList.add(HIDDEN_CLASS);
    // Inline fallback: some dynamic renders can drop classes.
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
  }

  function hideRuleSelectors(root, rules) {
    const scope = root && root.querySelectorAll ? root : document;
    rules.forEach((rule) => {
      if (!rule || !rule.query) return;
      scope.querySelectorAll(rule.query).forEach((node) => {
        const removable = rule.closest ? node.closest(rule.closest) || node : node;
        hideElement(removable);
      });
    });
  }

  function hideSelectorList(root, selectors, extraClosestSelectors = []) {
    const scope = root && root.querySelectorAll ? root : document;
    selectors.forEach((selector) => {
      scope.querySelectorAll(selector).forEach((el) => {
        hideElement(el);
        extraClosestSelectors.forEach((closestSel) => hideElement(el.closest(closestSel)));
      });
    });
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
    hideRuleSelectors(root, promoRules());
  }

  function hideRedBonusBlocks(root, settings) {
    if (!settings.hideRedBonusBlocks) return;
    hideRuleSelectors(root, redBonusRules());
  }

  function hideRozetkaAIWidget(root, settings) {
    if (!settings.hideRozetkaAI) return;
    const scope = root && root.querySelectorAll ? root : document;

    aiButtonSelectors().forEach((selector) => {
      scope.querySelectorAll(selector).forEach((el) => {
        const text = (el.textContent || "").toLowerCase();
        if (
          selector.startsWith("rz-chat-bot-button-assist") ||
          text.includes("rozetka ai")
        ) {
          hideElement(el);
          hideElement(el.closest("rz-chat-bot-button-assist"));
        }
      });
    });

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
        hideElement(el);
        hideElement(el.closest("button, a, div"));
      }
    });
  }

  function hideAiConsultationBlock(root, settings) {
    if (!settings.hideAiConsultationBlock) return;
    hideSelectorList(root, aiConsultationSelectors(), ["rz-chat-bot-button-placeholder"]);

    const scope = root && root.querySelectorAll ? root : document;
    const textNodes = scope.querySelectorAll(SELECTORS.aiTextNodes || "button, a, div, span");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      const consultation =
        text.includes("потрібна консультація") ||
        text.includes("ai-помічник");
      if (!consultation) return;
      hideElement(el);
      hideElement(el.closest("rz-chat-bot-button-placeholder"));
    });
  }

  function runCleanup(root, settings) {
    hidePromoPrices(root, settings);
    hideRedBonusBlocks(root, settings);
    hideRozetkaAIWidget(root, settings);
    hideAiConsultationBlock(root, settings);
    hideCustomSelectors(root, settings);
  }

  function initObserver(settings) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          runCleanup(node, settings);
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function readSettings() {
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

  function getCustomSelectors(raw) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  function hideCustomSelectors(root, settings) {
    const list = getCustomSelectors(settings.customHideSelectors);
    if (!list.length) return;
    const scope = root && root.querySelectorAll ? root : document;

    list.forEach((selector) => {
      try {
        scope.querySelectorAll(selector).forEach((node) => hideElement(node));
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

  readSettings().then((settings) => {
    applyLayoutMode(settings);
    runCleanup(document, settings);
    initObserver(settings);
  });
})();
