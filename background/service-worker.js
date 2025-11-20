// Handles extension lifecycle events and orchestrates price check messaging between popup and content scripts.
chrome.runtime.onInstalled.addListener(() => {
  console.log('PriceHunt installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PRICE_CHECK_REQUEST') {
    // Placeholder: eventually coordinate fetching or caching price data.
    sendResponse({ status: 'received' });
  }
});
