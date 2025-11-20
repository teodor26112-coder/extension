(() => {
  const priceRegex = /\$\s?\d+[\d,]*(\.\d{2})?/gi;
  const matches = Array.from(document.body.innerText.matchAll(priceRegex)).map((match) => match[0]);

  if (matches.length === 0) {
    return;
  }

  chrome.storage.sync.set({ lastSeenPrices: matches.slice(0, 20) });

  chrome.runtime.sendMessage({ type: 'PRICEHUNT_PING', prices: matches }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }

    if (response?.status === 'ok') {
      console.debug('PriceHunt content script received acknowledgment from background.');
    }
  });
})();
