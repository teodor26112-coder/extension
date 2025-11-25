// Injected into supported pages to extract price-related elements and respond to price scan requests.
const collectPrices = () => {
  const samplePriceNodes = document.querySelectorAll('[data-price], .price');
  return Array.from(samplePriceNodes)
    .map((node) => node.textContent?.trim())
    .filter(Boolean);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PRICE_CHECK_REQUEST') {
    sendResponse({ prices: collectPrices() });
  }
});
