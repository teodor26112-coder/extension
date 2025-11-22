async function parseSearchPage(data) {
    shopperLog(`start parsing search frame: ${document.URL}`);

    const marketplace = getMarketplaceBySearchPageUrl(document.URL);
    if (!marketplace) {
        shopperLog(`Not a search page: ${document.URL}`);
        return;
    }
    const search = {
        marketplace: marketplace,
        marketplace_base_url: getMarketplaceBaseUrl(marketplace, document.URL),
        doc_url: document.URL,
    }

    const result = await parseMarketplaceSearchResult(search, document);

    chrome.runtime.sendMessage({
        message_type: "service-worker.marketplace-search-parsed",
        marketplace_search_id: data.marketplace_search_id,
        retry: data.retry,
        last_retry: data.last_retry,
        callback_data: data.callback_data,
        cards: result.cards,
        error: result.error,
    });
}

async function parseCardPage(data) {
    shopperLog(`start parsing card frame: ${document.URL}`);

    const marketplace = getMarketplaceByCardPageUrl(document.URL);
    const isParsable = (marketplace !== null);

    let card = null;
    if (isParsable) {
        const needCompleteCard = (data.last_retry ? false : true);
        card = parseMarketplaceCard(marketplace, document, needCompleteCard);
    } else {
        shopperLog(`Not a card page: ${document.URL}`);
    }

    chrome.runtime.sendMessage({
        message_type: "service-worker.marketplace-card-parsed",
        card_id: data.card_id,
        card: card,
        retry: data.retry,
        last_retry: data.last_retry,
        parsable: isParsable,
        callback_data: data.callback_data,
    });
}


window.addEventListener(
    "message",
    async (event) => {
        if (event.origin !== `chrome-extension://${chrome.runtime.id}`) {
            return;
        }

        switch (event.data.message_type) {
            case 'parse-marketplace.parse-search-result':
                await parseSearchPage(event.data);
                break;

            case 'parse-marketplace.parse-card':
                await parseCardPage(event.data);
                break;
        }
    },
    false,
);

