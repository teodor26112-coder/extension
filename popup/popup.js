const priceList = document.getElementById('price-list');

chrome.storage.sync.get('lastSeenPrices', ({ lastSeenPrices = [] }) => {
  if (!lastSeenPrices.length) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No prices detected yet.';
    emptyItem.className = 'empty';
    priceList.appendChild(emptyItem);
    return;
  }

  lastSeenPrices.slice(0, 10).forEach((price) => {
    const item = document.createElement('li');
    item.textContent = price;
    priceList.appendChild(item);
  });
});
