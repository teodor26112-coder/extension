async function getShopperInstallId() {
    var data = await chrome.storage.local.get('install_id');
    if (!data || !data.install_id) {
        data = {
            install_id: crypto.randomUUID(),
        };
        await chrome.storage.local.set({'install_id': data.install_id});
    }

    return Promise.resolve(data.install_id);
}

function getShopperVersion() {
    return chrome.runtime.getManifest().version;
}

async function getShopperSettings() {
    var data = await chrome.storage.local.get('settings');
    if (!data || !data.settings) {
        data = {
            settings: {
                extension_enabled: true,
                enable_watchlist: true,
                marketplaces: {},
                allow_selfmarket: false,
                show_reviews: true,
                guess_category: true,
            },
        }
    }

    return Promise.resolve(data.settings);
}

async function setShopperSettings(settings) {
    return chrome.storage.local.set({"settings": settings});
}

function createSearchId() {
    return crypto.randomUUID();
}
