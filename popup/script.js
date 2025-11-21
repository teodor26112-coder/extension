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

const setLoading = (text) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = text;
};

const setError = (text) => {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.textContent = text;
    loading.classList.add('error');
  }
};

const renderResults = (entries, currentPrice) => {
  const list = document.getElementById('result-list');
  if (!list) return;
  list.innerHTML = '';

  const grouped = entries.reduce((acc, entry) => {
    const key = entry.marketplace || 'other';
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([marketplace, items]) => {
    const section = document.createElement('li');
    section.className = 'result-section';

    const header = document.createElement('div');
    header.className = 'section-title';
    header.textContent = marketplace;

    const grid = document.createElement('div');
    grid.className = 'result-grid';

    items
      .slice()
      .sort((a, b) => {
        const aPrice = typeof a.price === 'number' ? a.price : Number.POSITIVE_INFINITY;
        const bPrice = typeof b.price === 'number' ? b.price : Number.POSITIVE_INFINITY;
        return aPrice - bPrice;
      })
      .slice(0, 3)
      .forEach((entry, index) => {
        const item = document.createElement('article');
        item.className = 'result-item';
        if (typeof entry.price === 'number' && typeof currentPrice === 'number' && entry.price < currentPrice) {
          item.classList.add('best-price');
        }

        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        const img = document.createElement('img');
        img.src = entry.image || FALLBACK_IMAGE;
        img.alt = entry.title || 'Товар';
        thumb.appendChild(img);

        const info = document.createElement('div');
        info.className = 'info';
        const headerLine = document.createElement('div');
        headerLine.className = 'result-header';
        headerLine.textContent = `${marketplace} №${index + 1}`;

        const title = document.createElement('div');
        title.className = 'result-title';
        title.textContent = entry.title || 'Предложение';

        const rating = document.createElement('div');
        rating.className = 'result-meta';
        rating.textContent = entry.rating ? `⭐ ${entry.rating.toFixed(1)}` : '—';

        const price = document.createElement('div');
        price.className = 'result-price';
        price.textContent = formatPrice(entry.price);

        info.append(headerLine, title, rating, price);

        const actions = document.createElement('div');
        actions.className = 'actions';
        const link = document.createElement('a');
        link.className = 'result-link';
        link.href = entry.productUrl || fallbackProductUrl(entry.marketplace, entry.title, entry.sku);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Перейти';
        actions.appendChild(link);

        item.append(thumb, info, actions);
        grid.appendChild(item);
      });

    section.append(header, grid);
    list.appendChild(section);
  });
};

const sendMessage = (tabId, payload) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });

const requestProductAndPrices = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setError('Не удалось получить активную вкладку');
    return;
  }

  const product = await sendMessage(tab.id, { action: 'getProduct' }).catch(() => null);
  if (!product?.title && !product?.sku) {
    setError('Не удалось определить товар');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'comparePrices',
    title: product.title,
    sku: product.sku,
    fallbackProduct: product
  });

  if (!response?.success) {
    setError(response?.error || 'Не удалось получить цены');
    return;
  }

  const entries = response.data?.entries || [];
  if (!entries.length) {
    setError('Предложения не найдены');
    return;
  }

  setLoading('Найдены предложения:');
  renderResults(entries, product.price ?? null);
};

document.addEventListener('DOMContentLoaded', () => {
  requestProductAndPrices().catch(() => setError('Ошибка при загрузке предложений'));
});
