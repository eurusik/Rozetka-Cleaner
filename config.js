(function () {
  "use strict";

  globalThis.RZC_CONFIG = {
    storageKey: "rzc_settings",
    rootClassNormalizePrice: "rzc-normalize-price",
    hiddenClass: "rzc-hidden",
    defaults: {
      hidePromoBlocks: true,
      hideRedBonusBlocks: true,
      hideRozetkaAI: true,
      hideAiConsultationBlock: true,
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
      aiTextNodes: "button, a, div, span"
    }
  };
})();
