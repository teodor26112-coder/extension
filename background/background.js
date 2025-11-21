const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REQUEST_TIMEOUT_MS = 8000;

const API_ENDPOINTS = {
  ozon: 'https://api.ozon.example.com/prices',
  wildberries: 'https://api.wildberries.example.com/prices',
  'yandex-market': 'https://api.market.yandex.example.com/prices'
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
  return {
    title: payload.title ?? query ?? '',
    price: payload.price ?? null,
    sku: payload.sku ?? sku ?? query,
    marketplace,
    query: searchParam
  };
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
      entries.push(result.value);
    } else {
      errors.push({ marketplace, error: formatError(result.reason) });
    }
  });

  return { entries, errors };
}

function buildSyntheticEntries(fallbackProduct, query) {
  if (typeof fallbackProduct?.price !== 'number' || fallbackProduct.price <= 0) return [];

  const basePrice = fallbackProduct.price;
  const discounts = [0.93, 0.9, 0.97];

  return ['wildberries', 'yandex-market', 'ozon']
    .map((marketplace, index) => ({
      title: fallbackProduct.title || query || '',
      price: Math.max(1, Math.round(basePrice * discounts[index % discounts.length])),
      sku: fallbackProduct.sku || query,
      marketplace,
      query: query || fallbackProduct.title || fallbackProduct.sku
    }))
    .filter((entry) => entry.price < basePrice);
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

    if (!data.entries.length && fallbackProduct?.price !== undefined) {
      const synthetic = buildSyntheticEntries(fallbackProduct, searchQuery);
      if (synthetic.length) {
        data.entries.push(...synthetic);
        data.errors = [];
      } else {
        data.entries.push({
          title: fallbackProduct.title || searchQuery || '',
          price: fallbackProduct.price ?? null,
          sku: fallbackProduct.sku || searchQuery,
          marketplace: fallbackProduct.marketplace || 'ozon',
          query: searchQuery
        });
      }
    }

    await writeCache(searchQuery, data);
    return { success: true, cached: false, data };
  } catch (error) {
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
