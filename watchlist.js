const MAX_WATCHLIST_SIZE = 100;
const WATCHLIST_WORKER_LOCK_KEY = 'watchlist_refresh_lock';

const REFRESH_STATUS_BOOKED = 'booked';
const REFRESH_STATUS_RUNNING = 'running';
const REFRESH_STATUS_SUCCESS = 'success';
const REFRESH_STATUS_ERROR = 'error';

const MIN_CARD_UPDATE_INTERVAL = 30 * 60;
const MIN_NOTIFY_INTERVAL_WHEN_PRICE_NOT_CHANGED = 60 * 60;
const MIN_HISTORY_MERGE_INTERVAL = 5 * 60;
const CARD_REFRESH_TIMEOUT = 30;
const MAX_PARALLEL_REFRESHING_CARDS = 10;
const MAX_RUNNING_TIME = 1*60;
const MAX_HISTORY_AGE = 90 * 24 * 60 * 60; // 90 days
const MAX_HISTORY_LENGTH = 5000;
const MAX_DISABLED_ITEM_AGE = 30 * 24 * 60 * 60; // 30 days

function _removeUrlParams(url) {
    const urlObject = new URL(url);
    return urlObject.origin + urlObject.pathname;
}

async function _getDataUrl(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        shopperLog(`Error converting image to data URL: ${e}`);
        return null;
    }
};


const WATCHLIST_NOTIFICATION_KEY = 'watch-notifications';

async function _getWatchNotifications() {
    const items = await chrome.storage.local.get(WATCHLIST_NOTIFICATION_KEY);
    if (!items) {
        return {};
    }

    return items[WATCHLIST_NOTIFICATION_KEY] || {};
}

async function _setWatchNotifications(notifications) {
    await chrome.storage.local.set({[WATCHLIST_NOTIFICATION_KEY]: notifications});
}

function _cleanupNotifications(notifications) {
    let toDelete = [];

    for (var [notificationId, notification] of Object.entries(notifications)) {
        const created = new Date(notification.created);
        if (secondsBetween(new Date(), created) > 48*60*60) {
            toDelete.push(notificationId);
        }
    }

    for (var notificationId of toDelete) {
        delete notifications[notificationId];
    }
}

async function handleWatchlistNotificationClosed(notificationId) {
    let notifications = await _getWatchNotifications();
    const notification = notifications[notificationId];
    if (!notification) {
        return;
    }
    delete notifications[notificationId];
    await _setWatchNotifications(notifications);
}

async function handleWatchlistNotificationClick(notificationId, buttonIndex) {
    await chrome.notifications.clear(notificationId);

    let notifications = await _getWatchNotifications();
    const notification = notifications[notificationId];
    if (!notification) {
        return;
    }

    if (notification.click_url) {
        if (!buttonIndex || buttonIndex === 0) {
            await chrome.tabs.create({ url: notification.click_url });
            const window = await chrome.windows.getLastFocused();
            if (window) {
                await chrome.windows.update(window.id, { focused: true });
            }
        }
    }

    delete notifications[notificationId];
    _cleanupNotifications(notifications);

    await _setWatchNotifications(notifications);
}

async function _notify(title, iconUrl, message, clickUrl, clearTimeout) {
    const shopperSettings = await getShopperSettings();
    if (shopperSettings.enable_watchlist === false) {
        shopperLog(`Watch: shopper notifications disabled`);
        return;
    }

    let level = await chrome.notifications.getPermissionLevel();
    if (level !== "granted") {
        shopperLog(`Watch: system notifications disabled, level=${level}`);
        return;
    }

    try {
        if (iconUrl) {
            iconUrl = await _getDataUrl(iconUrl);
        }
        if (!iconUrl) {
            iconUrl = '../icons/icon128.png';
        }

        let buttons = [];
        if (clickUrl) {
            buttons.push({ title: 'Открыть товар' });
        } else {
            buttons.push({ title: 'Закрыть' });
        }

        const notificationId = await chrome.notifications.create({
            type: 'basic',
            title: title,
            iconUrl: iconUrl,
            message: message,
            buttons: buttons,
            priority: 0,
            requireInteraction: !!clickUrl,
        });

        if (clickUrl) {
            let notifications = await _getWatchNotifications();
            notifications[notificationId] = {click_url: clickUrl, created: new Date()};
            await _setWatchNotifications(notifications);
        }

        if (clearTimeout) {
            setTimeout(
                () => { chrome.notifications.clear(notificationId); },
                clearTimeout,
            );
        }

        shopperLog(`Watch: notified using system message`);
    } catch (e) {
        shopperLog(`Watch: system message failed: ${e}`);
    }
}

