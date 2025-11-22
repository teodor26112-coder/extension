if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.el = {
    'id': 'el', 
    'name': 'Эльдорадо',
    'short_name': 'ЭЛ',
    'description': 'В категории электротоваров, товаров для дома, дачи и ремонта',
    'color': '#78bd20',
    'font_color': 'black',
    'order': 12,
    'base_urls': {
        'ru': 'https://www.eldorado.ru/',
    },
    'base_url_pattern': 'https://(.*)?\\.eldorado\\.ru/',
    'search_url': 'search/catalog.php',
    'search_url_pattern': 'search/catalog.php.*',
    'search_parameter': 'q',
    'card_url_pattern': 'cat/detail/.*',
    'search_method': 'iframe',
    'searchable': false,
    'show_conditions': {
        'default': {
            'enabled': false,
        },
        'wb': {
            'allowed_categories': [
                'Электроника',
                'Бытовая техника',
                'Инструменты',
                'Для ремонта',
                'Дом',
                'Сад и дача',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Электроника',
                'Бытовая техника',
                'Строительство и ремонт',
                'Дом и сад',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Электроника',
                'Бытовая техника',
                'Товары для строительства и ремонта',
                'Дача, сад и огород',
                'Товары для дома',
            ]
        },
        'mm': {
            'allowed_categories': [
                'Электроника',
                'Бытовая техника',
                'Строительство и ремонт',
            ]
        },
        'cl': {
            'allowed_categories': [
                'Строительство и ремонт',
            ]
        },
        'ae': {
            'allowed_categories': [
                'Электроника',
                'Бытовая техника',
                'Обустройство дома и инструменты',
                'Дом, сад и офис',
            ]
        },
    },
    'style': {
        'background': 'white',
        'border': '1px solid #d1d1d1',
        'border-radius': '12px',
    },

    parseSearchError: function (seach, doc) {
        let error = doc.querySelector('.question');
        if (error && error.textContent.toUpperCase().match(/.*ВЫ ТОЧНО НЕ РОБОТ*./)) {
            return 401;
        }

        if (doc.querySelector('ul[data-dy="productsList"]') === null) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('ul[data-dy="productsList"] > li[data-dy="product"]');
        shopperLog(`el: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const titleBlock = card.querySelector('[data-dy="title"]');
            if (!titleBlock) {
                shopperLog(`el: no title found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            var priceBlock = card.querySelector('[data-pc="offer_price"]');
            if (!priceBlock) {
                priceBlock = titleBlock.parentElement.nextElementSibling?.firstElementChild;
            }
            if (!priceBlock) {
                shopperLog(`el: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const imageBlock = card.querySelector('img');
            const linkBlock = imageBlock.parentElement;

            const reviewBlock = card.querySelector('[data-dy="review"]');
            const ratingBlock = reviewBlock?.parentElement?.firstElementChild;

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`el: no price parsed at card ${i} doc ${search.doc_url}`);
                continue;
            }

            result.push({
                link: link,
                image: image,
                title: title,
                price: price,
                rating: rating,
                review_count: reviewCount,
            });
        }

        return Promise.resolve(result);
    },

    parseCard: function (doc) {
        const titleBlock = doc.querySelector('h1');
        const title = parseTextContext(titleBlock);

        const priceBlock = doc.querySelector('[data-dy="price"]');
        const price = parsePrice(priceBlock?.innerText);

        const categoryBlocks = doc.querySelectorAll('[itemtype="https://schema.org/BreadcrumbList"] [itemprop="name"]');
        var categories = [];
        categoryBlocks.forEach(el => categories.push(el.textContent.trim()));

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('[data-dy="offer_price"]');
        if (!priceBlock) {
            injectBlock = doc.querySelector('body');
        }

        return {
            link: doc.URL,
            title: title,
            image: image,
            price: price,
            categories: categories,
            injectBlock: injectBlock,
        }
    },
}