(function () {
  if (window.hasOzonTrackerButton) {
    return;
  }
  window.hasOzonTrackerButton = true;
  if (!location.hostname.includes('ozon.ru')) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ozon-tracker-button-wrapper floating';

  const button = document.createElement('button');
  button.className = 'ozon-tracker-button';
  button.type = 'button';
  button.textContent = 'Отслеживать скидку';
  button.title = 'Добавить товар в отслеживание скидок Ozon';
  wrapper.appendChild(button);

  button.addEventListener('click', async () => {
    button.disabled = true;
    const product = collectProductData();
    if (!product?.url) {
      showToast('Не удалось определить товар', true);
      button.disabled = false;
      return;
    }
    const response = await sendMessage({ action: 'add-product-from-page', payload: product });
    if (response?.ok) {
      showToast('Товар добавлен в отслеживание');
    } else {
      showToast(response?.error || 'Не удалось добавить товар', true);
    }
    button.disabled = false;
  });

  document.body.appendChild(wrapper);
  const observer = new MutationObserver(() => placeButton(wrapper));
  observer.observe(document.body, { childList: true, subtree: true });
  placeButton(wrapper);
})();

function placeButton(wrapper) {
  const target = findPlacementNode();
  if (target && target.parentElement) {
    wrapper.classList.remove('floating');
    wrapper.classList.add('inline');
    if (target.previousSibling !== wrapper) {
      target.parentElement.insertBefore(wrapper, target);
    }
    return;
  }
  if (wrapper.parentElement !== document.body) {
    document.body.appendChild(wrapper);
  }
  wrapper.classList.add('floating');
  wrapper.classList.remove('inline');
}

function findPlacementNode() {
  const textTargets = ['купить в один клик', 'купить сейчас', 'в корзину'];
  for (const text of textTargets) {
    const node = Array.from(document.querySelectorAll('button, a, span'))
      .find((el) => {
        const value = el.textContent?.toLowerCase();
        return value ? value.includes(text) : false;
      });
    if (node) {
      return node.closest('[data-widget]') || node.closest('div') || node;
    }
  }
  return document.querySelector('[data-widget="webPrice"]');
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
