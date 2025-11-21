const MARKETPLACE_LABELS = {
  ozon: 'Ozon',
  wildberries: 'Wildberries',
  'yandex-market': 'Яндекс Маркет'
};

const MARKETPLACE_LINKS = {
  ozon: (sku) => `https://www.ozon.ru/search/?text=${encodeURIComponent(sku)}`,
  wildberries: (sku) =>
    `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(sku)}`,
  'yandex-market': (sku) => `https://market.yandex.ru/search?text=${encodeURIComponent(sku)}`
};

const formatPrice = (value) => {
  if (typeof value !== 'number') return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
};

const sendMessageToTab = (tabId, payload) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });

const sendRuntimeMessage = (payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });

const getActiveTab = async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab;
};

const renderMessage = (priceList, message, type = 'error') => {
  priceList.innerHTML = '';
  const li = document.createElement('li');
  li.className = type === 'error' ? 'empty' : 'info';
  li.textContent = message;
  priceList.appendChild(li);
};

const renderResults = (priceList, entries, errors, sku) => {
  priceList.innerHTML = '';
  if (!entries.length) {
    if (errors?.length) {
      errors.forEach((err) => {
        const li = document.createElement('li');
        li.className = 'empty';
        const label = MARKETPLACE_LABELS[err.marketplace] || err.marketplace;
        li.textContent = `${label}: ${err.error || 'Ошибка получения цены'}`;
        priceList.appendChild(li);
      });
    } else {
      renderMessage(priceList, 'Не удалось получить цены.', 'error');
    }
    return;
  }

  const numericPrices = entries
    .map((entry) => entry.price)
    .filter((value) => typeof value === 'number');
  const bestPrice = numericPrices.length ? Math.min(...numericPrices) : null;

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'result-card';

    const heading = document.createElement('div');
    heading.className = 'result-header';
    heading.textContent = MARKETPLACE_LABELS[entry.marketplace] || entry.marketplace;

    const priceEl = document.createElement('div');
    priceEl.className = 'result-price';
    priceEl.textContent = formatPrice(entry.price);

    if (bestPrice !== null && entry.price === bestPrice) {
      li.classList.add('best-price');
    }

    const link = document.createElement('a');
    link.href = MARKETPLACE_LINKS[entry.marketplace]?.(entry.sku || sku) || '#';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'Перейти';
    link.className = 'result-link';

    li.appendChild(heading);
    li.appendChild(priceEl);
    li.appendChild(link);

    priceList.appendChild(li);
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scan');
  const priceList = document.getElementById('price-list');
  const loading = document.getElementById('loading');

  const setLoading = (isLoading) => {
    loading.style.display = isLoading ? 'block' : 'none';
    scanButton.disabled = isLoading;
  };

  const handleError = (message) => {
    setLoading(false);
    renderMessage(priceList, message || 'Не удалось определить товар');
  };

  scanButton?.addEventListener('click', async () => {
    setLoading(true);
    priceList.innerHTML = '';

    try {
      const activeTab = await getActiveTab();
      if (!activeTab?.id) {
        handleError('Не удалось найти активную вкладку');
        return;
      }

      const product = await sendMessageToTab(activeTab.id, { action: 'getProduct' });
      if (!product?.sku) {
        handleError('Не удалось определить товар');
        return;
      }

      const response = await sendRuntimeMessage({
        action: 'comparePrices',
        sku: product.sku,
        fallbackProduct: {
          title: product.title,
          price: product.price,
          sku: product.sku,
          marketplace: product.marketplace
        }
      });
      if (!response?.success) {
        handleError(response?.error || 'Не удалось получить цены');
        return;
      }

      renderResults(priceList, response.data?.entries || [], response.data?.errors || [], product.sku);
      setLoading(false);
    } catch (error) {
      handleError('Не удалось определить товар');
      console.error('PriceHunt popup error', error);
    }
  });
});
