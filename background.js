import { getDefaultState, loadState, saveState } from './storage.js';

const ALARM_NAME = 'ozon-price-check';
const MAX_HISTORY_POINTS = 60;

let trackerState = getDefaultState();

initializeState();

async function initializeState() {
  try {
    const stored = await loadState();
    if (stored && Array.isArray(stored.items)) {
      trackerState = stored;
    } else {
      await saveState(trackerState);
    }
  } catch (error) {
    console.error('Не удалось загрузить сохранённое состояние', error);
    await saveState(trackerState);
  }

  ensureAlarm(true);
  checkTrackedProducts(true).catch((error) => console.error('Начальная проверка цен завершилась с ошибкой', error));
}

chrome.runtime.onInstalled.addListener(async () => {
  trackerState = await loadState();
  ensureAlarm(true);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') {
    return undefined;
  }

  handleMessage(message).then(sendResponse).catch((error) => {
    console.error('Ошибка при обработке сообщения', error);
    sendResponse({ ok: false, error: error?.message || 'Неизвестная ошибка' });
  });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkTrackedProducts().catch((error) => console.error('Ошибка проверки цен', error));
  }
});

async function handleMessage(message) {
  switch (message.action) {
    case 'get-state':
      return { ok: true, state: trackerState };
    case 'add-product':
      return addProduct(message.payload);
    case 'add-product-from-page':
      return addProduct(message.payload);
    case 'remove-product':
      return removeProduct(message.payload?.id);
    case 'get-product-status':
      return getProductStatus(message.payload?.url);
    case 'update-target-price':
      return updateTargetPrice(message.payload?.id, message.payload?.targetPrice);
    case 'set-global-interval':
      return updateInterval(message.payload?.minutes);
    case 'manual-refresh':
      await checkTrackedProducts(true, message.payload?.id ? [message.payload.id] : undefined);
      return { ok: true, state: trackerState };
    default:
      return { ok: false, error: 'Неизвестное действие' };
  }
}

async function addProduct(payload = {}) {
  if (!payload.url) {
    return { ok: false, error: 'Не указана ссылка на товар' };
  }

  if (!payload.url.includes('ozon.ru')) {
    return { ok: false, error: 'Можно добавлять только товары Ozon' };
  }

  const existing = trackerState.items.find((item) => item.url === payload.url);
  if (existing) {
    return { ok: false, error: 'Товар уже добавлен' };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const title = payload.title?.trim() || 'Товар Ozon';
  const targetPrice = Number(payload.targetPrice) || null;

  const initialHistory =
    typeof payload.price === 'number'
      ? [
          {
            price: payload.price,
            checkedAt: now,
          },
        ]
      : [];

  const newItem = {
    id,
    url: payload.url,
    title,
    image: payload.image || null,
    targetPrice,
    lastPrice: typeof payload.price === 'number' ? payload.price : null,
    lastCheckedAt: initialHistory.length ? now : null,
    history: initialHistory,
    notified: false,
  };

  trackerState.items.push(newItem);
  await saveState(trackerState);
  try {
    chrome.runtime.sendMessage({ type: 'state-updated', state: trackerState });
  } catch (error) {
    console.debug('Нет активных получателей состояния', error);
  }
  await checkTrackedProducts(true, [id]);
  return { ok: true, state: trackerState };
}

async function removeProduct(id) {
  if (!id) {
    return { ok: false, error: 'Не указан идентификатор' };
  }
  trackerState.items = trackerState.items.filter((item) => item.id !== id);
  await saveState(trackerState);
  try {
    chrome.runtime.sendMessage({ type: 'state-updated', state: trackerState });
  } catch (error) {
    console.debug('Нет активных получателей состояния', error);
  }
  return { ok: true, state: trackerState };
}

async function updateTargetPrice(id, targetPrice) {
  if (!id) {
    return { ok: false, error: 'Не указан товар' };
  }
  const numeric = Number(targetPrice);
  const product = trackerState.items.find((item) => item.id === id);
  if (!product) {
    return { ok: false, error: 'Товар не найден' };
  }
  product.targetPrice = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  product.notified = false;
  await saveState(trackerState);
  try {
    chrome.runtime.sendMessage({ type: 'state-updated', state: trackerState });
  } catch (error) {
    console.debug('Нет активных получателей состояния', error);
  }
  return { ok: true, state: trackerState };
}

async function updateInterval(minutes) {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric) || numeric < 5) {
    return { ok: false, error: 'Минимальный интервал — 5 минут' };
  }
  trackerState.refreshIntervalMinutes = numeric;
  await saveState(trackerState);
  ensureAlarm(true);
  try {
    chrome.runtime.sendMessage({ type: 'state-updated', state: trackerState });
  } catch (error) {
    console.debug('Нет активных получателей состояния', error);
  }
  return { ok: true, state: trackerState };
}

async function getProductStatus(url) {
  if (!url) {
    return { ok: false, error: 'Не указана ссылка' };
  }
  const item = trackerState.items.find((entry) => entry.url === url) || null;
  return { ok: true, item };
}

function ensureAlarm(force = false) {
  if (force) {
    chrome.alarms.clear(ALARM_NAME);
  }
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: trackerState.refreshIntervalMinutes });
}

async function checkTrackedProducts(force = false, specificIds) {
  if (!Array.isArray(trackerState.items) || trackerState.items.length === 0) {
    return;
  }

  const itemsToCheck = specificIds?.length
    ? trackerState.items.filter((item) => specificIds.includes(item.id))
    : trackerState.items;

  const updated = [];
  for (const product of itemsToCheck) {
    const latestPrice = await fetchProductPrice(product.url);
    const timestamp = new Date().toISOString();
    const cloned = { ...product };
    if (typeof latestPrice === 'number') {
      cloned.lastPrice = latestPrice;
      cloned.lastCheckedAt = timestamp;
      cloned.history = Array.isArray(cloned.history) ? cloned.history : [];
      cloned.history.push({ price: latestPrice, checkedAt: timestamp });
      if (cloned.history.length > MAX_HISTORY_POINTS) {
        cloned.history = cloned.history.slice(-MAX_HISTORY_POINTS);
      }
    }

    if (shouldNotify(cloned, latestPrice)) {
      await notifyPriceDrop(cloned, latestPrice);
      cloned.notified = true;
    } else if (cloned.notified && typeof cloned.targetPrice === 'number' && latestPrice > cloned.targetPrice) {
      cloned.notified = false;
    }

    Object.assign(product, cloned);
    updated.push(product);
  }

  await saveState(trackerState);
  if (force || updated.length > 0) {
    try {
      chrome.runtime.sendMessage({ type: 'state-updated', state: trackerState });
    } catch (error) {
      console.debug('Нет активных получателей состояния', error);
    }
  }
}

function shouldNotify(product, latestPrice) {
  return (
    typeof latestPrice === 'number' &&
    typeof product.targetPrice === 'number' &&
    latestPrice <= product.targetPrice &&
    !product.notified
  );
}

async function fetchProductPrice(url) {
  if (!url) {
    return null;
  }
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
  if (!raw) {
    return null;
  }
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
        priority: 2,
      },
      () => resolve()
    );
  });
}

function formatPrice(value) {
  if (typeof value !== 'number') {
    return '';
  }
  return new Intl.NumberFormat('ru-RU').format(value);
}
