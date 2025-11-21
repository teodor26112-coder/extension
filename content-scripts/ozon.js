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
const MARKETPLACE_LABELS = {
  ozon: 'Ozon',
  wildberries: 'Wildberries',
  'yandex-market': 'Яндекс Маркет'
};

const createInlinePopup = () => {
  const wrapper = document.createElement('div');
  wrapper.id = INLINE_POPUP_ID;
  wrapper.className = 'pricehunt-inline-popup';
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
    'font:14px/1.4 "Inter", system-ui, -apple-system, sans-serif',
    'width:100%',
    'box-sizing:border-box'
  ].join(';');
  const icon = document.createElement('span');
  icon.textContent = '🔎';
  icon.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  content.style.cssText = 'display:flex; flex-direction:column; gap:6px; width:100%;';

  const title = document.createElement('div');
  title.textContent = 'PriceHunt — выгоднее рядом:';
  title.style.cssText = 'font-weight:600; color:#111827;';

  const status = document.createElement('div');
  status.className = 'pricehunt-inline-status';
  status.textContent = 'Ищем более выгодные цены...';
  status.style.cssText = 'color:#374151;';

  const list = document.createElement('ul');
  list.className = 'pricehunt-inline-list';
  list.style.cssText = 'padding-left:16px; margin:0; color:#111827; display:flex; flex-direction:column; gap:4px;';

  content.appendChild(title);
  content.appendChild(status);
  content.appendChild(list);

  wrapper.append(icon, content);
  return wrapper;
};

const renderInlineStatus = (popup, message, isError = false) => {
  const status = popup.querySelector('.pricehunt-inline-status');
  const list = popup.querySelector('.pricehunt-inline-list');
  if (list) list.innerHTML = '';
  if (status) {
    status.textContent = message;
    status.style.color = isError ? '#b91c1c' : '#374151';
  }
};

const renderInlineEntries = (popup, entries) => {
  const list = popup.querySelector('.pricehunt-inline-list');
  const status = popup.querySelector('.pricehunt-inline-status');
  if (!list || !status) return;
  list.innerHTML = '';
  status.textContent = 'Нашли более выгодные предложения:';
  status.style.color = '#374151';

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${MARKETPLACE_LABELS[entry.marketplace] || entry.marketplace}: ${
      typeof entry.price === 'number'
        ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(entry.price)
        : '—'
    }`;
    list.appendChild(li);
  });
};

let inlineFetchInFlight = false;
let inlineDataLoaded = false;

const sendRuntimeMessageWithTimeout = (payload, timeout = 10000) =>
  new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('Timeout waiting for background response'));
    }, timeout);

    chrome.runtime.sendMessage(payload, (res) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(res);
    });
  });

let lastInlineQuery = null;

const fetchInlinePrices = async (popup) => {
  const product = collectOzonProduct();
  const searchQuery = product?.title || product?.sku;

  if (searchQuery && searchQuery !== lastInlineQuery) {
    inlineDataLoaded = false;
    inlineFetchInFlight = false;
    lastInlineQuery = searchQuery;
  }

  if (inlineDataLoaded || inlineFetchInFlight) return;
  inlineFetchInFlight = true;

  if (!searchQuery) {
    renderInlineStatus(popup, 'Не удалось определить товар', true);
    inlineFetchInFlight = false;
    return;
  }

  renderInlineStatus(popup, 'Ищем более выгодные цены...');

  try {
    const response = await sendRuntimeMessageWithTimeout({
      action: 'comparePrices',
      title: product.title,
      sku: product.sku,
      fallbackProduct: product
    });

    if (!response?.success) {
      renderInlineStatus(popup, response?.error || 'Не удалось получить цены', true);
      inlineDataLoaded = true;
      inlineFetchInFlight = false;
      return;
    }

    const currentPrice = typeof product.price === 'number' ? product.price : null;
    const entries = response.data?.entries || [];
    const cheaper = entries.filter((entry) =>
      typeof entry.price === 'number' && currentPrice !== null ? entry.price < currentPrice : true
    );

    if (!cheaper.length) {
      renderInlineStatus(popup, 'Более выгодные предложения не найдены');
    } else {
      renderInlineEntries(popup, cheaper.slice(0, 3));
    }

    inlineDataLoaded = true;
  } catch (error) {
    renderInlineStatus(popup, 'Ошибка при получении цен', true);
    inlineDataLoaded = true;
  } finally {
    inlineFetchInFlight = false;
  }
};

const findAllByText = (phrases, root = document) => {
  const needles = Array.isArray(phrases) ? phrases : [phrases];
  const matches = [];
  const candidates = root.querySelectorAll('div, section, article, p, span, button, a, h2, h3, h4, h5, h6');

  for (const node of candidates) {
    const text = node.textContent?.toLowerCase();
    if (!text) continue;
    if (needles.some((needle) => text.includes(needle.toLowerCase()))) {
      matches.push(node);
    }
  }

  if (matches.length) return matches;

  for (const needle of needles) {
    const results = document.evaluate(
      `//*[contains(translate(normalize-space(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ', 'abcdefghijklmnopqrstuvwxyzёйцукенгшщзхъфывапролджэячсмитьбю'), "${needle.toLowerCase()}")]`,
      root,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < results.snapshotLength; i += 1) {
      matches.push(results.snapshotItem(i));
    }
  }

  return matches;
};

const findNearestAncestor = (node, selectors = []) => {
  let current = node;
  while (current && current !== document.body) {
    for (const selector of selectors) {
      if (current.matches?.(selector)) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return null;
};

const isVisible = (node) => {
  if (!node || !(node instanceof Element)) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const insertInlinePopup = () => {
  const priceBlocks = [
    '[data-widget="webPrice"]',
    '[data-widget="webPriceMain"]',
    '[data-widget*="Price"]',
    'section[data-widget*="Price"]',
    'div[data-widget*="Price"]'
  ]
    .map((selector) => Array.from(document.querySelectorAll(selector)))
    .flat()
    .filter(isVisible);

  const priceTextBlocks = priceBlocks.length
    ? []
    : findAllByText(['₽', 'цена', 'руб.']).filter(isVisible);

  const targetPrice = priceBlocks[0] || priceTextBlocks[0];
  if (!targetPrice) return;

  const columnContainer =
    findNearestAncestor(targetPrice, [
      '[data-widget*="StickyOffer"]',
      '[data-widget*="BuyBox"]',
      '[class*="sale-column"]',
      'aside',
      'section[data-widget]',
      'div[data-widget]'
    ]) || targetPrice.parentElement;

  if (!columnContainer) return;

  const existing = document.getElementById(INLINE_POPUP_ID);
  const popup = existing || createInlinePopup();

  const insertAfterPrice = () => {
    const anchor = targetPrice.closest('[data-widget*="Price"], section, div') || targetPrice;
    if (!anchor || !anchor.parentElement) return;

    if (anchor.nextElementSibling === popup && popup.parentElement === anchor.parentElement) {
      return;
    }

    anchor.after(popup);
  };

  if (!popup.parentElement || popup.parentElement !== columnContainer) {
    insertAfterPrice();
  } else {
    insertAfterPrice();
  }

  fetchInlinePrices(popup);
};

let scheduled = false;
const scheduleInlineInsertion = () => {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    insertInlinePopup();
  }, 200);
};

const observer = new MutationObserver(() => scheduleInlineInsertion());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    insertInlinePopup();
    observer.observe(document.body, { childList: true, subtree: true });
  });
} else {
  insertInlinePopup();
  observer.observe(document.body, { childList: true, subtree: true });
}
