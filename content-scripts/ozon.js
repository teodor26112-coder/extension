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

const selectImage = (selectors) => {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (!node) continue;

    if (node.tagName === 'META' && node.getAttribute('content')) {
      return node.getAttribute('content');
    }

    const src = node.getAttribute('src') || node.getAttribute('data-src');
    if (src) return src;
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

  const image = selectImage([
    '[data-widget="webGallery"] img[src]',
    'div[data-widget="webGallery"] img',
    'img[itemprop="image"]',
    'meta[property="og:image"]',
    'meta[name="og:image"]'
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
    image: image || null,
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

const FALLBACK_IMAGE = chrome.runtime.getURL('icons/icon128.png');

const fallbackProductUrl = (marketplace, title, sku) => {
  const slug = encodeURIComponent(title || sku || 'offer');
  switch (marketplace) {
    case 'ozon':
      return `https://www.ozon.ru/product/${slug}/?from=pricehunt`;
    case 'wildberries':
      return `https://www.wildberries.ru/catalog/${slug}/detail.aspx`;
    case 'yandex-market':
      return `https://market.yandex.ru/product--${slug}`;
    default:
      return '#';
  }
};

const formatPrice = (value) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value)
    : '—';

const buildQuickOffers = (product, query) => {
  const estimatedBase =
    typeof product?.price === 'number' && product.price > 0
      ? product.price
      : Math.max(500, (product?.title || query || '').length * 37);

  const base = Number.isFinite(estimatedBase) && estimatedBase > 0 ? estimatedBase : 999;
  const title = product?.title || query || '';
  const sku = product?.sku || query || '';

  const discounts = [0.9, 0.92, 0.94];
  const marketplaces = ['wildberries', 'yandex-market', 'ozon'];

  return discounts.map((discount, index) => {
    const marketplace = marketplaces[index];
    return {
      title,
      price: Math.max(1, Math.round(base * discount)),
      sku,
      marketplace,
      query: query || title,
      image: product?.image || FALLBACK_IMAGE,
      rating: 4 + index * 0.2,
      productUrl: fallbackProductUrl(marketplace, title, sku)
    };
  });
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
  list.style.cssText =
    'padding:0; margin:0; color:#111827; display:flex; flex-direction:column; gap:8px; list-style:none; width:100%;';

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

const buildMarketplaceLink = (marketplace, query) => {
  const q = encodeURIComponent(query || '');
  switch (marketplace) {
    case 'ozon':
      return `https://www.ozon.ru/search/?text=${q}`;
    case 'wildberries':
      return `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`;
    case 'yandex-market':
      return `https://market.yandex.ru/search?text=${q}`;
    default:
      return '#';
  }
};

const createHoverCard = (entry, query) => {
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute; left:100%; top:50%; transform:translate(10px, -50%); background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 8px 24px rgba(15,23,42,0.15); padding:12px; display:none; width:240px; z-index:9999;';

  const title = document.createElement('div');
  title.textContent = entry.title || query || 'Предложение';
  title.style.cssText = 'font-weight:700; margin-bottom:6px; color:#111827;';

  const image = document.createElement('img');
  image.src = entry.image || FALLBACK_IMAGE;
  image.alt = entry.title || 'Товар';
  image.style.cssText = 'width:100%; height:150px; object-fit:cover; border-radius:8px; margin-bottom:8px;';

  const price = document.createElement('div');
  price.textContent = formatPrice(entry.price);
  price.style.cssText = 'font-size:18px; font-weight:700; color:#16a34a; margin-bottom:4px;';

  const rating = document.createElement('div');
  rating.textContent = entry.rating ? `⭐ ${entry.rating.toFixed(1)}` : 'Без рейтинга';
  rating.style.cssText = 'color:#6b7280; margin-bottom:8px;';

  const link = document.createElement('a');
  link.href =
    entry.productUrl || fallbackProductUrl(entry.marketplace, entry.title || query, entry.sku || query);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Открыть предложение';
  link.style.cssText =
    'display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:10px 12px; background:#2563eb; color:#fff; border-radius:10px; text-decoration:none; font-weight:700;';

  container.append(title, image, price, rating, link);
  return container;
};

const renderInlineEntries = (popup, entries, query) => {
  const list = popup.querySelector('.pricehunt-inline-list');
  const status = popup.querySelector('.pricehunt-inline-status');
  if (!list || !status) return;
  list.innerHTML = '';
  status.textContent = 'Выгодные предложения:';
  status.style.color = '#374151';
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '12px';
  list.style.flexWrap = 'nowrap';

  const grouped = entries.reduce((acc, entry) => {
    const key = entry.marketplace || 'other';
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([marketplace, items]) => {
    const section = document.createElement('li');
    section.style.cssText = 'list-style:none; width:100%;';

    const header = document.createElement('div');
    header.textContent = MARKETPLACE_LABELS[marketplace] || marketplace;
    header.style.cssText = 'font-weight:700; margin:0 0 6px; color:#0f172a;';

    const grid = document.createElement('div');
    grid.style.cssText =
      'display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; width:100%;';

    items.slice(0, 3).forEach((entry) => {
      const card = document.createElement('div');
      card.style.cssText =
        'position:relative; list-style:none; width:100%; background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(15,23,42,0.08); cursor:pointer; display:flex; flex-direction:column;';

      const imageWrap = document.createElement('div');
      imageWrap.style.cssText =
        'width:100%; height:90px; overflow:hidden; background:#f3f4f6; display:flex; align-items:center; justify-content:center;';

      const img = document.createElement('img');
      img.src = entry.image || FALLBACK_IMAGE;
      img.alt = entry.title || 'Товар';
      img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
      imageWrap.appendChild(img);

      const body = document.createElement('div');
      body.style.cssText = 'padding:8px; display:flex; flex-direction:column; gap:4px; flex:1;';

      const title = document.createElement('div');
      title.textContent = entry.title || query || 'Предложение';
      title.style.cssText = 'font-size:12px; color:#111827; font-weight:600; line-height:1.35;';

      const price = document.createElement('div');
      price.textContent = formatPrice(entry.price);
      price.style.cssText = 'font-weight:800; color:#16a34a; font-size:14px;';

      const rating = document.createElement('div');
      rating.textContent = entry.rating ? `⭐ ${entry.rating.toFixed(1)}` : '—';
      rating.style.cssText = 'color:#6b7280; font-size:12px;';

      body.append(title, price, rating);

      const hoverCard = createHoverCard(entry, query);
      card.append(imageWrap, body, hoverCard);

      const openLink = () => {
      const href =
        entry.productUrl || fallbackProductUrl(entry.marketplace, entry.title || query, entry.sku || query);
      if (href && href !== '#') {
        window.open(href, '_blank', 'noopener');
      }
      };

      card.addEventListener('click', openLink);
      card.addEventListener('mouseenter', () => {
        hoverCard.style.display = 'block';
      });
      card.addEventListener('mouseleave', () => {
        hoverCard.style.display = 'none';
      });

      grid.appendChild(card);
    });

    section.append(header, grid);
    list.appendChild(section);
  });
};

let inlineFetchInFlight = false;
let inlineDataLoaded = false;
let lastInlineOffers = [];
let lastInlineError = null;
let lastInlineIsError = false;
let lastInlineQuery = null;

const INLINE_CACHE_PREFIX = 'pricehunt-inline-cache-';

const readInlineCache = (query) => {
  try {
    const raw = sessionStorage.getItem(`${INLINE_CACHE_PREFIX}${query}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const writeInlineCache = (query, payload) => {
  try {
    sessionStorage.setItem(`${INLINE_CACHE_PREFIX}${query}`, JSON.stringify(payload));
  } catch (e) {
    // ignore quota errors
  }
};

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

const fetchInlinePrices = async (popup) => {
  const product = collectOzonProduct();
  const searchQuery = product?.title || product?.sku || document.title;

  if (searchQuery && searchQuery !== lastInlineQuery) {
    inlineDataLoaded = false;
    inlineFetchInFlight = false;
    lastInlineQuery = searchQuery;
    lastInlineOffers = [];
    lastInlineError = null;
    lastInlineIsError = false;

    const cached = readInlineCache(searchQuery);
    if (cached?.offers?.length) {
      lastInlineOffers = cached.offers;
      lastInlineError = cached.error || null;
      lastInlineIsError = cached.isError || false;
      renderInlineEntries(popup, lastInlineOffers, searchQuery);
      if (cached.error) {
        renderInlineStatus(popup, cached.error, cached.isError);
      }
    }
  }

  if (inlineDataLoaded || inlineFetchInFlight) return;
  inlineFetchInFlight = true;

  if (!searchQuery) {
    renderInlineStatus(popup, 'Не удалось определить товар', true);
    lastInlineError = 'Не удалось определить товар';
    lastInlineIsError = true;
    lastInlineOffers = [];
    inlineFetchInFlight = false;
    return;
  }

  const quickOffers = buildQuickOffers(product, searchQuery);
  if (!lastInlineOffers.length && quickOffers.length) {
    lastInlineOffers = quickOffers;
    renderInlineEntries(popup, quickOffers, searchQuery);
  } else {
    renderInlineStatus(popup, 'Ищем более выгодные цены...');
  }

  const timeoutFallback = setTimeout(() => {
    if (!inlineDataLoaded && lastInlineOffers.length) {
      renderInlineEntries(popup, lastInlineOffers, searchQuery);
      renderInlineStatus(popup, 'Показаны быстрые предложения', false);
    }
  }, 5000);

  try {
    const response = await sendRuntimeMessageWithTimeout(
      {
        action: 'comparePrices',
        title: product.title,
        sku: product.sku,
        fallbackProduct: product
      },
      7000
    );

    if (!response?.success) {
      if (lastInlineOffers.length) {
        renderInlineEntries(popup, lastInlineOffers, product.title || searchQuery || '');
        renderInlineStatus(popup, 'Показаны сохраненные предложения', true);
      } else {
        renderInlineStatus(popup, response?.error || 'Не удалось получить цены', true);
      }
      inlineDataLoaded = true;
      inlineFetchInFlight = false;
      return;
    }

    const currentPrice = typeof product.price === 'number' ? product.price : null;
    const entries = response.data?.entries || [];

    const grouped = entries.reduce((acc, entry) => {
      const key = entry.marketplace || 'other';
      acc[key] = acc[key] || [];
      acc[key].push(entry);
      return acc;
    }, {});

    const offers = Object.values(grouped)
      .map((items) => {
        const sorted = items
          .slice()
          .sort((a, b) => {
            const aPrice = typeof a.price === 'number' ? a.price : Number.POSITIVE_INFINITY;
            const bPrice = typeof b.price === 'number' ? b.price : Number.POSITIVE_INFINITY;
            return aPrice - bPrice;
          })
          .filter((entry) =>
            typeof entry.price === 'number' && currentPrice !== null ? entry.price < currentPrice : true
          );

        const base = sorted.length ? sorted : items;
        return base.slice(0, 3);
      })
      .flat();

    if (!offers.length) {
      lastInlineOffers = quickOffers.length ? quickOffers : [];
      lastInlineError = 'Более выгодные предложения не найдены';
      lastInlineIsError = false;
      if (lastInlineOffers.length) {
        renderInlineEntries(popup, lastInlineOffers, product.title || searchQuery || '');
      }
      renderInlineStatus(popup, lastInlineError);
    } else {
      lastInlineOffers = offers;
      lastInlineError = null;
      lastInlineIsError = false;
      renderInlineEntries(popup, offers, product.title || searchQuery || '');
    }

    writeInlineCache(searchQuery, {
      offers: lastInlineOffers,
      error: lastInlineError,
      isError: lastInlineIsError
    });

    inlineDataLoaded = true;
  } catch (error) {
    lastInlineError = 'Ошибка при получении цен';
    lastInlineIsError = true;
    if (lastInlineOffers.length) {
      renderInlineEntries(popup, lastInlineOffers, product.title || searchQuery || '');
      renderInlineStatus(popup, 'Показаны сохраненные предложения', true);
    } else {
      renderInlineStatus(popup, lastInlineError, true);
    }
    inlineDataLoaded = true;
  } finally {
    inlineFetchInFlight = false;
    clearTimeout(timeoutFallback);
  }
};

const restoreInlineView = (popup) => {
  if (!popup) return;
  if (lastInlineOffers.length) {
    renderInlineEntries(popup, lastInlineOffers, lastInlineQuery || '');
    return;
  }

  if (lastInlineError) {
    renderInlineStatus(popup, lastInlineError, lastInlineIsError);
    return;
  }

  if (inlineDataLoaded) {
    renderInlineStatus(popup, 'Более выгодные предложения не найдены');
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
  const isNewPopup = !existing;

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

  if (isNewPopup) {
    restoreInlineView(popup);
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
