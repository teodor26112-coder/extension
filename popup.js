
async function handleShowSetting(request, sendResponse) {
    const element = document.getElementById(request.setting);
    if (!element) {
        throw new Error(`Unknown setting: ${request.setting}`);
    }
    setTimeout(() => {
        element.scrollIntoView({behavior: 'smooth', block: 'start', inline: 'nearest'});
        element.parentElement.classList.add('blink');
    }, 100);

    sendResponse();
    return true;
}

async function handleMessage(request, sender, sendResponse) {
    switch (request.message_type) {
        case 'popup.show-setting':
            return handleShowSetting(request, sendResponse);
    }
}

async function init() {
    chrome.runtime.onMessage.addListener(handleMessage);

    document.getElementById("send-bugreport").addEventListener("click", showBugreport);

    const settings = await getShopperSettings();
    await updateIcon(settings);

    const grantedNotifications = await chrome.permissions.contains({
        permissions: ['notifications'],
    });
    if (!grantedNotifications) {
        document.getElementById('watchlist-warning').style.display = '';
    }

    document.getElementById('enable-watchlist').checked = settings.enable_watchlist !== false && grantedNotifications;
    document.getElementById('extension-onoff').checked = settings.extension_enabled;
    document.getElementById('allow-selfmarket').checked = settings.allow_selfmarket;
    document.getElementById('show-reviews').checked = settings.show_reviews !== false;
    document.getElementById('guess-category').checked = settings.guess_category !== false;

    const marketplacesSettings = document.getElementById('marketplaces-settings');

    for (var marketplace of getAllMarketplaces()) {
        if (marketplace.searchable === false) {
            continue;
        }

        const mpSettings = settings.marketplaces[marketplace.id];
        var isActive = (!mpSettings || mpSettings.enabled !== false) ? "checked" : "";

        var marketplaceBlock = document.createElement('div');
        marketplaceBlock.classList.add("labeled");
        marketplaceBlock.classList.add("marketplace");
        marketplaceBlock.classList.add(marketplace.id);

        marketplaceBlock.innerHTML = `
            <input type="checkbox" class="onoff-marketplace" id="${marketplace.id}" ${isActive}/>
            <label for="${marketplace.id}">
                <span class="marketplace-name">${marketplace.name}</span>
                <div class="description">${marketplace.description || ""}</div>
            </label>
        `;
        marketplacesSettings.appendChild(marketplaceBlock);
    }

    const inputs = document.querySelectorAll('input, label');
    for (var input of inputs) {
        if (input.id != 'enable-watchlist') {
            input.addEventListener('change', saveSettings);
        } else {
            input.addEventListener('change', toggleWatchlist);
        }
    }

    for (var item of document.querySelectorAll('.watchlist-link')) {
        item.addEventListener('click', () => {
            chrome.runtime.sendMessage({
                message_type: "service-worker.open-url",
                url: chrome.runtime.getURL('ui/watchlist.html'),
            });
        });
    }

    // document.getElementById('ext-version').innerText = "Версия расширения: " + chrome.runtime.getManifest().version;
    // document.getElementById('install-id').innerText = "UID: " + await getShopperInstallId();
}

async function toggleWatchlist() {
    const enable_watchlist =  document.querySelector('#enable-watchlist');
    if (enable_watchlist.checked) {
        let granted = await chrome.permissions.request({
            permissions: ['notifications'],
        });
        shopperLog(`Notifications request: granted=${granted}`);
        if (!granted) {
            alert('Чтобы включить отслеживание цены товара надо разрешить уведомления');
            enable_watchlist.checked = false;
        }
    }

    await saveSettings();
}

async function saveSettings() {
    const onoff = document.querySelector('#extension-onoff');
    const enable_watchlist =  document.querySelector('#enable-watchlist');
    const allow_selfmarket = document.querySelector('#allow-selfmarket');
    const show_reviews = document.getElementById('show-reviews');
    const guess_category = document.getElementById('guess-category');
    const inputs = document.querySelectorAll('input.onoff-marketplace');
    var marketplaces = {};
    for (var input of inputs) {
        marketplaces[input.id] = {enabled: input.checked};
    }

    settings = {
        extension_enabled: onoff.checked,
        enable_watchlist: enable_watchlist.checked,
        marketplaces: marketplaces,
        allow_selfmarket: allow_selfmarket.checked,
        show_reviews: show_reviews.checked,
        guess_category: guess_category.checked,
    };

    await setShopperSettings(settings);
    await updateIcon(settings);
}

async function updateIcon(settings) {
    let icons = null;
    if (settings.extension_enabled) {
        icons = {
            "48": chrome.runtime.getURL("icons/icon48.png"),
            "128": chrome.runtime.getURL("icons/icon128.png"),
        }
    } else {
        icons = {
            "48": chrome.runtime.getURL("icons/icon48_gray.png"),
            "128": chrome.runtime.getURL("icons/icon128_gray.png"),
        }
    }

    await chrome.action.setIcon({path: icons});
}

async function collectBugreportData() {
    var url = null;
    try {
        const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (activeTab && activeTab.url) {
            url = activeTab.url;
        }
    } catch (e) {
        shopperLog('failed to get active tab url: ' + e);
    }

    const message = document.getElementById('dialog-message').value;

    return {
        'version': chrome.runtime.getManifest().version,
        'useragent': navigator.userAgent,
        'url': url,
        'logs': (await shopperGetLogs()).logs,
        'message': message,
    };
}

async function sendBugreport() {
    const sendBtn = document.querySelector('#send-bugreport-btn');
    try {
        sendBtn.disabled = true;
        const data = await collectBugreportData();

        var retries = 0;
        while (true) {
            try {
                await shopperSendBugreport(data);
                break;
            } catch (e) {
                retries += 1;
                if (retries === 3) {
                    throw e;
                }
            }
        }

        alert('Отчет об ошибке отправлен.\nСпасибо!')
    } catch (e) {
        showBugreportError();
    }

    sendBtn.disabled = true;
    const dialog = document.querySelector('#bugreport-dialog');
    dialog.close();        
}

async function showBugreport() {
    try {
        const data = await collectBugreportData();

        const info = document.querySelector('#dialog-info');
        var href = '-';
        if (data.url) {
            var url = data.url;
            if (data.url.length > 30) {
                url = data.url.slice(0, 30) + "...";
            }
            href = `<a href="${data.url}">${url}</a>`
        }
        info.innerHTML = `
            <div>UID: ${await getShopperInstallId()}</div>
            <div>Версия расширения: ${data.version}</div>
            <div>Браузер: ${data.useragent}</div>
            <div>URL открытого окна: ${href}</div>
            <div>Последние логи приложения</div>
        `

        const sendBtn = document.querySelector('#send-bugreport-btn');
        sendBtn.addEventListener('click', sendBugreport);

        const dialog = document.querySelector('#bugreport-dialog');
        dialog.showModal();        
    } catch (e) {
        showBugreportError();
    }
}

function showBugreportError() {
    alert('Что-то пошло не так, даже не смогли отправить отчет :(\nНапишите нам в телеграм-канал: @shopperdev');
}

window.onload = init;