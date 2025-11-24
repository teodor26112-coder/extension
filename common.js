function collectText(node, callback) {
    if (node.nodeType === Node.TEXT_NODE) {
        callback(node);
    }

    for (const child of node.childNodes) {
        collectText(child, callback);
    }
}

function parseTextContext(node) {
    if (!node) {
        return '';
    }

    let result = [];
    collectText(node, (item) => {
        result.push(item.nodeValue.trim());
    })

    return result.join(' ');
}

function parseNumber(node) {
    if (!node) {
        return null;
    }

    let value = '';
    if (typeof node === 'string' || node instanceof String) {
        value = node;
    } else {
        value = node.textContent;
    }

    value = value.trim().toLowerCase();

    if (value === '') {
        return null;
    }

    let multiplier = 1;

    let kIndex = /\bk\b/.test(value) ? value.search(/\bk\b/) : -1;
    if (kIndex === -1) {
        kIndex = /\bк\b/.test(value) ? value.search(/\bк\b/) : -1;
    }
    if (kIndex === -1) {
        kIndex = /[0-9\s]k/.test(value) ? (value.search(/[0-9\s]k/) + 1) : -1;
    }

    if (kIndex > -1) {
        multiplier = 1000;
        value = value.substring(0, kIndex);
    }

    value = value.replace(/[^0-9.,]/g, '');
    if (value === '') {
        return null;
    }

    value = value.replace(/,/g, '.');
    const simpleValue = parseFloat(value);
    if (isNaN(simpleValue)) {
        return null;
    }

    return simpleValue * multiplier;
};

function parseUrl(marketplace, baseUrl, node, attribute) {
    if (!node) {
        return null;
    }

    var url = null;
    if (node.tagName == 'A') {
        url = node.getAttribute(attribute || 'href');
    } else if (node.tagName == 'IMG') {
        if (attribute) {
            url = node.getAttribute(attribute);
        }
        if (!url) {
            url = node.getAttribute('src');
        }
    }

    if (!url) {
        return baseUrl;
    }

    if (url.startsWith('data:image')) {
        return null;
    }

    const result = new URL(url, baseUrl);
    return result.href;
}

function getSuportedCurrencies() {
    return {
        "₽": ["₽", "РУБ", "RUB"],
        "₸": ["₸"],
        "BYN": ["BYN", "Р."],
    };
}

function getAllPricesRe() {
    return new RegExp("₽|РУБ|RUB|₸|BYN|Р\\.", "g");
}

function parseCurrency(value, currency) {
    if (currency) {
        return currency;
    }

    value = value.toUpperCase();

    for (const [currency, symbols] of Object.entries(getSuportedCurrencies())) {
        for (const symbol of symbols) {
            if (value.includes(symbol)) {
                return currency;
            }
        }
    }

    return null;
}

function isLooksLikePrice(value, currency) {
    if (!value) {
        return false;
    }

    if (value && currency) {
        return true;
    }

    value = value.toUpperCase();

    const matches = value.match(getAllPricesRe());
    if (matches && matches.length === 1) {
        return true;
    }

    return false;
}

function parsePrice(value, currency=null) {
    if (!isLooksLikePrice(value, currency)) {
        return null;
    }

    var amount = 0.0;
    if (Number.isInteger(value) || typeof value === 'number') {
        amount = value;
    } else {
        const digits = value.replace(/[^\d,\.]/g, '').replaceAll(',', '.');
        if (digits.length === 0) {
            return null;
        }
        amount = parseFloat(digits);
    }

    return {
        value: amount,
        currency: parseCurrency(value, currency),
    };
}

function getTextContentWithoutChildren(node) {
    var content = '';
    for (var i = 0; i < node.childNodes.length; ++i) {
        if (node.childNodes[i].nodeType === Node.TEXT_NODE) {
            content += node.childNodes[i].textContent;
        }
    }

    return content;
}

function getSearchPatternsDefault() {
    return [
        {
            'tokens': ['$brand', '$title'],
            'min_words': 0,
        },
        {
            'tokens': ['$primary_categories', '$title'],
            'min_words': 0,
        },
        {
            'tokens': ['$title'], // Super default, should always return some search result
            'min_words': 0,
        },
    ];
}

function getSearchPatternsForUglyMarketplaces(options) {
    // Short search patterns, works better when website has poor search
    options = options || {};
    let result = [];

    result.push(
        {
            'tokens': ['$brand', '$title'],
            'min_words': 0,
            'max_words': 4,
        }
    );

    result.push(
        {
            'tokens': ['$title'],
            'min_words': 0,
            'max_words': 4,
        }
    );

    if (!options.exclude_brand) {
        result.push(
            {
                'tokens': ['$brand', '$product_type'],
                'min_words': 2,
                'trunc_words': 5,
            }
        );
    }

    result.push(
        {
            'tokens': ['$product_type'],
            'min_words': 2,
            'trunc_words': 5,
        }
    );

    if (!options.exclude_brand) {
        result.push(
            {
                'tokens': ['$brand', '$title'],
                'min_words': 0,
                'trunc_words': 3,
            }
        );
    }

    result.push(
        {
            'tokens': ['$primary_categories', '$title'],
            'min_words': 0,
            'trunc_words': 3,
        }
    );

    result.push(
        {
            'tokens': ['$title'],
            'min_words': 0,
            'trunc_words': 2,
        }
    );

    return result;
}

function findElement(doc, selectors) {
    for (var selector of selectors) {
        const el = doc.querySelector(selector);
        if (el) {
            return el;
        }
    }

    return null;
}
