// marketplaceSearchId -> iframe
var FRAMES = new Map();

function parseFrameWithRetries(sid, parser, callbackData, firstRetry, setLastRetry, timeouts) {
    for (var i = 0; i < timeouts.length; ++i) {
        const lastRetry = setLastRetry && i === timeouts.length - 1;
        setTimeout(parser, timeouts[i], sid, firstRetry + i, lastRetry, callbackData);
    }
}

function loadPageUsingFrame(frameId, frameUrl, callbackData, parser) {
    shopperLog(`${frameId}: start loading frame: ${frameUrl}`);

    try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = frameUrl;
        
        iframe.onload = () => {
            shopperLog(`${frameId}: frame loaded`);

            // Retry loading few times because we don't really
            // know when frame will be completely ready 
            parseFrameWithRetries(frameId, parser, callbackData, 0, true, [100, 3000, 5000, 15000, 25000]);

            setTimeout(() => {
                const iframe = FRAMES.get(frameId);
                if (iframe) {
                    FRAMES.delete(frameId);
                    iframe.remove();
                    shopperLog(`${frameId}: frame removed by timeout`);
                }
            }, 60000);
        };

        FRAMES.set(frameId, iframe);

        // Start parsing before possible onload triggered if site loading hangs
        parseFrameWithRetries(frameId, parser, callbackData, -3, false, [3000, 5000, 10000]);

        document.body.appendChild(iframe);
    } catch (e) {
        shopperLog(`${frameId}: error loading frame: ${e}`);
        throw e;
    }
}

function parseSearchFrame(frameId, retry, lastRetry, callbackData) {
    const iframe = FRAMES.get(frameId);
    if (!iframe) {
        return;
    }

    shopperLog(`${frameId}: ${retry} retry: parsing search frame`);

    iframe.contentWindow.postMessage({
        message_type: 'parse-marketplace.parse-search-result',
        marketplace_search_id: frameId,
        retry: retry,
        last_retry: lastRetry,
        callback_data: callbackData,
    }, '*');
}

function parseCardFrame(frameId, retry, lastRetry, callbackData) {
    const iframe = FRAMES.get(frameId);
    if (!iframe) {
        return;
    }

    shopperLog(`${frameId}: ${retry} retry: parsing card frame`);

    iframe.contentWindow.postMessage({
        message_type: 'parse-marketplace.parse-card',
        card_id: frameId,
        retry: retry,
        last_retry: lastRetry,
        callback_data: callbackData,
    }, '*');
}

function loadSearchUsingFrame(request, sendResponse) {
    loadPageUsingFrame(request.marketplace_search_id, request.url, null, parseSearchFrame);
    sendResponse();
    return true;
}

function loadCardUsingFrame(request, sendResponse) {
    loadPageUsingFrame(request.card_id, request.url, request.callback_data, parseCardFrame);
    sendResponse();
    return true;
}

function removeFrame(frameId, sendResponse) {
    shopperLog(`${frameId}: start removing frame`);

    try {
        const iframe = FRAMES.get(frameId);
        if (iframe) {
            FRAMES.delete(frameId);
            iframe.remove();
            shopperLog(`${frameId}: frame removed by signal`);
        } else {
            shopperLog(`${frameId}: frame removed before signal`);
        }
    } catch (e) {
        shopperLog(`${frameId}: error removing frame: ${e}`);
    }
    
    sendResponse();
    return true;
}


async function loadSearchUsingFetch(request, sendResponse) {
    const sid = request.marketplace_search_id;
    shopperLog(`${sid}: start fetching: ${request.url}`);

    try {
        const response = await fetch(request.url);
        const data = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');

        const marketplace = getMarketplaceBySearchPageUrl(request.url);
        const search = {
            marketplace: marketplace,
            marketplace_base_url: getMarketplaceBaseUrl(marketplace, request.url),
            doc_url: request.url,
        }

        const result = await parseMarketplaceSearchResult(search, doc);

        chrome.runtime.sendMessage({
            message_type: 'service-worker.marketplace-search-parsed',
            marketplace_search_id: request.marketplace_search_id,
            retry: 0,
            error: result.error,
            cards: result.cards,
        });
    } catch (e) {
        shopperLog(`${sid}: error fetching: ${e}`);
        throw e;
    }

    sendResponse();
    return true;
}


function init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.message_type) {
            case 'offscreen.search-using-fetch':
                return loadSearchUsingFetch(request, sendResponse);

            case 'offscreen.search-using-frame':
                return loadSearchUsingFrame(request, sendResponse);

            case 'offscreen.remove-search-frame':
                return removeFrame(request.marketplace_search_id, sendResponse);

            case 'offscreen.load-card-using-frame':
                return loadCardUsingFrame(request, sendResponse);

            case 'offscreen.remove-card-frame':
                return removeFrame(request.card_id, sendResponse);

        }
    });
}

init();