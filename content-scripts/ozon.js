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

const insertInlinePopup = () => {
  const deliveryBlocks =
    findAllByText(['доставим сегодня', 'доставим завтра', 'доставим', 'доставка']) || [];

  const cheaperBlocks =
    findAllByText(['есть дешевле', 'нашли дешевле', 'есть дешевле?']) || [];

  if (!deliveryBlocks.length && !cheaperBlocks.length) return;

  const existing = document.getElementById(INLINE_POPUP_ID);
  const popup = existing || createInlinePopup();

  const widgetMatches = (node, keywords) =>
    keywords.some((kw) => node?.getAttribute?.('data-widget')?.toLowerCase()?.includes(kw));

  const filterByWidgetAndText = (nodes, widgetKeywords) =>
    nodes
      .map((node) => ({
        node,
        hasWidget: widgetMatches(node, widgetKeywords),
        depth: (() => {
          let depth = 0;
          let current = node;
          while (current && current !== document.body) {
            depth += 1;
            current = current.parentElement;
          }
          return depth;
        })()
      }))
      .sort((a, b) => Number(b.hasWidget) - Number(a.hasWidget) || b.depth - a.depth)
      .map((item) => item.node);

  const scopedDelivery = filterByWidgetAndText(deliveryBlocks, ['delivery']);
  const scopedCheaper = filterByWidgetAndText(cheaperBlocks, ['cheaper']);

  const findCommonAncestor = (a, b) => {
    const ancestors = new Set();
    let current = a;
    while (current) {
      ancestors.add(current);
      current = current.parentElement;
    }
    current = b;
    while (current) {
      if (ancestors.has(current)) return current;
      current = current.parentElement;
    }
    return null;
  };

  const hasBuyingContext = (node) => {
    if (!node) return false;
    const widgetBonus = widgetMatches(node, ['price', 'delivery', 'cheaper', 'button', 'cart', 'buy']);
    const hasPriceBlock = node.querySelector?.('[data-widget*="Price" i], [data-widget*="price" i]');
    const hasBuyButton = findAllByText(['в корзину', 'добавить в корзину', 'купить'], node).length > 0;
    return Boolean(widgetBonus || hasPriceBlock || hasBuyButton);
  };

  let targetDelivery = null;
  let targetCheaper = null;
  let targetContainer = null;
  let bestScore = -1;

  for (const delivery of scopedDelivery) {
    for (const cheaper of scopedCheaper) {
      if (!(delivery.compareDocumentPosition(cheaper) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const ancestor = findCommonAncestor(delivery, cheaper);
      if (!ancestor) continue;
      const depth = (() => {
        let d = 0;
        let node = ancestor;
        while (node && node !== document.body) {
          d += 1;
          node = node.parentElement;
        }
        return d;
      })();
      const score = depth + (widgetMatches(ancestor, ['delivery', 'cheaper']) ? 5 : 0) + (hasBuyingContext(ancestor) ? 10 : 0);
      if (score > bestScore) {
        bestScore = score;
        targetDelivery = delivery;
        targetCheaper = cheaper;
        targetContainer = ancestor;
      }
    }
  }

  if (targetDelivery && targetCheaper && targetContainer) {
    if (popup.parentElement !== targetContainer || popup.nextElementSibling !== targetCheaper) {
      targetCheaper.parentElement === targetContainer
        ? targetContainer.insertBefore(popup, targetCheaper)
        : targetDelivery.insertAdjacentElement('afterend', popup);
    }
    return;
  }

  const delivery = scopedDelivery.find((node) => node.parentElement && hasBuyingContext(node.parentElement));
  if (delivery && delivery.parentElement) {
    const parent = delivery.parentElement;
    if (popup.parentElement !== parent || popup.previousElementSibling !== delivery) {
      delivery.insertAdjacentElement('afterend', popup);
    }
    return;
  }

  const cheaper = scopedCheaper.find((node) => node.parentElement && hasBuyingContext(node.parentElement));
  if (cheaper && cheaper.parentElement) {
    const parent = cheaper.parentElement;
    if (popup.parentElement !== parent || popup.nextElementSibling !== cheaper) {
      parent.insertBefore(popup, cheaper);
    }
    return;
  }

  const fallbackTarget = scopedDelivery[0] || scopedCheaper[0];
  if (fallbackTarget && fallbackTarget.parentElement) {
    fallbackTarget.insertAdjacentElement('afterend', popup);
  }
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
