(function () {
  if (window.hasOzonTrackerWidget) {
    return;
  }
  window.hasOzonTrackerWidget = true;

  if (!location.hostname.includes('ozon.ru')) {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const url = document.querySelector('link[rel="canonical"]')?.href || location.href.split('?')[0];
    const widget = buildWidget();
    document.body.appendChild(widget.wrapper);

    let trackedItem = null;
    let isBusy = false;
    let shouldRetry = false;

    const refreshStatus = async () => {
      widget.setLoading(true);
      const response = await sendMessage({ action: 'get-product-status', payload: { url } });
      if (response?.ok) {
        trackedItem = response.item || null;
        widget.render(trackedItem);
        shouldRetry = false;
      } else {
        widget.renderError(response?.error || 'Не удалось получить данные');
        shouldRetry = true;
      }
      widget.setLoading(false);
    };

    const addCurrentProduct = async () => {
      if (isBusy) return;
      isBusy = true;
      widget.setLoading(true);
      const product = collectProductData();
      product.url = url;
      const response = await sendMessage({ action: 'add-product-from-page', payload: product });
      if (response?.ok) {
        showToast('Товар добавлен в отслеживание');
        trackedItem = response.state?.items?.find((item) => item.url === url) || null;
        widget.render(trackedItem);
      } else {
        showToast(response?.error || 'Не удалось добавить товар', true);
      }
      widget.setLoading(false);
      isBusy = false;
    };

    const removeCurrentProduct = async () => {
      if (!trackedItem || isBusy) return;
      isBusy = true;
      widget.setLoading(true);
      const response = await sendMessage({ action: 'remove-product', payload: { id: trackedItem.id } });
      if (response?.ok) {
        showToast('Товар удалён из отслеживания');
        trackedItem = null;
        widget.render(trackedItem);
      } else {
        showToast(response?.error || 'Не удалось удалить товар', true);
      }
      widget.setLoading(false);
      isBusy = false;
    };

    widget.onAction(async () => {
      if (shouldRetry) {
        shouldRetry = false;
        refreshStatus();
        return;
      }

      if (trackedItem) {
        await removeCurrentProduct();
      } else {
        await addCurrentProduct();
      }
    });

    widget.onOpenSettings(() => {
      const settingsUrl = chrome.runtime.getURL('tracked.html');
      window.open(settingsUrl, '_blank');
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'state-updated') {
        const updated = message.state?.items?.find((item) => item.url === url);
        trackedItem = updated || null;
        widget.render(trackedItem);
      }
    });

    refreshStatus();
  }
})();

function buildWidget() {
  const wrapper = document.createElement('div');
  wrapper.className = 'ozon-tracker-widget floating';

  const header = document.createElement('div');
  header.className = 'ozon-tracker-widget__header';
  header.textContent = 'Отслеживание цены';
  wrapper.appendChild(header);

  const title = document.createElement('p');
  title.className = 'ozon-tracker-widget__title';
  wrapper.appendChild(title);

  const list = document.createElement('div');
  list.className = 'ozon-tracker-widget__stats';
  wrapper.appendChild(list);

  const updated = document.createElement('p');
  updated.className = 'ozon-tracker-widget__updated';
  wrapper.appendChild(updated);

  const actions = document.createElement('div');
  actions.className = 'ozon-tracker-widget__actions';
  wrapper.appendChild(actions);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'ozon-tracker-widget__button';
  actions.appendChild(actionButton);

  const settingsLink = document.createElement('button');
  settingsLink.type = 'button';
  settingsLink.className = 'ozon-tracker-widget__link';
  settingsLink.textContent = 'Настройки проверки';
  wrapper.appendChild(settingsLink);

  const setLoading = (loading) => {
    if (loading) {
      wrapper.classList.add('loading');
    } else {
      wrapper.classList.remove('loading');
    }
  };

  const formatPrice = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
  };

  const formatDate = (value) => {
    if (!value) {
      return '—';
    }
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  };

  const renderStats = (item) => {
    if (!item) {
      title.textContent = 'Товар не отслеживается';
      list.innerHTML = '<p class="ozon-tracker-widget__hint">Нажмите кнопку ниже, чтобы добавить текущий товар.</p>';
      updated.textContent = '';
      actionButton.textContent = 'Отслеживать скидку';
      actionButton.disabled = false;
      return;
    }

    title.textContent = item.title || 'Товар Ozon';

    const avg = Array.isArray(item.history) && item.history.length
      ? Math.round(item.history.reduce((sum, entry) => sum + (entry.price || 0), 0) / item.history.length)
      : null;

    list.innerHTML = `
      <p><span>Текущая цена:</span><strong>${formatPrice(item.lastPrice)}</strong></p>
      <p><span>Средняя цена:</span><strong>${formatPrice(avg)}</strong></p>
      <p><span>История цены:</span><strong>${item.history?.length ? `${item.history.length} записей` : 'отсутствует'}</strong></p>
    `;

    updated.textContent = item.lastCheckedAt ? `Обновлено: ${formatDate(item.lastCheckedAt)}` : 'Ещё не проверялось';

    actionButton.textContent = 'Убрать из отслеживания';
    actionButton.disabled = false;
  };

  return {
    wrapper,
    setLoading,
    render(item) {
      renderStats(item);
    },
    renderError(message) {
      title.textContent = 'Ошибка';
      list.innerHTML = `<p class="ozon-tracker-widget__hint">${message}</p>`;
      updated.textContent = '';
      actionButton.textContent = 'Повторить';
      actionButton.disabled = false;
    },
    onAction(handler) {
      actionButton.addEventListener('click', handler);
    },
    onOpenSettings(handler) {
      settingsLink.addEventListener('click', handler);
    },
  };
}

function collectProductData() {
  const title = document.querySelector('h1')?.textContent?.trim();
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const url = canonical || location.href;
  const image = document.querySelector('meta[property="og:image"]')?.content || null;
  const price = parsePriceFromPage();
  return {
    title,
    url,
    image,
    targetPrice: null,
    price,
  };
}

function parsePriceFromPage() {
  const priceSelectors = [
    '[data-widget="webPrice"] span',
    'span[class*="price"]',
    'div[data-widget="sku"] span',
  ];
  for (const selector of priceSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const numeric = Number(element.textContent.replace(/[^0-9]/g, ''));
      if (!Number.isNaN(numeric) && numeric > 0) {
        return numeric;
      }
    }
  }
  return null;
}

function showToast(message, error = false) {
  const toast = document.createElement('div');
  toast.className = 'ozon-tracker-toast';
  if (error) {
    toast.classList.add('error');
  }
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('visible');
  }, 50);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}
