// Extract product details on Ozon product pages and respond to popup requests.
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
    if (!text || !/артикул/i.test(text)) continue;
    const afterLabel = text.split(/артикул\s*:?/i)[1];
    if (afterLabel) {
      const skuMatch = afterLabel.trim().match(/[A-Za-z0-9_-]+/);
      if (skuMatch) return skuMatch[0];
    }
  }
  return null;
};

const collectOzonProduct = () => {
  const title = selectText([
    '[data-widget="webProductHeading"] h1',
    'h1[itemprop="name"]',
    'h1[data-qa="webProduct-heading"]',
    'h1'
  ]);

  const priceText = selectText([
    '[data-widget="webPrice"] span',
    '[data-widget*="Price"] span',
    '[data-widget="webSale"] span',
    'span[itemprop="price"]'
  ]);
  const price = normalizePrice(priceText);

  const sku =
    selectText([
      '[itemprop="sku"]',
      'meta[itemprop="sku"]',
      '[data-qa="webProduct-sku"]',
      '[data-widget="webProductHeading"] [data-qa="sku"]'
    ])?.replace(/Артикул[:\s]*/i, '').trim() || extractSkuFromLabels();

  return {
    title: title || null,
    price: price ?? null,
    sku: sku || null,
    marketplace: 'ozon'
  };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'getProduct') {
    sendResponse(collectOzonProduct());
  }

  if (message?.type === 'PRICE_CHECK_REQUEST') {
    const product = collectOzonProduct();
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

const INLINE_POPUP_ID = 'pricehunt-inline-popup';

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
    'margin:8px 0',
    'border:1px solid #dfe3e6',
    'border-radius:8px',
    'background:#f7f9fb',
    'color:#1f1f1f',
    'font:14px/1.4 "Inter", system-ui, -apple-system, sans-serif'
  ].join(';');
  const icon = document.createElement('span');
  icon.textContent = '🔎';
  icon.setAttribute('aria-hidden', 'true');
  wrapper.prepend(icon);
  return wrapper;
};

const insertInlinePopup = () => {
  const saleWidget = document.querySelector('[data-widget="webSale"]');
  if (!saleWidget) return;

  const topBlock = saleWidget.querySelector('.pdp_ib8');
  const priceBlock = topBlock?.nextElementSibling;

  if (!topBlock || !priceBlock || !priceBlock.classList.contains('pdp_i7b')) return;

  const existing = saleWidget.querySelector(`#${INLINE_POPUP_ID}`);
  if (existing) {
    if (existing.previousElementSibling !== topBlock) {
      topBlock.insertAdjacentElement('afterend', existing);
    }
    return;
  }

  topBlock.insertAdjacentElement('afterend', createInlinePopup());
};

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
