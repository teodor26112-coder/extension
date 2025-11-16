const form = document.getElementById('product-form');
const productsList = document.getElementById('products');
const emptyState = document.getElementById('empty-state');
const lastUpdateLabel = document.getElementById('last-update');
const refreshButton = document.getElementById('refresh');
const template = document.getElementById('product-template');

let state = [];

init();

function init() {
  form.addEventListener('submit', handleSubmit);
  refreshButton.addEventListener('click', handleManualRefresh);
  productsList.addEventListener('click', handleListClick);
  loadProducts();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'price-updated') {
      state = message.products ?? [];
      render();
    }
  });
}

async function loadProducts() {
  const { trackedProducts = [] } = await chrome.storage.local.get('trackedProducts');
  state = trackedProducts;
  render();
}

async function handleSubmit(event) {
  event.preventDefault();
  const product = buildProductFromForm();
  if (!product) return;

  const { trackedProducts = [] } = await chrome.storage.local.get('trackedProducts');
  const newProducts = [...trackedProducts, product];
  await chrome.storage.local.set({ trackedProducts: newProducts });
  state = newProducts;
  form.reset();
  render();
}

function buildProductFromForm() {
  const title = document.getElementById('title').value.trim();
  const url = document.getElementById('url').value.trim();
  const priceValue = Number(document.getElementById('price').value);

  if (!url || !/^https?:\/\/www\.ozon\.ru\//i.test(url)) {
    alert('Введите корректную ссылку на товар ozon.ru');
    return null;
  }

  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    alert('Укажите целевую цену в рублях.');
    return null;
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title: title || 'Товар Ozon',
    url,
    targetPrice: priceValue,
    lastPrice: null,
    lastCheckedAt: null,
    notified: false,
  };
}

function handleListClick(event) {
  if (event.target.matches('button.remove')) {
    const item = event.target.closest('.product-item');
    if (!item) return;
    const { id } = item.dataset;
    removeProduct(id);
  }
}

async function removeProduct(id) {
  state = state.filter((item) => item.id !== id);
  await chrome.storage.local.set({ trackedProducts: state });
  render();
}

function render() {
  productsList.innerHTML = '';

  if (!state.length) {
    emptyState.hidden = false;
    lastUpdateLabel.textContent = '';
    return;
  }

  emptyState.hidden = true;

  state.forEach((product) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = product.id;
    node.querySelector('.product-title').textContent = product.title;
    node.querySelector('.product-meta').textContent = formatMeta(product);
    const statusEl = node.querySelector('.product-status');
    const status = buildStatus(product);
    statusEl.textContent = status.text;
    statusEl.className = `product-status ${status.variant ?? ''}`.trim();
    node.querySelector('.open-link').href = product.url;
    productsList.appendChild(node);
  });

  const latestCheck = state
    .map((item) => item.lastCheckedAt)
    .filter(Boolean)
    .sort()
    .pop();

  lastUpdateLabel.textContent = latestCheck
    ? `Обновлено: ${new Date(latestCheck).toLocaleString('ru-RU')}`
    : '';
}

function formatMeta(product) {
  const target = formatPrice(product.targetPrice);
  const last = product.lastPrice ? `${formatPrice(product.lastPrice)} ₽` : '—';
  return `Цель: ${target} ₽ · Текущая: ${last}`;
}

function buildStatus(product) {
  if (typeof product.lastPrice !== 'number') {
    return { text: 'Цена ещё не загружена' };
  }

  if (product.lastPrice <= product.targetPrice) {
    return { text: 'Цель достигнута 🎉', variant: 'success' };
  }

  const diff = product.lastPrice - product.targetPrice;
  return {
    text: `Ещё ${formatPrice(diff)} ₽ до цели`,
    variant: 'warn',
  };
}

function formatPrice(value) {
  if (typeof value !== 'number') return '';
  return new Intl.NumberFormat('ru-RU').format(value);
}

async function handleManualRefresh() {
  setRefreshState(true);
  await chrome.runtime.sendMessage({ type: 'manual-check' }).catch(() => {});
  setRefreshState(false);
}

function setRefreshState(isLoading) {
  refreshButton.disabled = isLoading;
}
