// Handles popup UI interactions and requests price data from the active tab.
const scanButton = document.getElementById('scan');
const priceList = document.getElementById('price-list');

scanButton?.addEventListener('click', async () => {
  priceList.innerHTML = '';

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  chrome.tabs.sendMessage(activeTab.id, { type: 'PRICE_CHECK_REQUEST' }, (response) => {
    const prices = response?.prices || [];
    if (!prices.length) {
      priceList.innerHTML = '<li class="empty">No prices detected</li>';
      return;
    }

    prices.forEach((price) => {
      const li = document.createElement('li');
      li.textContent = price;
      priceList.appendChild(li);
    });
  });
});
