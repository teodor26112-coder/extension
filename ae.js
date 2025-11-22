if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.ae = {
    'id': 'ae',
    'name': 'AliExpress',
    'short_name': 'AE',
    'color': '#e81e24',
    'font_color': 'white',
    'order': 4,
    'base_urls': {
        'ru': 'https://aliexpress.ru/',
    },
    'base_url_pattern': 'https://(.*\\.)?aliexpress\\.ru/',
    'search_url': 'wholesale',
    'search_url_pattern': 'wholesale.*',
    'search_parameter': 'SearchText',
    'card_url_pattern': 'item/.*',
    'search_method': 'iframe',
    'show_conditions': null,
    'style': {
        'font-size': '0.9em',
        'background': '#fcfcfd',
        'border-radius': '8px',
        'border': '1px solid #e6eaf0',
        'padding': '8px 16px',
        'width': '100%',
        'margin-bottom': '0px',
    },

    parseSearchError: function (search, doc) {
        let error = doc.querySelector('[class*="no-search-results"]');
        if (error && error.textContent.toUpperCase().match(/.*НИЧЕГО НЕ НАЙДЕНО.*/g)) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('[data-spm-protocol="i"] [data-index]');
        shopperLog(`ae: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('[class*="red-snippet_RedSnippet__priceNew"]');
            const titleBlock = card.querySelector('[class*="red-snippet_RedSnippet__title"]');
            const imageBlock = card.querySelector('img');
            const linkBlock = card.querySelector('a[class*="red-snippet_RedSnippet__content"]');

            let ratingBlock = null
            let reviewBlock = null;
            const reviewAndRating = card.querySelectorAll('[class*="red-snippet_RedSnippet__trust"][class*="red-snippet_RedSnippet__trustItem"]');
            if (reviewAndRating && reviewAndRating.length > 0) {
                ratingBlock = reviewAndRating[0];
            }

            if (!priceBlock) {
                shopperLog(`ae: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`ae: no price parsed at card ${i} doc ${search.doc_url}`);
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

        const pricesBlock = doc.querySelector('[class*="HazeProductPrice_SnowPrice__mainS"]');
        const price = parsePrice(pricesBlock ? pricesBlock.textContent : "");

        const categoriesBlocks = doc.querySelectorAll('[class*="SeoRedBreadcrumbs_BreadcrumbsElement__text"]');
        let categories = [];
        categoriesBlocks.forEach(el => {
            const category = el.textContent.trim();
            if (category !== '...') {
                categories.push(category);
            }
        });

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        let injectBlock = doc.querySelector('[class*="HazeProductPrice_HazeProductPrice"]');
        if (injectBlock) {
            injectBlock = injectBlock.parentElement;
        } else {
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