const WATCHLIST_STORAGE_PREFIX = 'watch/';

function _makeWatchItemKey(cardId) {
    return `${WATCHLIST_STORAGE_PREFIX}${cardId}`;
}

async function getWatchlist() {
    const allKeys = await chrome.storage.local.getKeys();
    const watchKeys = allKeys.filter((key) => key.startsWith(WATCHLIST_STORAGE_PREFIX));
    const watchlistItems = await chrome.storage.local.get(watchKeys);
    let watchlist = {};
    for (const [key, watchItem] of Object.entries(watchlistItems)) {
        const cardId = key.substring(WATCHLIST_STORAGE_PREFIX.length);
        watchlist[cardId] = watchItem;
    }

    return watchlist;
}

async function clearWatchlist() {
    shopperWatch('clear');
    const watchlist = await getWatchlist();
    let keys = [];
    for (const cardId of Object.keys(watchlist)) {
        keys.push(_makeWatchItemKey(cardId));
    }
    await chrome.storage.local.remove(keys);
}

function _getCardId(cardOrCardId) {
    const cardUrl = (typeof cardOrCardId === 'string' || cardOrCardId instanceof String) ? cardOrCardId : cardOrCardId.link;
    const cardId = _removeUrlParams(cardUrl);
    if (!cardId) {
        throw Error(`Invalid url: ${cardUrl}`)
    }
    return cardId;
}

async function getWatchlistItem(cardOrCardId) {
    const cardId = _getCardId(cardOrCardId);
    const watchId = _makeWatchItemKey(cardId);
    const items = await chrome.storage.local.get(watchId);
    return items?.[watchId] || null;
}

async function setWatchlistItem(cardOrCardId, watchItem) {
    const cardId = _getCardId(cardOrCardId);
    await chrome.storage.local.set({
        [_makeWatchItemKey(cardId)]: watchItem,
    });
}

async function removeWatchlistItem(cardId) {
    await chrome.storage.local.remove(_makeWatchItemKey(cardId));
}

async function cleanWatchlistItemHistory(cardId) {
    const watchItem = await getWatchlistItem(cardId);
    if (watchItem) {
        watchItem.history = [];
        await setWatchlistItem(cardId, watchItem);
        shopperWatch('clean', watchItem.card);
    }
}

async function isWatching(card) {
    const watchItem = await getWatchlistItem(card);
    return watchItem !== null && watchItem.enabled === true;
}

function _addWatchItemHistoryPoint(watchItem, newPrice, now) {
    if (!newPrice || !newPrice.value || !newPrice.currency || !now) {
        throw Error(`Invalid parameters to add history point: ${newPrice}, ${now}`);
    }

    let isNewPoint = false;

    const lastHist = watchItem.history.at(-1);
    if (watchItem.history.length <= 1 ||     // Always keep first point to track start of watch
        lastHist.price.value !== newPrice.value ||
        lastHist.price.currency !== newPrice.currency ||
        secondsBetween(now, new Date(lastHist.dttm)) >= MIN_HISTORY_MERGE_INTERVAL)
    {
        isNewPoint = true;
    }

    if (isNewPoint) {
        watchItem.history.push({
            dttm: now.toJSON(),
            price: {
                value: newPrice.value,
                currency: newPrice.currency,
            },
        });
    } else {
        lastHist.dttm = now.toJSON();
    }

    return isNewPoint;
}

