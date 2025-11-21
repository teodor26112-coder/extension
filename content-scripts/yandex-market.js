// Extract product details on Yandex Market product pages and respond to popup requests.
const selectText = (selectors) => {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (!node) continue;
    if (node.tagName === 'META' && node.getAttribute('content')) {
      const content = node.getAttribute('content').trim();
      if (content) return content;
    }
    const text = node.textContent?.trim();
    if (text) return text;
  }
  return null;
};

const normalizePrice = (text) => {
  if (!text) return null;
  const match = text.replace(/\s|\u00A0/g, '').match(/([\d.,]+)/);
  if (!match) return null;
  const numeric = match[1]
    .replace(/\.(?=\d{3}(?:\.|$))/g, '')
    .replace(/,(?=\d{2}$)/, '.')
    .replace(/\u00A0/g, '');
  const value = parseFloat(numeric);
  return Number.isFinite(value) ? value : null;
};

const extractSkuFromLabels = () => {
  const candidates = document.querySelectorAll('div, span, li, p');
  for (const node of candidates) {
    const text = node.textContent?.trim();
    if (!text || !/(артикул|модель)/i.test(text)) continue;
    const afterLabel = text.split(/(артикул|модель)\s*:?/i)[2];
    if (afterLabel) {
      const skuMatch = afterLabel.trim().match(/[A-Za-z0-9_-]+/);
      if (skuMatch) return skuMatch[0];
    }
  }
  return null;
};

const INLINE_POPUP_ID = 'pricehunt-inline-popup-ym';

const createInlinePopup = () => {
  const wrapper = document.createElement('div');
  wrapper.id = INLINE_POPUP_ID;
  wrapper.className = 'pricehunt-inline-popup';
  wrapper.textContent = 'PriceHunt: откройте всплывающее окно, чтобы сравнить цены.';
  wrapper.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:12px',
    'margin:12px 0',
    'border:1px solid #dfe3e6',
    'border-radius:8px',
    'background:#f7f9fb',
    'color:#1f1f1f',
    'font:14px/1.4 "Inter", system-ui, -apple-system, sans-serif',
    'width:100%',
    'box-sizing:border-box'
  ].join(';');
  const icon = document.createElement('span');
  icon.textContent = '🔎';
  icon.setAttribute('aria-hidden', 'true');
  wrapper.prepend(icon);
  return wrapper;
};

const findNearestAncestor = (node, selectors = []) => {
  let current = node;
  while (current && current !== document.body) {
    if (selectors.some((selector) => current.matches?.(selector))) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const insertInlinePopup = () => {
  const priceNode = document.querySelector(
    '[data-zone-name="price"] span[aria-label], [data-zone-name="price"] span[role="text"], [data-auto="mainPrice"] span, span[itemprop="price"]'
  );

  if (!priceNode) return;

  const container =
    findNearestAncestor(priceNode, ['[data-zone-name="price"]', '[data-auto="mainPrice"]']) || priceNode.parentElement;

  if (!container) return;

  const existing = document.getElementById(INLINE_POPUP_ID);
  const popup = existing || createInlinePopup();

  if (popup.parentElement !== container) {
    priceNode.insertAdjacentElement('afterend', popup);
  }
};

const collectYandexMarketProduct = () => {
  const title = selectText([
    'h1[data-baobab-name="title"]',
    'h1[itemprop="name"]',
    'h1',
    'div[data-auto="productCardTitle"]'
  ]);

  const priceText = selectText([
    '[data-zone-name="price"] span[aria-label], [data-zone-name="price"] span[role="text"]',
    '[data-auto="mainPrice"] span',
    'span[itemprop="price"]'
  ]);
  const price = normalizePrice(priceText);

  const sku =
    selectText([
      'meta[itemprop="sku"]',
      '[data-auto="offerId"]',
      '[data-auto="sku"]',
      '[data-baobab-name="SKU"]'
    ])?.replace(/(Артикул|Модель)[:\s]*/i, '').trim() || extractSkuFromLabels();

  return {
    title: title || null,
    price: price ?? null,
    sku: sku || null,
    marketplace: 'yandex-market'
  };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'getProduct') {
    sendResponse(collectYandexMarketProduct());
  }

  if (message?.type === 'PRICE_CHECK_REQUEST') {
    const product = collectYandexMarketProduct();
    const formattedPrice =
      typeof product.price === 'number'
        ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
            product.price
          )
        : null;

    const prices = [];

    if (formattedPrice) {
      prices.push(formattedPrice);
    }

    if (product.title && formattedPrice) {
      prices.unshift(`${product.title}: ${formattedPrice}`);
    } else if (product.title) {
      prices.unshift(product.title);
    }

    sendResponse({ prices });
  }
});

const observer = new MutationObserver(() => insertInlinePopup());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    insertInlinePopup();
    observer.observe(document.body, { childList: true, subtree: true });
  });
} else {
  insertInlinePopup();
  observer.observe(document.body, { childList: true, subtree: true });
}
