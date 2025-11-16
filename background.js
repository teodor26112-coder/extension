const ALARM_NAME = 'ozon-price-check';
const CHECK_INTERVAL_MINUTES = 30;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkTrackedProducts();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'manual-check') {
    checkTrackedProducts().then(() => sendResponse({ status: 'ok' }));
    return true;
  }
  return undefined;
});

async function checkTrackedProducts() {
  const { trackedProducts = [] } = await chrome.storage.local.get('trackedProducts');
  if (!Array.isArray(trackedProducts) || trackedProducts.length === 0) {
    return;
  }

  const updatedProducts = await Promise.all(
    trackedProducts.map(async (product) => {
      const latestPrice = await fetchProductPrice(product.url);
      const timestamp = new Date().toISOString();
      const updated = {
        ...product,
        lastPrice: latestPrice,
        lastCheckedAt: timestamp,
      };

      if (
        typeof latestPrice === 'number' &&
        typeof product.targetPrice === 'number' &&
        latestPrice <= product.targetPrice &&
        !product.notified
      ) {
        await notifyPriceDrop(product, latestPrice);
        updated.notified = true;
      } else if (
        typeof latestPrice === 'number' &&
        product.notified &&
        latestPrice > product.targetPrice
      ) {
        updated.notified = false;
      }

      return updated;
    })
  );

  await chrome.storage.local.set({ trackedProducts: updatedProducts });
  chrome.runtime.sendMessage({ type: 'price-updated', products: updatedProducts });
}

async function fetchProductPrice(url) {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        'accept-language': 'ru-RU,ru;q=0.9',
      },
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors',
    });

    if (!response.ok) {
      console.warn('Не удалось загрузить страницу товара Ozon', response.status);
      return null;
    }

    const text = await response.text();
    return extractPrice(text);
  } catch (error) {
    console.error('Ошибка при получении цены Ozon', error);
    return null;
  }
}

function extractPrice(raw) {
  if (!raw) return null;

  const compact = raw.replace(/\n|\r/g, ' ');
  const regexes = [
    /"finalPrice"\s*:\s*"?(\d+[\s\d]*)"?/i,
    /"price":\{"value":\s*"?(\d+[\s\d]*)"?\}/i,
    /"price"\s*:\s*"?(\d+[\s\d]*)"?\s*[,}]/i,
    /(\d+[\s\d]*)\s*₽/i,
  ];

  for (const regex of regexes) {
    const match = compact.match(regex);
    if (match?.[1]) {
      const numeric = Number(match[1].replace(/\s+/g, ''));
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
  }

  return null;
}

function notifyPriceDrop(product, price) {
  return new Promise((resolve) => {
    chrome.notifications.create(
      '',
      {
        type: 'basic',
        title: 'Снижение цены на Ozon',
        message: `${product.title || 'Товар'} теперь стоит ${formatPrice(price)} ₽`,
      },
      () => resolve()
    );
  });
}

function formatPrice(value) {
  if (typeof value !== 'number') return '';
  return new Intl.NumberFormat('ru-RU').format(value);
}
