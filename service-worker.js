importScripts('./config.js');
importScripts('./logger.js');
importScripts('./util.js');
importScripts('./marketplaces.js');
importScripts('./shopper-server.js');
importScripts('./watchlist.js');

let creating;
async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return Promise.resolve();
    }

    if (creating) {
        await creating;
        return Promise.resolve();
    }
    creating = chrome.offscreen.createDocument({
        url: chrome.runtime.getURL(path),
        reasons: [
            chrome.offscreen.Reason.DOM_PARSER,
            chrome.offscreen.Reason.DOM_SCRAPING,
            chrome.offscreen.Reason.IFRAME_SCRIPTING,
        ],
        justification: 'load external marketplaces (like ozon.ru) in background to parse it',
    });

    await creating;
    creating = null;
    return Promise.resolve();
}

function install() {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1, 2],
        addRules: [
            // Ali CDN blocks image requests from referer ozon.ru and some other
            {
                id: 1,
                priority: 1,
                condition: {
                    urlFilter: "https://*.alicdn.com/*",
                    resourceTypes: ['image'],
                },
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [
                        {header: 'Referer', operation: 'remove'},
                    ],
                },
            },

            // Disable CSP so marketplace webpages can be loaded inside offscreen iframe
            {
                id: 2,
                priority: 2,
                condition: {
                    initiatorDomains: [
                        chrome.runtime.id,
                        // Need these rules because sites might return redirect
                        // on first request inside iframe so request initiator will
                        // be changed from Shopper to site itself
                        "*.ozon.ru",
                        "ozon.ru",
                        "*.ozon.by",
                        "ozon.by",
                        "*.ozon.kz",
                        "ozon.kz",
                        "*.market.yandex.ru",
                        "market.yandex.ru",
                        "*.detmir.ru",
                        "detmir.ru",
                        "*.detmir.by",
                        "detmir.by",
                        "*.detmir.kz",
                        "detmir.kz",
                        "vseinstrumenti.ru",
                        "*.vseinstrumenti.ru",
                        "lemanapro.ru",
                        "*.lemanapro.ru",
                        "citilink.ru",
                        "*.citilink.ru",
                        "megamarket.ru",
                        "*.megamarket.ru",
                        "aliexpress.ru",
                        "*.aliexpress.ru",
                        "petshop.ru",
                        "*.petshop.ru"
                    ],
                    resourceTypes: ['main_frame', 'sub_frame', 'script'],
                },
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [
                        {header: 'X-Frame-Options', operation: 'remove'},
                        {header: 'Frame-Options', operation: 'remove'},
                        {header: 'Content-Security-Policy', operation: 'remove'},
                    ],
                },
            },
        ],
    });
}

SEARCH_CHECK_READY_TIME = 200
MAX_SEARCH_TIME = 60000

const SearchStatus = Object.freeze({
    FINISHED:  Symbol("finished"),
    WAITING:   Symbol("waiting"),
    TIMEOUT:   Symbol("timeout"),
    ERROR:     Symbol("error"),
    CANCELLED: Symbol("cancelled"),
});


class Search {
    constructor(searchId, marketplaceSearchId) {
        this.searchId = searchId;
        this.marketplaceSearchId = marketplaceSearchId
        this.waitTime = 0;
        this.status = SearchStatus.WAITING;
        this.cards = null;
        this.error = null;
    }
}

// marketplaceSearchId -> Search
let SEARCHES = new Map();

function createSearch(searchId, marketplaceSearchId) {
    const search = new Search(searchId, marketplaceSearchId);
    SEARCHES.set(search.marketplaceSearchId, search);
    return search;
}

function setSearchResult(marketplaceSearchId, status, cards, error) {
    shopperLog(`${marketplaceSearchId}: set status ${status.toString()}`);

    const search = SEARCHES.get(marketplaceSearchId);
    if (search) {
        search.cards = cards || null;
        search.status = status;
        search.error = error;
    }
}

function findSearches(searchId) {
    let result = [];

    SEARCHES.forEach((search, _) => {
        if (search.searchId === searchId) {
            result.push(search);
        }
    });

    return result;
}

async function waitSearchReady(search) {
    return new Promise(resolve => {
        (function doWait() {
            const search_ = SEARCHES.get(search.marketplaceSearchId);
            if (!search_) {
                shopperLog(`${search.marketplaceSearchId}: search already was finished`)
                return resolve();
            }

            search_.waitTime += SEARCH_CHECK_READY_TIME;

            if (search_.status === SearchStatus.WAITING) {
                if (search_.waitTime <= MAX_SEARCH_TIME) {
                    // Wait until long running background operation will be completed (up to 60sec).
                    // Call API function to not let suspend the service worker.
                    // See https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers#keep_a_service_worker_alive_continuously
                    chrome.runtime.getPlatformInfo();

                    setTimeout(doWait, SEARCH_CHECK_READY_TIME);
                    return;
                }

                setSearchResult(search.marketplaceSearchId, SearchStatus.TIMEOUT);
            }

            SEARCHES.delete(search.marketplaceSearchId);
            return resolve();
        })();
    });
}

