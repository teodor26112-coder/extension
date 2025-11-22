function shopperLog(message) {
    const request = {
        'message_type': 'service-worker.log',
        'ts': (new Date()).toISOString(),
        'message': message,
        'location': location,
    }
    var location = null;
    if (typeof(window) !== 'undefined') {
        location = window.location.href;
        chrome.runtime.sendMessage(request);
    } else {
        shopperStoreLog(request);
    }
}

async function shopperGetLogs() {
    return chrome.storage.local.get({ logs: [] });
}

function shopperStoreLog(request) {
    const MAX_LOGS = 500;

    const logRecord = {
        'msg': request.message,
        'url': request.location,
        'ts': request.ts,
    };
    console.log(`[${request.ts}] SHOPPER: ${request.message}`);
    chrome.storage.local.get({ logs: [] }, data => {
        if (data.logs.length >= MAX_LOGS + 20) {
            data.logs = data.logs.slice(20);
        }
        data.logs.push(logRecord);
        chrome.storage.local.set({ logs: data.logs });
    });
}