function _enabledItemsCount(watchlist) {
    let result = 0;
    for (const watchItem of Object.values(watchlist)) {
        if (watchItem.enabled) {
            result += 1;
        }
    }

    return result;
}

async function _addItemToWatchlist(card, country, alertPrice, showNotification) {
    const watchlist = await getWatchlist();
    if (_enabledItemsCount(watchlist) > MAX_WATCHLIST_SIZE) {
        return false;
    }

    const cardId = _getCardId(card);
    const now = new Date();

    const watchItem = (await getWatchlistItem(cardId)) || {};
    watchItem.enabled = true;
    watchItem.card = card;
    watchItem.country = country;
    watchItem.history = watchItem.history || [];
    watchItem.alert_price = alertPrice;
    watchItem.last_notify = null;
    watchItem.refresh = {
        id: null,
        status: null,
        update: null,
        force: false,
        error: null,
    };
    watchItem.create_dttm = now.toJSON();
    await setWatchlistItem(cardId, watchItem);

    await watchlistCardUpdated(
        cardId, card, true, true, {refresh_id: _makeRefreshId(cardId, now)}
    );

    if (showNotification) {
        await _notify(
            card.title,
            null,
            `Сообщим если цена будет ниже ${formatMoney(alertPrice, 'text')}`,
            null,
            6000,
        );
    }

    shopperWatch('start', watchItem.card, alertPrice);

    return true;
}

async function _disableItemInWatchlist(card) {
    const cardId = _getCardId(card);
    const watchItem = await getWatchlistItem(cardId);
    if (!watchItem) {
        return false;
    }
    watchItem.enabled = false;
    await setWatchlistItem(cardId, watchItem);
    shopperWatch('stop', watchItem.card);

    return true;
}

async function updateWatchlistItem(card, country, watching, alertPrice, showNotification = true) {
    if (watching) {
        return _addItemToWatchlist(card, country, alertPrice, showNotification);
    } else {
        return _disableItemInWatchlist(card);
    }
}

function _isWatchItemRefreshingHangs(watchItem, now) {
    if (!watchItem.refresh?.update) {
        return false;
    }

    const updateDttm = new Date(watchItem.refresh?.update);
    if (watchItem.refresh.status === REFRESH_STATUS_RUNNING &&
        secondsBetween(now, updateDttm) > MAX_RUNNING_TIME)
    {
        return true;
    }

    return false;
}

// Cache with refresh_id of recently handled refreshes.
// Used to quickly check if price refresh already was handled without reading whole watchlist.
// It is cleared periodically (e.g. when service worker suspended bybrowser or during refreshWatchlist)
let WATCHLIST_HANDLED_REFRESH_IDS_CACHE = {};

function _makeRefreshId(cardId, now) {
    if (!now) {
        now = new Date();
    }
    return `${cardId}/${now.toJSON()}`;
}

async function _watchlistCleanupObsolete() {
    const now = new Date();
    const watchlist = await getWatchlist();

    let removedCards = [];
    let updatedCards = {};
    for (const [cardId, watchItem] of Object.entries(watchlist))
    {
        if (!watchItem.enabled &&
            secondsBetween(now, new Date(watchItem.create_dttm)) > MAX_DISABLED_ITEM_AGE)
        {
            removedCards.push(cardId);
            continue;
        }

        let updated = false;
        while (watchItem.history.length >= MAX_HISTORY_LENGTH ||
               secondsBetween(now, new Date(watchItem.history[0].dttm)) > MAX_HISTORY_AGE)
        {
            watchItem.history.shift();
            updated = true;
        }

        if (updated) {
            updatedCards[_makeWatchItemKey(cardId)] = watchItem;
            continue;
        }

        if (_isWatchItemRefreshingHangs(watchItem, now)) {
            watchItem.refresh.status = REFRESH_STATUS_ERROR;
            watchItem.refresh.error = 'Ошибка';
            updatedCards[_makeWatchItemKey(cardId)] = watchItem;
            shopperLog(`Watch: resetting hung refresh status, card_id=${cardId}`);
            continue;
        }
    }

    await chrome.storage.local.remove(removedCards.map((cardId) => _makeWatchItemKey(cardId)));
    await chrome.storage.local.set(updatedCards);

    shopperLog(
        `Watch: cleaned up ${Object.keys(updatedCards).length} history items, ` +
        `removed ${removedCards.length} cards`,
    );
}