async function handleSearchMarketplace(request, sender, sendResponse) {
    const sid = request.marketplace_search_id;
    shopperLog(`${sid}: start search`);

    try {
        const marketplace = getMarketplaceById(request.marketplace_id);
        if (!marketplace) {
            shopperLog(`${sid}: unknown marketplace`);
            sendResponse({
                marketplace: {id: request.marketplace_id},
                ok: false,
                status: Search.ERROR,
                error: 500,
            });
            return;
        }

        const search = createSearch(request.search_id, request.marketplace_search_id);

        shopperLog(`${sid}: making search request`);
        switch (marketplace.search_method) {
            case 'iframe': {
                await chrome.runtime.sendMessage({
                    message_type: "offscreen.search-using-frame",
                    marketplace_search_id: search.marketplaceSearchId,
                    url: request.search_url,
                });
                break;
            }

            case 'fetch': {
                await chrome.runtime.sendMessage({
                    message_type: "offscreen.search-using-fetch",
                    marketplace_search_id: search.marketplaceSearchId,
                    url: request.search_url,
                });
                break;
            }
        }

        shopperLog(`${sid}: waiting search result`);
        await waitSearchReady(search);

        if (marketplace.search_method === 'iframe') {
            chrome.runtime.sendMessage({
                message_type: "offscreen.remove-search-frame",
                marketplace_search_id: search.marketplaceSearchId,
            });
        }

        if (search.status !== SearchStatus.FINISHED) {
            shopperLog(`${sid}: search error, status=${search.status.toString()}, error=${search.error}`);
            sendResponse({
                marketplace: marketplace,
                ok: false,
                status: search.status,
                error: search.error,
            });
            return Promise.resolve();
        }

        shopperLog(`${sid}: search finished ok: n_cards=${search.cards ? search.cards.length : 0}`);
        sendResponse({
            marketplace: marketplace,
            ok: true,
            cards: search.cards,
            status: search.status,
            error: 0,
        });

        return Promise.resolve();
    } catch (e) {
        shopperLog(`${sid}: search failed: ${e}`);
        throw e;
    }
}

function handleMarketplaceSearchParsed(request, sender, sendResponse) {
    shopperLog(`${request.marketplace_search_id}: handle marketplace search parsed: n_cards=${request.cards ? request.cards.length : 0}, error=${request.error}`);

    if (request.error === null && request.retry < 3) {
        if (!request.cards || request.cards.length === 0) {
            return;
        }
    }

    if (request.cards && request.cards.length > 0) {
        setSearchResult(request.marketplace_search_id, SearchStatus.FINISHED, request.cards);
    } else {
        setSearchResult(request.marketplace_search_id, SearchStatus.ERROR, null, request.error || 404);
    }
    sendResponse();
}

async function handleMarketplaceCardParsed(request, sender, sendResponse) {
    shopperLog(`${request.card_id}: handle marketplace card parsed: has_card=${request.card != null}`);

    await watchlistCardUpdated(request.card_id, request.card, request.last_retry, request.parsable, request.callback_data);
    sendResponse();
}

function handleLog(request, sender, sendResponse) {
    shopperStoreLog(request);
    sendResponse();
}

function handleCancelSearch(request, sender, sendResponse) {
    shopperLog(`${request.search_id}: handle cancel search`);

    const searches = findSearches(request.search_id);
    for (var search of searches) {
        setSearchResult(search.marketplaceSearchId, SearchStatus.CANCELLED);
    }

    sendResponse();
}

async function handleUpdateWatching(request, sender, sendResponse) {
    shopperLog(`handle set watching: url=${request.card.link}, price=${formatMoney(request.card.price)}, watching=${request.watch_enabled}`);

    const isOk = await updateWatchlistItem(request.card, request.country, request.watch_enabled, request.alert_price || null);
    const isFull = !isOk;

    shopperLog(`watch changed: url=${request.card.link}, price=${formatMoney(request.card.price)}, is_full=${isFull}`);

    sendResponse(isFull);
}

async function handleOpenUrl(request, sender, sendResponse) {
    await chrome.tabs.create({ url: request.url });

    const window = await chrome.windows.getLastFocused();
    if (window) {
        await chrome.windows.update(window.id, { focused: true });
    }
    sendResponse();
}

async function handleShowSettings(request, sender, sendResponse) {
    const lastWindow = await chrome.windows.getLastFocused();
    await chrome.action.openPopup({windowId: lastWindow.id});
}

