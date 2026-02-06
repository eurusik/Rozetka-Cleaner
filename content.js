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
  const STYLE_DIRTY_ATTR = "data-rzc-style-dirty";

  const FEATURE = {
    PROMO_MAIN: "promo-main",
    RED_BONUS: "red-bonus",
    ADVERTISING: "advertising",
    QUICK_FILTERS: "quick-filters",
    AI_BUTTON: "ai-button",
    AI_CONSULT: "ai-consultation",
    POPULAR_SEARCH_CHIPS: "popular-search-chips",
    CUSTOM: "custom"
  };

  const CLEANUP_TIMEOUT_MS = 200;
  const MAX_PENDING_ROOTS = 200;
  const SETTINGS_SYNC_DEBOUNCE_MS = 120;

  const CONFIG = globalThis.RZC_CONFIG || {};
  const STORAGE_KEY = CONFIG.storageKey || "rzc_settings";
  const DIAGNOSTICS_STORAGE_KEY = `${STORAGE_KEY}_diagnostics`;
  const DIAGNOSTICS_DEBOUNCE_MS = 450;
  const ROOT_CLASS_NORMALIZE = CONFIG.rootClassNormalizePrice || "rzc-normalize-price";
  const HIDDEN_CLASS = CONFIG.hiddenClass || "rzc-hidden";
  const DEFAULTS = CONFIG.defaults || {};
  const SELECTORS = CONFIG.selectors || {};
  const OBSERVER_HINT_SELECTOR = [
    "rz-product-tile",
    "rz-red-price",
    "rz-product-banner",
    "rz-tile-bonus",
    "rz-product-red-bonus",
    "rz-section-slider",
    "rz-product-anchor-links",
    "rz-tile-info",
    "rz-chat-bot-button-assist",
    "rz-chat-bot-button-placeholder",
    "rz-tag-list",
    '[data-testid="advertising-slider"]',
    '[data-testid="promo-price"]',
    ".red-label",
    ".red-icon",
    ".bonus__red",
    ".loyalty__red-card",
    ".advertising-slider-theme",
    ".product-anchor-links__list-wrapper",
    ".tags-list"
  ].join(", ");
  const HINT_TAGS = new Set([
    "RZ-PRODUCT-TILE",
    "RZ-RED-PRICE",
    "RZ-PRODUCT-BANNER",
    "RZ-TILE-BONUS",
    "RZ-PRODUCT-RED-BONUS",
    "RZ-SECTION-SLIDER",
    "RZ-PRODUCT-ANCHOR-LINKS",
    "RZ-TILE-INFO",
    "RZ-CHAT-BOT-BUTTON-ASSIST",
    "RZ-CHAT-BOT-BUTTON-PLACEHOLDER",
    "RZ-TAG-LIST"
  ]);
  const HINT_CLASSES = [
    "red-label",
    "red-icon",
    "bonus__red",
    "loyalty__red-card",
    "advertising-slider-theme",
    "product-anchor-links__list-wrapper",
    "tags-list",
    "max-three-rows"
  ];

  let currentSettings = normalizeSettings(DEFAULTS);
  let observer = null;
  let cleanupRaf = 0;
  let cleanupTimer = 0;
  let settingsSyncTimer = 0;
  let diagnosticsTimer = 0;
  const pendingRoots = new Set();
  let onStorageChanged = null;
  const internalStyleWriteCounts = new WeakMap();

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

  function safeQueryAll(scope, selector) {
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    try {
      return scope.querySelectorAll(selector);
    } catch (err) {
      return [];
    }
  }

  function getTextList(raw, limit = 50) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, limit);
  }

  function textContainsAny(text, list) {
    if (!text || !list || !list.length) return false;
    const normalized = String(text).toLowerCase();
    return list.some((needle) => normalized.includes(needle));
  }

  function markInternalStyleWrite(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    const prevCount = internalStyleWriteCounts.get(el) || 0;
    internalStyleWriteCounts.set(el, prevCount + 1);
  }

  function consumeInternalStyleWrite(el) {
    const prevCount = internalStyleWriteCounts.get(el) || 0;
    if (!prevCount) return false;
    if (prevCount === 1) {
      internalStyleWriteCounts.delete(el);
      return true;
    }
    internalStyleWriteCounts.set(el, prevCount - 1);
    return true;
  }

  function clearStyleSnapshot(el) {
    el.removeAttribute(PREV_DISPLAY_ATTR);
    el.removeAttribute(PREV_DISPLAY_PRIORITY_ATTR);
    el.removeAttribute(PREV_VISIBILITY_ATTR);
    el.removeAttribute(PREV_VISIBILITY_PRIORITY_ATTR);
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
      markInternalStyleWrite(el);
      el.style.removeProperty(prop);
      return;
    }

    const value = el.getAttribute(valueAttr);
    const priority = el.getAttribute(priorityAttr);
    if (value === "__empty__") {
      markInternalStyleWrite(el);
      el.style.removeProperty(prop);
    } else {
      markInternalStyleWrite(el);
      el.style.setProperty(prop, value, priority === "__empty__" ? "" : priority);
    }

    el.removeAttribute(valueAttr);
    el.removeAttribute(priorityAttr);
  }

  function applyHideStyles(el) {
    rememberInlineStyle(el, "display", PREV_DISPLAY_ATTR, PREV_DISPLAY_PRIORITY_ATTR);
    rememberInlineStyle(el, "visibility", PREV_VISIBILITY_ATTR, PREV_VISIBILITY_PRIORITY_ATTR);
    markInternalStyleWrite(el);
    el.style.setProperty("display", "none", "important");
    markInternalStyleWrite(el);
    el.style.setProperty("visibility", "hidden", "important");
  }

  function revealElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    el.removeAttribute(HIDDEN_ATTR);
    el.classList.remove(HIDDEN_CLASS);
    const isDirty = el.getAttribute(STYLE_DIRTY_ATTR) === "1";
    el.removeAttribute(STYLE_DIRTY_ATTR);

    // If site changed inline styles while hidden, avoid restoring stale snapshot values.
    if (isDirty) {
      clearStyleSnapshot(el);
      markInternalStyleWrite(el);
      el.style.removeProperty("display");
      markInternalStyleWrite(el);
      el.style.removeProperty("visibility");
      return;
    }

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
      safeQueryAll(scope, rule.query).forEach((node) => {
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
      safeQueryAll(scope, selector).forEach((el) => {
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

  function advertisingRules() {
    return SELECTORS.advertising || [];
  }

  function quickFiltersRules() {
    return SELECTORS.quickFilters || [];
  }

  function aiButtonSelectors() {
    return SELECTORS.aiButton || SELECTORS.ai || [];
  }

  function aiConsultationSelectors() {
    return SELECTORS.aiConsultation || [];
  }

  function popularSearchChipsRules() {
    return SELECTORS.popularSearchChips || [];
  }

  function countUniqueMatchesByRules(scope, rules) {
    const nodes = new Set();
    rules.forEach((rule) => {
      if (!rule || !rule.query) return;
      safeQueryAll(scope, rule.query).forEach((el) => nodes.add(el));
    });
    return nodes.size;
  }

  function countUniqueMatchesBySelectors(scope, selectors) {
    const nodes = new Set();
    selectors.forEach((selector) => {
      safeQueryAll(scope, selector).forEach((el) => nodes.add(el));
    });
    return nodes.size;
  }

  function countHiddenByFeature(scope, featureId) {
    let count = 0;
    safeQueryAll(scope, `[${HIDDEN_FEATURES_ATTR}]`).forEach((el) => {
      const featureSet = parseFeatureSet(el);
      if (featureSet.has(featureId)) count += 1;
    });
    return count;
  }

  function hasTextFallbackSignal(pageText, phrases) {
    if (!phrases || !phrases.length) return null;
    return phrases.some((needle) => pageText.includes(needle));
  }

  function getDiagnosticsFeatureEntries(settings, scope) {
    const customSelectors = settings.customHideSelectorList || [];
    const pageText = (scope.textContent || "").toLowerCase();

    return [
      {
        id: FEATURE.PROMO_MAIN,
        enabled: Boolean(settings.hidePromoBlocks),
        selectorMatches: countUniqueMatchesByRules(scope, promoRules()),
        textMatch: null
      },
      {
        id: FEATURE.RED_BONUS,
        enabled: Boolean(settings.hideRedBonusBlocks),
        selectorMatches: countUniqueMatchesByRules(scope, redBonusRules()),
        textMatch: null
      },
      {
        id: FEATURE.ADVERTISING,
        enabled: Boolean(settings.hideAdvertisingSections),
        selectorMatches: countUniqueMatchesByRules(scope, advertisingRules()),
        textMatch: hasTextFallbackSignal(pageText, settings.advertisingTextList)
      },
      {
        id: FEATURE.QUICK_FILTERS,
        enabled: Boolean(settings.hideQuickFilters),
        selectorMatches: countUniqueMatchesByRules(scope, quickFiltersRules()),
        textMatch: hasTextFallbackSignal(pageText, settings.quickFiltersTextList)
      },
      {
        id: FEATURE.AI_BUTTON,
        enabled: Boolean(settings.hideRozetkaAI),
        selectorMatches: countUniqueMatchesBySelectors(scope, aiButtonSelectors()),
        textMatch: hasTextFallbackSignal(pageText, settings.aiButtonTextList)
      },
      {
        id: FEATURE.AI_CONSULT,
        enabled: Boolean(settings.hideAiConsultationBlock),
        selectorMatches: countUniqueMatchesBySelectors(scope, aiConsultationSelectors()),
        textMatch: hasTextFallbackSignal(pageText, settings.aiConsultationTextList)
      },
      {
        id: FEATURE.POPULAR_SEARCH_CHIPS,
        enabled: Boolean(settings.hidePopularSearchChips),
        selectorMatches: countUniqueMatchesByRules(scope, popularSearchChipsRules()),
        textMatch: hasTextFallbackSignal(pageText, settings.popularSearchTextList)
      },
      {
        id: FEATURE.CUSTOM,
        enabled: customSelectors.length > 0,
        selectorMatches: countUniqueMatchesBySelectors(scope, customSelectors),
        textMatch: null
      }
    ].map((entry) => {
      const hiddenCount = countHiddenByFeature(scope, entry.id);
      const hasSelectorOrTextSignal =
        entry.selectorMatches > 0 ||
        (entry.textMatch !== null && entry.textMatch === true);
      let status = entry.id === FEATURE.CUSTOM ? "not_configured" : "disabled";

      if (entry.enabled) {
        if (hasSelectorOrTextSignal && hiddenCount === 0) {
          // Something matching was found but nothing got hidden.
          status = "warning";
        } else if (!hasSelectorOrTextSignal && hiddenCount === 0) {
          // This page likely just doesn't contain this block type.
          status = "not_on_page";
        } else {
          status = "ok";
        }
      }

      return {
        ...entry,
        hiddenCount,
        status
      };
    });
  }

  function writeDiagnosticsSnapshot(snapshot) {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.set({ [DIAGNOSTICS_STORAGE_KEY]: snapshot }, () => {});
  }

  function flushDiagnostics(settings) {
    diagnosticsTimer = 0;
    const scope = document;
    const features = getDiagnosticsFeatureEntries(settings, scope);
    const enabledCount = features.filter((item) => item.enabled).length;
    const okCount = features.filter((item) => item.enabled && item.status === "ok").length;
    const warningCount = features.filter((item) => item.enabled && item.status === "warning").length;
    const notOnPageCount = features.filter((item) => item.enabled && item.status === "not_on_page").length;

    writeDiagnosticsSnapshot({
      updatedAt: Date.now(),
      url: location.href,
      host: location.host,
      summary: {
        enabledCount,
        okCount,
        warningCount,
        notOnPageCount
      },
      features
    });
  }

  function scheduleDiagnostics(settings) {
    if (!chrome.storage || !chrome.storage.local) return;
    if (diagnosticsTimer) window.clearTimeout(diagnosticsTimer);
    diagnosticsTimer = window.setTimeout(() => flushDiagnostics(settings), DIAGNOSTICS_DEBOUNCE_MS);
  }

  function hidePromoPrices(root, settings) {
    if (!settings.hidePromoBlocks) return;
    hideRuleSelectors(root, promoRules(), FEATURE.PROMO_MAIN);
  }

  function hideRedBonusBlocks(root, settings) {
    if (!settings.hideRedBonusBlocks) return;
    hideRuleSelectors(root, redBonusRules(), FEATURE.RED_BONUS);
  }

  function hideAdvertisingSections(root, settings) {
    if (!settings.hideAdvertisingSections) return;
    const scope = root && root.querySelectorAll ? root : document;
    const matchedBySelectors = hideRuleSelectors(root, advertisingRules(), FEATURE.ADVERTISING);

    function getAdCardContainer(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const wrapper = node.closest("div.item, [rzscrollslideritem], [data-testid='section-slide'], li");
      if (wrapper) return wrapper;
      return node.closest("rz-product-tile");
    }

    function promoteAdNodesToCardContainers() {
      // If any descendant was hidden as ad, hide the whole card wrapper/tile as well.
      // This prevents "broken" cards where image/title is gone but price remains.
      const markedAdNodes = safeQueryAll(scope, `[${HIDDEN_FEATURES_ATTR}*="${FEATURE.ADVERTISING}"]`);
      markedAdNodes.forEach((node) => {
        const featureSet = parseFeatureSet(node);
        if (!featureSet.has(FEATURE.ADVERTISING)) return;
        const container = getAdCardContainer(node);
        if (container) hideElement(container, FEATURE.ADVERTISING);
      });
    }

    promoteAdNodesToCardContainers();
    if (matchedBySelectors) return;

    if (scope !== document && !textContainsAny(scope.textContent || "", settings.advertisingTextList)) return;

    const sectionTitles = safeQueryAll(scope, "rz-section-slider .title, rz-section-slider h2");
    sectionTitles.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.advertisingTextList)) return;
      hideElement(el.closest("rz-section-slider"), FEATURE.ADVERTISING);
    });

    const adInfoNodes = safeQueryAll(scope, "rz-product-tile rz-tile-info, rz-tile-info");
    adInfoNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.advertisingTextList)) return;
      hideElement(getAdCardContainer(el), FEATURE.ADVERTISING);
    });

    const sponsoredLinks = safeQueryAll(
      scope,
      "rz-product-tile a[rel~='sponsored'], rz-product-tile a[href*='advToken='], rz-product-tile a[href*='advSource=']"
    );
    sponsoredLinks.forEach((el) => {
      hideElement(getAdCardContainer(el), FEATURE.ADVERTISING);
    });

    promoteAdNodesToCardContainers();
  }

  function hideQuickFilters(root, settings) {
    if (!settings.hideQuickFilters) return;
    const scope = root && root.querySelectorAll ? root : document;
    const matchedBySelectors = hideRuleSelectors(root, quickFiltersRules(), FEATURE.QUICK_FILTERS);
    if (matchedBySelectors) return;

    if (scope !== document && !textContainsAny(scope.textContent || "", settings.quickFiltersTextList)) return;

    const sectionTitles = safeQueryAll(scope, "rz-product-anchor-links .title, rz-product-anchor-links h2");
    sectionTitles.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.quickFiltersTextList)) return;
      hideElement(el.closest("rz-product-anchor-links"), FEATURE.QUICK_FILTERS);
    });
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
    if (scope !== document && !textContainsAny(scope.textContent || "", settings.aiButtonTextList)) return;

    const textNodes = safeQueryAll(scope, SELECTORS.aiTextNodes || "button, a, div, span");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.aiButtonTextList)) return;

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

    if (scope !== document && !textContainsAny(scope.textContent || "", settings.aiConsultationTextList)) return;

    const textNodes = safeQueryAll(scope, SELECTORS.aiTextNodes || "button, a, div, span");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.aiConsultationTextList)) return;
      hideElement(el, FEATURE.AI_CONSULT);
      hideElement(el.closest("rz-chat-bot-button-placeholder"), FEATURE.AI_CONSULT);
    });
  }

  function hidePopularSearchChips(root, settings) {
    if (!settings.hidePopularSearchChips) return;
    const scope = root && root.querySelectorAll ? root : document;
    const matchedBySelectors = hideRuleSelectors(root, popularSearchChipsRules(), FEATURE.POPULAR_SEARCH_CHIPS);

    if (matchedBySelectors) return;

    if (scope !== document && !textContainsAny(scope.textContent || "", settings.popularSearchTextList)) return;

    const textNodes = safeQueryAll(scope, "div, p, span, h2, h3, h4");
    textNodes.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!textContainsAny(text, settings.popularSearchTextList)) return;

      const parent = el.parentElement;
      if (parent && safeQueryAll(parent, "rz-tag-list, .tags-list").length) {
        hideElement(parent, FEATURE.POPULAR_SEARCH_CHIPS);
        return;
      }

      const block = el.closest("div");
      if (block && safeQueryAll(block, "rz-tag-list, .tags-list").length) {
        hideElement(block, FEATURE.POPULAR_SEARCH_CHIPS);
      }
    });
  }

  function runCleanup(root, settings) {
    hidePromoPrices(root, settings);
    hideRedBonusBlocks(root, settings);
    hideAdvertisingSections(root, settings);
    hideQuickFilters(root, settings);
    hideRozetkaAIWidget(root, settings);
    hideAiConsultationBlock(root, settings);
    hidePopularSearchChips(root, settings);
    hideCustomSelectors(root, settings);
    scheduleDiagnostics(settings);
  }

  function containsHintTargets(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (isPotentialHintFast(node)) return true;
    if (typeof node.querySelector === "function" && safeQueryAll(node, OBSERVER_HINT_SELECTOR).length > 0) return true;
    return false;
  }

  function isRelevantAttributeTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (isPotentialHintFast(node)) return true;
    if (typeof node.closest === "function" && node.closest(OBSERVER_HINT_SELECTOR)) return true;
    return false;
  }

  function hasHintClass(node) {
    if (!node || !node.classList) return false;
    for (const className of HINT_CLASSES) {
      if (node.classList.contains(className)) return true;
    }
    return false;
  }

  function isPotentialHintFast(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.hasAttribute(HIDDEN_FEATURES_ATTR) || node.hasAttribute(HIDDEN_ATTR)) return true;
    if (HINT_TAGS.has(node.tagName)) return true;
    if (hasHintClass(node)) return true;
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
          if (mutation.attributeName === "style") {
            if (consumeInternalStyleWrite(target)) {
              continue;
            }
            if (target.getAttribute(HIDDEN_FEATURES_ATTR)) {
              target.setAttribute(STYLE_DIRTY_ATTR, "1");
            }
          }

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
    if (settingsSyncTimer) {
      window.clearTimeout(settingsSyncTimer);
      settingsSyncTimer = 0;
    }
    if (diagnosticsTimer) {
      window.clearTimeout(diagnosticsTimer);
      flushDiagnostics(currentSettings);
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
    merged.aiButtonTexts = typeof merged.aiButtonTexts === "string" ? merged.aiButtonTexts : "";
    merged.aiConsultationTexts = typeof merged.aiConsultationTexts === "string" ? merged.aiConsultationTexts : "";
    merged.popularSearchTexts = typeof merged.popularSearchTexts === "string" ? merged.popularSearchTexts : "";
    merged.advertisingTexts = typeof merged.advertisingTexts === "string" ? merged.advertisingTexts : "";
    merged.quickFiltersTexts = typeof merged.quickFiltersTexts === "string" ? merged.quickFiltersTexts : "";
    merged.customHideSelectorList = getCustomSelectors(merged.customHideSelectors);
    merged.aiButtonTextList = getTextList(merged.aiButtonTexts);
    merged.aiConsultationTextList = getTextList(merged.aiConsultationTexts);
    merged.popularSearchTextList = getTextList(merged.popularSearchTexts);
    merged.advertisingTextList = getTextList(merged.advertisingTexts);
    merged.quickFiltersTextList = getTextList(merged.quickFiltersTexts);
    return merged;
  }

  function hideCustomSelectors(root, settings) {
    const list = settings.customHideSelectorList || [];
    if (!list.length) return;
    const scope = root && root.querySelectorAll ? root : document;

    list.forEach((selector) => {
      safeQueryAll(scope, selector).forEach((node) => hideElement(node, FEATURE.CUSTOM));
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
    if (prevSettings.hideAdvertisingSections && !nextSettings.hideAdvertisingSections) {
      removeFeatureFromAll(document, FEATURE.ADVERTISING);
    }
    if (prevSettings.hideQuickFilters && !nextSettings.hideQuickFilters) {
      removeFeatureFromAll(document, FEATURE.QUICK_FILTERS);
    }
    if (prevSettings.hideRozetkaAI && !nextSettings.hideRozetkaAI) {
      removeFeatureFromAll(document, FEATURE.AI_BUTTON);
    }
    if (prevSettings.hideAiConsultationBlock && !nextSettings.hideAiConsultationBlock) {
      removeFeatureFromAll(document, FEATURE.AI_CONSULT);
    }
    if (prevSettings.hidePopularSearchChips && !nextSettings.hidePopularSearchChips) {
      removeFeatureFromAll(document, FEATURE.POPULAR_SEARCH_CHIPS);
    }
    if (prevSettings.customHideSelectors !== nextSettings.customHideSelectors) {
      removeFeatureFromAll(document, FEATURE.CUSTOM);
    }
    if (prevSettings.aiButtonTexts !== nextSettings.aiButtonTexts) {
      removeFeatureFromAll(document, FEATURE.AI_BUTTON);
    }
    if (prevSettings.aiConsultationTexts !== nextSettings.aiConsultationTexts) {
      removeFeatureFromAll(document, FEATURE.AI_CONSULT);
    }
    if (prevSettings.popularSearchTexts !== nextSettings.popularSearchTexts) {
      removeFeatureFromAll(document, FEATURE.POPULAR_SEARCH_CHIPS);
    }
    if (prevSettings.advertisingTexts !== nextSettings.advertisingTexts) {
      removeFeatureFromAll(document, FEATURE.ADVERTISING);
    }
    if (prevSettings.quickFiltersTexts !== nextSettings.quickFiltersTexts) {
      removeFeatureFromAll(document, FEATURE.QUICK_FILTERS);
    }
  }

  function watchSettingsChanges() {
    if (!chrome.storage || !chrome.storage.onChanged) return;

    function scheduleSettingsRefresh() {
      if (settingsSyncTimer) window.clearTimeout(settingsSyncTimer);
      settingsSyncTimer = window.setTimeout(() => {
        settingsSyncTimer = 0;
        readSettings().then((settings) => {
          const prevSettings = currentSettings;
          currentSettings = settings;
          reconcileSettings(prevSettings, currentSettings);
          applyLayoutMode(currentSettings);
          scheduleCleanup(document);
        });
      }, SETTINGS_SYNC_DEBOUNCE_MS);
    }

    onStorageChanged = (changes, areaName) => {
      if (areaName !== "sync") return;

      const hasNamespaced = Boolean(changes[STORAGE_KEY]);
      const hasLegacy = Object.keys(DEFAULTS).some((key) => key in changes);
      if (!hasNamespaced && !hasLegacy) return;
      scheduleSettingsRefresh();
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