async function _watchlistStartRefreshCards(force) {
    shopperLog(`Watch: refreshing cards`);

    const now = new Date();
    WATCHLIST_HANDLED_REFRESH_IDS_CACHE = {};

    let nSkipDisabled = 0;
    let nSkipBooked = 0;
    let nSkipRefreshing = 0;
    let nResetHung = 0;
    let nSkipTooEarly = 0;
    let nRefresh = 0;
    let nError = 0;

    let watchlist = await getWatchlist();
    const watchItems = Object.values(watchlist);

    // Book items for refreshing
    for (const watchItem of watchItems)
    {
        if (!watchItem.enabled) {
            nSkipDisabled += 1;
            continue;
        }

        if (!watchItem.refresh) {
            watchItem.refresh = {};
        }

        if (!force)
        {
            const isHung = _isWatchItemRefreshingHangs(watchItem, now);

            if (watchItem.refresh.status === REFRESH_STATUS_BOOKED) {
                nSkipBooked += 1;
                continue;
            }

            if (watchItem.refresh.status === REFRESH_STATUS_RUNNING && !isHung) {
                nSkipRefreshing += 1;
                continue;
            }

            if (isHung) {
                nResetHung += 1;
            }

            const histItem = watchItem.history.at(-1);
            if (histItem && secondsBetween(now, new Date(histItem.dttm)) < MIN_CARD_UPDATE_INTERVAL) {
                nSkipTooEarly += 1;
                continue;
            }
        }

        if (watchItem.refresh.status === REFRESH_STATUS_ERROR) {
            nError += 1;
        }

        watchItem.refresh.status = REFRESH_STATUS_BOOKED;
        watchItem.refresh.update = (new Date()).toJSON();
        watchItem.refresh.force = force || false;
        await setWatchlistItem(_getCardId(watchItem.card), watchItem);

        nRefresh += 1
    }

    shopperLog(
        `Watch: going to start refresh cards: ` +
        `total=${watchItems.length}, ` +
        `refresh=${nRefresh}, ` +
        `skip_disabled=${nSkipDisabled}, ` +
        `skip_too_early=${nSkipTooEarly}, ` +
        `skip_refreshing=${nSkipRefreshing}, ` +
        `skip_booked=${nSkipBooked}, ` +
        `reset_hung=${nResetHung}, ` +
        `error=${nError}, ` +
        `force=${force}`
    );

    // Schedule refresh worker to process booked items and run first step of refresh immediately
    await runRefreshWatchlistWorkerStep(force);
}

async function refreshWatchlist(force) {
    shopperLog(`Watch: refreshing watchlist`);

    try {
        await _watchlistCleanupObsolete();
        await _watchlistStartRefreshCards(force);
        shopperLog(`Watch: refreshed watchlist ok`);
    } catch (e) {
        shopperLog(`Watch: refreshed watchlist error: ${e}`);
    }
}