async function handleCheckNotificationsPermission(request, sender, sendResponse) {
    let level = await chrome.notifications?.getPermissionLevel();

    let grantedNotifications = await chrome.permissions.contains({
        permissions: ['notifications'],
    });

    let granted = (level === "granted" && grantedNotifications);
    if (!granted && request.request_permissions) {
        const lastWindow = await chrome.windows.getLastFocused();
        await chrome.action.openPopup({windowId: lastWindow.id});

        await chrome.runtime.sendMessage({
            message_type: 'popup.show-setting',
            setting: 'enable-watchlist',
        });
    }

    sendResponse(granted);
}

function handleTabChanged(tabId, changeInfo, tab) {
    if (!changeInfo.status || changeInfo.status !== 'complete') {
        return;
    }

    if (!tab.url) {
        return;
    }

    const marketplace = getMarketplaceByHostname(tab.url);
    if (!marketplace) {
        return;
    }

    chrome.tabs.sendMessage(tabId, {
        message_type: 'content-script.tab-loaded',
        tab_url: tab.url,
    });
}

async function handleWatchlistAlarm() {
    initNotifications();
    await refreshWatchlist();
}

async function handleWatchlistRefreshAlarm() {
    await runRefreshWatchlistWorkerStep();
}

async function initAlarms() {
    const WatchlistUpdateInterval = 5;
    const watchlistAlarm = await chrome.alarms.get("watchlist");
    if (watchlistAlarm?.periodInMinutes !== WatchlistUpdateInterval) {
        await chrome.alarms.create("watchlist", {
            delayInMinutes: 1,
            periodInMinutes: WatchlistUpdateInterval,
        });
    }


    chrome.alarms.onAlarm.addListener(async (alarm) => {
        shopperLog(`Got alarm: ${alarm.name}`)
        switch (alarm.name) {
            case 'watchlist':
                return await handleWatchlistAlarm();
            case 'watchlist-refresh':
                return await handleWatchlistRefreshAlarm();
        }
    });
}

async function handleNotificationButtonClicked(notificationId, buttonIndex) {
    shopperLog(`Notification button clicked: ${notificationId}, ${buttonIndex}`);
    await handleWatchlistNotificationClick(notificationId, buttonIndex);
}

async function handleNotificationClicked(notificationId) {
    shopperLog(`Notification clicked: ${notificationId}`);
    await handleWatchlistNotificationClick(notificationId, null);
}

async function handleNotificationClosed(notificationId, byUser) {
    shopperLog(`Notification closed: ${notificationId}, ${byUser}`);
    await handleWatchlistNotificationClosed(notificationId);
}

let NOTIFICATIONS_INITIALIZED = false;
function initNotifications() {
    // Notifications permissions might not be granted
    shopperLog(`Init notifications: ${!!chrome.notifications}, ${NOTIFICATIONS_INITIALIZED}`);
    if (chrome.notifications && !NOTIFICATIONS_INITIALIZED) {
        chrome.notifications.onButtonClicked.addListener(handleNotificationButtonClicked);
        chrome.notifications.onClicked.addListener(handleNotificationClicked);
        chrome.notifications.onClosed.addListener(handleNotificationClosed);
        NOTIFICATIONS_INITIALIZED = true;
    }
}

function handlePermissionsAdded(permissions) {
    shopperLog(`Permissions acquired: ${permissions.permissions}`)
    initNotifications();
}

function handleMessage(request, sender, sendResponse) {
    switch (request.message_type) {
        case 'service-worker.search-marketplace':
            handleSearchMarketplace(request, sender, sendResponse);
            return true;

        case 'service-worker.marketplace-search-parsed':
            handleMarketplaceSearchParsed(request, sender, sendResponse);
            return;

        case 'service-worker.cancel-search': {
            handleCancelSearch(request, sender, sendResponse);
            return;
        }

        case 'service-worker.marketplace-card-parsed':
            handleMarketplaceCardParsed(request, sender, sendResponse);
            return true;

        case 'service-worker.update-watching': {
            handleUpdateWatching(request, sender, sendResponse);
            return true;
        }

        case 'service-worker.open-url': {
            handleOpenUrl(request, sender, sendResponse);
            return true;
        }

        case 'service-worker.log':
            handleLog(request, sender, sendResponse);
            return;

        case 'service-worker.show-settings':
            handleShowSettings(request, sender, sendResponse);
            return;

        case 'service-worker.check-notifications-permission':
            handleCheckNotificationsPermission(request, sender, sendResponse);
            return true;
    }
}

async function init() {
    chrome.runtime.onInstalled.addListener(install);
    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.tabs.onUpdated.addListener(handleTabChanged);
    chrome.permissions.onAdded.addListener(handlePermissionsAdded);

    await setupOffscreenDocument('src/offscreen.html');
    await initAlarms();
    initNotifications();
    shopperLog('Service worker started');
}

init();
