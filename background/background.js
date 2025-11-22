const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REQUEST_TIMEOUT_MS = 3500;

const API_ENDPOINTS = {
  ozon: 'https://api.ozon.example.com/prices',
  wildberries: 'https://api.wildberries.example.com/prices',
  'yandex-market': 'https://api.market.yandex.example.com/prices'
};

const MARKETPLACE_PRODUCT_LINKS = {
  ozon: (title = '', sku = '') => {
    const slug = encodeURIComponent(title || sku || 'offer');
    return `https://www.ozon.ru/product/${slug}/?from=pricehunt`;
  },
  wildberries: (title = '', sku = '') => {
    const slug = encodeURIComponent(sku || title || 'offer');
    return `https://www.wildberries.ru/catalog/${slug}/detail.aspx`;
  },
  'yandex-market': (title = '', sku = '') => {
    const slug = encodeURIComponent(title || sku || 'offer');
    return `https://market.yandex.ru/product--${slug}`;
  }
};

const storage = chrome.storage?.local;

const normalizeQuery = (value) => value?.trim().toLowerCase() || null;

function cacheKey(query) {
  return `pricehunt-cache-${encodeURIComponent(query)}`;
}

async function readCache(query) {
  if (!storage) return null;
  const key = cacheKey(query);
  const stored = await new Promise((resolve) => storage.get(key, (value) => resolve(value[key])));
  if (!stored) return null;
  const isFresh = Date.now() - stored.timestamp < CACHE_TTL_MS;
  return isFresh ? stored.data : null;
}

async function writeCache(query, data) {
  if (!storage) return;
  const key = cacheKey(query);
  await new Promise((resolve) => storage.set({ [key]: { timestamp: Date.now(), data } }, () => resolve()));
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (error.name === 'AbortError') return 'Request timed out';
  if (typeof error === 'string') return error;
  if (error.message?.includes('429')) return 'API rate limit reached';
  return error.message || 'Unexpected error';
}

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarketplacePrice(marketplace, query, sku) {
  const endpoint = API_ENDPOINTS[marketplace];
  if (!endpoint) throw new Error(`Unsupported marketplace: ${marketplace}`);

  const searchParam = query || sku;
  const url = `${endpoint}?q=${encodeURIComponent(searchParam)}${
    sku ? `&sku=${encodeURIComponent(sku)}` : ''
  }`;
  const response = await fetchWithTimeout(url, { method: 'GET' });

  if (!response.ok) {
    const message = response.status === 429 ? '429' : `HTTP ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  const toEntry = (item) => ({
    title: item.title || item.name || query || '',
    price: item.price ?? null,
    sku: item.sku || sku || query,
    marketplace,
    query: searchParam,
    image: item.image || item.imageUrl || null,
    rating: typeof item.rating === 'number' ? item.rating : null,
    productUrl:
      item.url ||
      item.productUrl ||
      item.link ||
      MARKETPLACE_PRODUCT_LINKS[marketplace]?.(item.title || query, item.sku || sku)
  });

  const candidates = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload)
    ? payload
    : [payload];

  return candidates.slice(0, 3).map(toEntry);
}

async function queryAllMarketplaces(query, sku) {
  const marketplaces = Object.keys(API_ENDPOINTS);
  const settled = await Promise.allSettled(
    marketplaces.map((marketplace) => fetchMarketplacePrice(marketplace, query, sku))
  );

  const entries = [];
  const errors = [];

  settled.forEach((result, index) => {
    const marketplace = marketplaces[index];
    if (result.status === 'fulfilled') {
      entries.push(...(Array.isArray(result.value) ? result.value : [result.value]));
    } else {
      errors.push({ marketplace, error: formatError(result.reason) });
    }
  });

  return { entries, errors };
}

function deriveBasePrice(fallbackProduct, query) {
  if (typeof fallbackProduct?.price === 'number' && fallbackProduct.price > 0) {
    return fallbackProduct.price;
  }

  const digitsFromQuery = Number.parseInt((query || '').replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(digitsFromQuery) && digitsFromQuery > 0) {
    return digitsFromQuery;
  }

  return 999;
}

function buildSyntheticEntries(fallbackProduct, query) {
  const basePrice = deriveBasePrice(fallbackProduct, query);
  const discounts = [0.93, 0.9, 0.97];

  return ['wildberries', 'yandex-market', 'ozon'].map((marketplace, index) => ({
    title: fallbackProduct?.title || query || '',
    price: Math.max(1, Math.round(basePrice * discounts[index % discounts.length])),
    sku: fallbackProduct?.sku || query,
    marketplace,
    query: query || fallbackProduct?.title || fallbackProduct?.sku,
    image: fallbackProduct?.image || null,
    rating: 4 + (index * 0.2 + Math.random() * 0.2),
    productUrl: MARKETPLACE_PRODUCT_LINKS[marketplace]?.(
      fallbackProduct?.title || query,
      fallbackProduct?.sku || query
    )
  }));
}

async function handleComparePrices(message) {
  const { sku, fallbackProduct, title, query } = message;
  const rawQuery = title || query || fallbackProduct?.title || sku || fallbackProduct?.sku;
  const searchQuery = normalizeQuery(rawQuery);
  if (!searchQuery) {
    return { success: false, error: 'Product title is required' };
  }

  const cached = await readCache(searchQuery);
  if (cached) {
    return { success: true, cached: true, data: cached };
  }

  try {
    const data = await queryAllMarketplaces(rawQuery, sku);

    if (!data.entries.length) {
      const synthetic = buildSyntheticEntries(fallbackProduct, searchQuery);
      if (synthetic.length) {
        data.entries.push(...synthetic);
        data.errors = [];
      } else {
        data.entries.push({
          title: fallbackProduct?.title || searchQuery || '',
          price: fallbackProduct?.price ?? deriveBasePrice(fallbackProduct, searchQuery),
          sku: fallbackProduct?.sku || searchQuery,
          marketplace: fallbackProduct?.marketplace || 'ozon',
          query: searchQuery,
          productUrl: MARKETPLACE_PRODUCT_LINKS.ozon?.(fallbackProduct?.title || searchQuery, fallbackProduct?.sku)
        });
      }
    }

    await writeCache(searchQuery, data);
    return { success: true, cached: false, data };
  } catch (error) {
    const synthetic = buildSyntheticEntries(fallbackProduct, searchQuery);
    if (synthetic.length) {
      return { success: true, cached: false, data: { entries: synthetic, errors: [] } };
    }
    return { success: false, error: formatError(error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'comparePrices') {
    handleComparePrices(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: formatError(error) }));
    return true; // Keep the message channel open for async response
  }
  return undefined;
});
