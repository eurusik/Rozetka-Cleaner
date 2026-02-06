(function () {
  "use strict";

  globalThis.RZC_CONFIG = {
    storageKey: "rzc_settings",
    rootClassNormalizePrice: "rzc-normalize-price",
    hiddenClass: "rzc-hidden",
    defaults: {
      hidePromoBlocks: true,
      hideRedBonusBlocks: true,
      hideAdvertisingSections: true,
      hideQuickFilters: true,
      hideRozetkaAI: true,
      hideAiConsultationBlock: true,
      hidePopularSearchChips: true,
      normalizePriceLayout: true,
      customHideSelectors: ""
    },
    selectors: {
      promoMain: [
        { query: "rz-product-tile button.red-label" },
        { query: 'rz-product-tile [data-testid="promo-price"]', closest: "button.red-label" },
        { query: "rz-red-price" },
        { query: "rz-red-price .red-price-container", closest: "rz-red-price" },
        { query: "rz-product-banner" },
        { query: "rz-product-banner .product-banner", closest: "rz-product-banner" }
      ],
      redBonus: [
        { query: "rz-tile-bonus .bonus__red", closest: "rz-tile-bonus" },
        { query: "rz-tile-bonus .red-icon", closest: "rz-tile-bonus" },
        { query: "rz-product-red-bonus" },
        { query: "rz-product-red-bonus .loyalty__red-card", closest: "rz-product-red-bonus" }
      ],
      advertising: [
        { query: 'rz-section-slider[data-testid="advertising-slider"]' },
        { query: "rz-section-slider.advertising-slider-theme" },
        { query: "rz-section-slider rz-advertising-info-btn", closest: "rz-section-slider" },
        { query: "rz-product-tile a[rel~='sponsored']", closest: "div.item, [rzscrollslideritem], [data-testid='section-slide'], li" },
        { query: "rz-product-tile a[href*='advToken=']", closest: "div.item, [rzscrollslideritem], [data-testid='section-slide'], li" },
        { query: "rz-product-tile a[href*='advSource=']", closest: "div.item, [rzscrollslideritem], [data-testid='section-slide'], li" }
      ],
      quickFilters: [
        { query: "rz-product-anchor-links" },
        { query: "rz-product-anchor-links .product-anchor-links__list-wrapper", closest: "rz-product-anchor-links" },
        { query: "rz-product-anchor-links h2.title", closest: "rz-product-anchor-links" }
      ],
      aiButton: [
        "rz-chat-bot-button-assist.right-assist",
        "rz-chat-bot-button-assist",
        "rz-chat-bot-button-assist .button-long",
        '[class*="rozetka-ai"]',
        '[id*="rozetka-ai"]',
        '[class*="chat-widget"]',
        '[id*="chat-widget"]',
        '[class*="widget"][style*="position: fixed"]',
        '[id*="widget"][style*="position: fixed"]'
      ],
      aiConsultation: [
        "rz-chat-bot-button-placeholder",
        "rz-chat-bot-button-placeholder .invitation"
      ],
      popularSearchChips: [
        { query: "div.md\\:order-1 rz-tag-list.max-three-rows", closest: "div.md\\:order-1" },
        { query: "div.md\\:order-1 rz-tag-list .tags-list", closest: "div.md\\:order-1" },
        { query: "rz-tag-list.max-three-rows", closest: "div.md\\:order-1" }
      ],
      aiTextNodes: "button, a, div, span"
    }
  };
})();