async function _acquireWacthlistWorkerLock() {
    const LOCK_TIMEOUT = 3000;
    const MAX_LOCK_WAIT = 5000;
    const now = Date.now();
    const waitUntil = now + MAX_LOCK_WAIT;
    let acquired = false;
    while (!acquired && now < waitUntil) {
        const lock = await chrome.storage.local.get(WATCHLIST_WORKER_LOCK_KEY);
        if (!lock[WATCHLIST_WORKER_LOCK_KEY] || now - lock[WATCHLIST_WORKER_LOCK_KEY] > LOCK_TIMEOUT) {
            acquired = true;
        } else {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (!acquired) {
        shopperLog('Watch: failed to acquire refresh worker lock');
        return false;
    }

    await chrome.storage.local.set({ [WATCHLIST_WORKER_LOCK_KEY]: Date.now() });
    shopperLog('Watch: refresh worker lock acquired');
    return true;
}

async function _releaseWatchlistWorkerLock() {
    await chrome.storage.local.remove(WATCHLIST_WORKER_LOCK_KEY);
}

async function _startWatchlistRefreshWorker() {
    const alarm = await chrome.alarms.get("watchlist-refresh");
    if (!alarm) {
        await chrome.alarms.create("watchlist-refresh", {
            delayInMinutes: 0.5,
            periodInMinutes: 0.5,
        });
    }

    return await _acquireWacthlistWorkerLock();
}

async function _stopWatchlistRefreshWorker() {
    await chrome.alarms.clear("watchlist-refresh");
    await _releaseWatchlistWorkerLock();
}

async function runRefreshWatchlistWorkerStep(force) {
    // Service worker can't have long-living functions,
    // so this worker usually get killed after about 1 minute.
    // It'll be restarted by alarm.
    // In rare case two concurrent workers might refresh same card twice - it's ok.
    const lockAcquired = await _startWatchlistRefreshWorker();
    if (!lockAcquired) {
        shopperLog('Watch: skipping refresh worker due to lock');
        return;
    }

    shopperLog(`Watch: refreshing watchlist worker started`);
    const now = new Date();
    const watchlist = await getWatchlist();
    const watchItems = Object.values(watchlist);
    const waitTimeout = force ? 100 : 1000;

    let refreshItemsLeft = MAX_PARALLEL_REFRESHING_CARDS;
    for (var i = 0; i < watchItems.length; i++) {
        const isHung = _isWatchItemRefreshingHangs(watchItems[i], now);
        if (watchItems[i].refresh?.status === REFRESH_STATUS_RUNNING && !isHung) {
            refreshItemsLeft -= 1;
            if (refreshItemsLeft === 0) {
                break;
            }
        }
    }

    if (refreshItemsLeft === 0) {
        shopperLog('Already refreshing max items');
        await _releaseWatchlistWorkerLock();
        return;
    }

    for (var i = 0; i < watchItems.length && refreshItemsLeft > 0; i++) {
        if (watchItems[i].refresh?.status !== REFRESH_STATUS_BOOKED) {
            continue;
        }

        refreshItemsLeft -= 1;
        await startRefreshWatchlistItem(watchItems[i]);
        await new Promise(resolve => setTimeout(resolve, waitTimeout));
    }

    let allItemsDone = true;
    for (var i = 0; i < watchItems.length; i++) {
        if (watchItems[i].refresh?.status === REFRESH_STATUS_BOOKED) {
            allItemsDone = false;
            break;
        }
    }

    if (allItemsDone) {
        await _stopWatchlistRefreshWorker();
        shopperLog(`Watch: refreshing watchlist worker finished`);
    } else {
        shopperLog(`Watch: refreshing watchlist worker will be restarted`);
    }
}

async function startRefreshWatchlistItem(watchItem) {
    const now = new Date();
    const cardId = _getCardId(watchItem.card);

    if (!watchItem.refresh) {
        watchItem.refresh = {};
    }

    if (watchItem.refresh.status === REFRESH_STATUS_RUNNING &&
        secondsBetween(now, new Date(watchItem.refresh.update)) < CARD_REFRESH_TIMEOUT)
    {
        shopperLog(`Watch: already refreshing, card_id=${cardId}`);
        return;
    }

    watchItem.refresh.status = REFRESH_STATUS_RUNNING;
    watchItem.refresh.update = now.toJSON();
    watchItem.refresh.error = null;
    await setWatchlistItem(_getCardId(watchItem.card), watchItem);

    const lastUpdateDttm = watchItem.history.at(-1)?.dttm;
    let diffUpdate = -1;
    if (lastUpdateDttm) {
        diffUpdate = secondsBetween(now, new Date(lastUpdateDttm));
    }
    shopperLog(
        `Watch: start refresh card, ` +
        `card_id=${cardId}, ` +
        `last_update=${lastUpdateDttm}/${diffUpdate}s, ` +
        `force=${watchItem.refresh?.force}`,
    );

    try {
        await chrome.runtime.sendMessage({
            message_type: "offscreen.load-card-using-frame",
            card_id: cardId,
            url: cardId,
            callback_data: {
                refresh_id: _makeRefreshId(cardId),
            },
        });
    } catch (e) {
        watchItem.refresh.status = 'error';
        watchItem.refresh.update = null;
        watchItem.refresh.error = 'Ошибка';
        await setWatchlistItem(_getCardId(watchItem.card), watchItem);
        shopperLog(`Watch: error sending message to refresh card, card_id=${cardId}: ${e}`);
    }
}

function _checkNeedNotify(card, watchItem) {
    if (!watchItem.enabled) {
        return false;
    }

    if (!watchItem.alert_price || card.price.value > watchItem.alert_price.value) {
        return false;
    }

    if (watchItem.refresh?.force !== true && watchItem.last_notify)
    {
        const now = new Date();
        const lastNotifyDttm = new Date(watchItem.last_notify.dttm);
        if (watchItem.last_notify.price.value === card.price.value &&
            secondsBetween(now, lastNotifyDttm) < MIN_NOTIFY_INTERVAL_WHEN_PRICE_NOT_CHANGED)
        {
            return false;
        }
    }

    return true;
}

async function watchlistCardUpdated(cardId, card, lastRetry, parsable, callbackData) {
    if (!card && parsable && !lastRetry) {
        return;
    }

    const handled = WATCHLIST_HANDLED_REFRESH_IDS_CACHE[callbackData.refresh_id];
    if (handled) {
        return Promise.resolve();
    }
    WATCHLIST_HANDLED_REFRESH_IDS_CACHE[callbackData.refresh_id] = true;

    chrome.runtime.sendMessage({
        message_type: "offscreen.remove-card-frame",
        card_id: cardId,
    });

    const watchItem = await getWatchlistItem(cardId);
    if (!watchItem) {
        shopperLog(`Watch: card refreshed, card_id=${cardId}, msg=card not found in watchlist`);
        return;
    }


    if (watchItem.refresh.id === callbackData.refresh_id) {
        shopperLog(`Watch: card refreshed, card_id=${cardId}, msg=refresh already handled`);
        return;
    }
    watchItem.refresh.id = callbackData.refresh_id;

    if ((!card || !card.price) && (lastRetry || !parsable)) {
        watchItem.refresh.error = 'Ошибка';
        watchItem.refresh.status = REFRESH_STATUS_ERROR;
        await setWatchlistItem(cardId, watchItem);
        shopperLog(`Watch: failed to parse card, card_id=${cardId}, last_retry=${lastRetry}, parsable=${parsable}`);
        return;
    }

    watchItem.refresh.status = REFRESH_STATUS_SUCCESS;
    watchItem.refresh.error = null;

    const now = new Date();
    const isNewHistoryPoint = _addWatchItemHistoryPoint(watchItem, card.price, now);
    const isNeedNotifyUser = _checkNeedNotify(card, watchItem);
    if (isNeedNotifyUser) {
        watchItem.last_notify = {
            dttm: now.toJSON(),
            price: {
                value: card.price.value,
                currency: card.price.currency,
            },
        };

        _notify(
            card.title,
            card.image,
            `Цена: ${formatMoney(card.price, 'text')}.\n\n` +
            `Вы просили сообщить, если цена будет ниже ${formatMoney(watchItem.alert_price, 'text')}.`,
            card.link,
        );
    }

    await setWatchlistItem(cardId, watchItem);

    shopperLog(`Watch: card refreshed, card_id=${cardId}, new_history_point=${isNewHistoryPoint}, notify=${isNeedNotifyUser}`);
    if (isNewHistoryPoint) {
        shopperWatch('refresh', card, null, callbackData.refresh_id);
    }
}
