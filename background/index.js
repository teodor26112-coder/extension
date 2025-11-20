chrome.runtime.onInstalled.addListener(() => {
  console.log('PriceHunt background service worker initialized.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PRICEHUNT_PING') {
    sendResponse({ status: 'ok', source: 'background' });
  }
});
