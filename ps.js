if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}


var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.ps = {
    'id': 'ps',
    'name': 'Petshop',
    'short_name': 'PS',
    'description': 'В категории товаров для животных',
    'color': '#e35100',
    'font_color': 'white',
    'order': 14,
    'base_urls': {
        'ru': 'https://www.petshop.ru/',
    },
    'base_url_pattern': 'https://.*\\.petshop\\.ru/',
    'search_url': 'search/',
    'search_url_pattern':'search.*',
    'search_parameter': 'q',
    'card_url_pattern': '(catalog/.*oid=.*)|(catalog/.+/)',
    'search_method': 'iframe',
    'show_conditions': {
        'default': {
            'enabled': false,
        },
        'wb': {
            'allowed_categories': [
                'Зоотовары',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Товары для животных',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Товары для животных',
            ]
        },
        'mm': {
            'allowed_categories': [
                'Зоотовары',
            ]
        },
        'ae': {
            'allowed_categories': [
                'Товары для питомцев',
            ]
        },
    },
    'style': {
        'order': '6',
        'padding': '20px',
        'background': '#ffffffff',
        'box-shadow': '0 0 20px 0 rgba(0, 0, 0, .08)',
        'border-radius': '12px',
        'margin-top': '0px',
    },

    parseSearchError: function (seach, doc) {
        const error = doc.querySelector('[class*="styles_empty_page"]');
        if (error && error.textContent.toUpperCase().match(/.*НИЧЕГО НЕ НАШЛИ.*/g)) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.ps-product-item');
        shopperLog(`ps: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('[data-testid="priceWithNewPrice"]');
            if (!priceBlock) {
                shopperLog(`ps: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[class*="ProductCard_content__description"]');

            const imageBlock = card.querySelector('img[class="image"]');
            const linkBlock = card.querySelector('a[class*="ProductCard_body"]');
            const ratingBlock = card.querySelector('[class*="rating"]');
            const reviewBlock = null;

            const title = parseTextContext(titleBlock);
            const price = parsePrice(priceBlock.textContent);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`ps: no price parsed at card ${i} doc ${search.doc_url}`);
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

        let price = null;
        const priceBlock = doc.querySelector('[data-testid="priceWithNewPrice"]');
        if (priceBlock) {
            price = parsePrice(priceBlock.textContent)
        }

        const categoryBlocks = doc.querySelectorAll('[class*="breadCrumbs_link"]');
        var categories = [];
        categoryBlocks.forEach(el => categories.push(el.textContent.trim()));

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('[class*="ProductDetails_prices"]');
        if (!injectBlock) {
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