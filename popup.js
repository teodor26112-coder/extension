import { calcStats, formatPrice, renderChart } from './ui-helpers.js';

const form = document.getElementById('product-form');
const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const targetInput = document.getElementById('target-price');
const intervalInput = document.getElementById('interval');
const productsList = document.getElementById('products');
const template = document.getElementById('product-template');
const lastUpdate = document.getElementById('last-update');
const emptyState = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh');
const openListBtn = document.getElementById('open-list');

let currentState = null;

init();

function init() {
  form.addEventListener('submit', onSubmit);
  intervalInput.addEventListener('change', onIntervalChange);
  refreshBtn.addEventListener('click', () => manualRefresh());
  openListBtn.addEventListener('click', openFullList);
  loadState();
}

async function loadState() {
  const response = await sendMessage({ action: 'get-state' });
  if (response?.ok) {
    currentState = response.state;
    render();
  }
}

function render() {
  if (!currentState) return;
  intervalInput.value = currentState.refreshIntervalMinutes || 30;
  const items = Array.isArray(currentState.items) ? currentState.items : [];
  productsList.innerHTML = '';
  if (!items.length) {
    emptyState.style.display = 'block';
    lastUpdate.textContent = '';
    return;
  }
  emptyState.style.display = 'none';
  const latest = items
    .map((item) => item.lastCheckedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .reduce((max, value) => (value > max ? value : max), 0);
  if (latest) {
    lastUpdate.textContent = `Последнее обновление: ${formatDate(latest)}`;
  } else {
    lastUpdate.textContent = '';
  }
  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.querySelector('.product-title').textContent = item.title || 'Товар Ozon';
    const link = node.querySelector('.product-link');
    link.href = item.url;
    const stats = calcStats(item);
    node.querySelector('.stat-current').textContent = formatPrice(stats.current);
    node.querySelector('.stat-average').textContent = formatPrice(stats.average);
    node.querySelector('.stat-change').textContent = formatChange(stats.changeFromStart);
    const targetField = node.querySelector('.target-input');
    targetField.value = typeof item.targetPrice === 'number' ? item.targetPrice : '';
    node.querySelector('.save-target').addEventListener('click', () => {
      const value = targetField.value ? Number(targetField.value) : null;
      updateTarget(item.id, value);
    });
    node.querySelector('.remove').addEventListener('click', () => removeProduct(item.id));
    const canvas = node.querySelector('.chart');
    renderChart(canvas, item.history);
    productsList.appendChild(node);
  });
}

async function onSubmit(event) {
  event.preventDefault();
  const payload = {
    title: titleInput.value.trim(),
    url: urlInput.value.trim(),
    targetPrice: targetInput.value ? Number(targetInput.value) : null,
  };
  const response = await sendMessage({ action: 'add-product', payload });
  if (!response?.ok) {
    alert(response?.error || 'Не удалось добавить товар');
    return;
  }
  form.reset();
  currentState = response.state;
  render();
}

async function removeProduct(id) {
  const response = await sendMessage({ action: 'remove-product', payload: { id } });
  if (response?.ok) {
    currentState = response.state;
    render();
  }
}

async function updateTarget(id, value) {
  const response = await sendMessage({
    action: 'update-target-price',
    payload: { id, targetPrice: value },
  });
  if (!response?.ok) {
    alert(response?.error || 'Не удалось сохранить порог');
    return;
  }
  currentState = response.state;
  render();
}

async function onIntervalChange() {
  const minutes = Number(intervalInput.value);
  if (!Number.isFinite(minutes) || minutes < 5) {
    alert('Интервал не может быть меньше 5 минут');
    intervalInput.value = currentState?.refreshIntervalMinutes || 30;
    return;
  }
  const response = await sendMessage({ action: 'set-global-interval', payload: { minutes } });
  if (!response?.ok) {
    alert(response?.error || 'Не удалось сохранить интервал');
    intervalInput.value = currentState?.refreshIntervalMinutes || 30;
    return;
  }
  currentState = response.state;
  render();
}

async function manualRefresh() {
  refreshBtn.disabled = true;
  try {
    await sendMessage({ action: 'manual-refresh' });
    await loadState();
  } finally {
    refreshBtn.disabled = false;
  }
}

function openFullList() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tracked.html') });
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка обмена сообщениями', chrome.runtime.lastError);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function formatDate(value) {
  const date = new Date(value);
  return date.toLocaleString('ru-RU');
}

function formatChange(value) {
  if (typeof value !== 'number') {
    return '—';
  }
  const rounded = Math.round(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat('ru-RU').format(rounded)} ₽`;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'state-updated' && message.state) {
    currentState = message.state;
    render();
  }
});
