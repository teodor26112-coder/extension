import { calcStats, formatPrice, renderChart } from './ui-helpers.js';

const list = document.getElementById('tracked-list');
const template = document.getElementById('tracked-item-template');
const empty = document.getElementById('tracked-empty');
const refreshButton = document.getElementById('refresh-page');

refreshButton.addEventListener('click', () => manualRefresh());
loadAndRender();

async function loadAndRender() {
  const response = await sendMessage({ action: 'get-state' });
  if (!response?.ok) {
    empty.textContent = response?.error || 'Не удалось загрузить данные.';
    return;
  }
  render(response.state);
}

function render(state) {
  const items = Array.isArray(state.items) ? state.items : [];
  list.innerHTML = '';
  if (!items.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.querySelector('.item-title').textContent = item.title || 'Товар Ozon';
    const link = node.querySelector('.item-link');
    link.href = item.url;
    const stats = calcStats(item);
    node.querySelector('.stat-current').textContent = formatPrice(stats.current);
    node.querySelector('.stat-average').textContent = formatPrice(stats.average);
    node.querySelector('.stat-target').textContent = formatPrice(
      typeof item.targetPrice === 'number' ? item.targetPrice : null
    );
    node.querySelector('.item-remove').addEventListener('click', () => removeItem(item.id));
    renderChart(node.querySelector('.chart'), item.history);
    list.appendChild(node);
  });
}

async function manualRefresh() {
  refreshButton.disabled = true;
  try {
    await sendMessage({ action: 'manual-refresh' });
    await loadAndRender();
  } finally {
    refreshButton.disabled = false;
  }
}

async function removeItem(id) {
  const response = await sendMessage({ action: 'remove-product', payload: { id } });
  if (response?.ok) {
    render(response.state);
  }
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
