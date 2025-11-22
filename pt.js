if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.pt = {
    'id': 'pt', 
    'name': 'Петрович',
    'short_name': 'ПЕ',
    'description': 'В категориях, связанных с ремонтом',
    'color': '#ff0005',
    'font_color': 'white',
    'order': 9,
    'base_urls': {
        'ru': 'https://petrovich.ru/',
    },
    'base_url_pattern': 'https://(.*\\.)?petrovich\\.ru/',
    'search_url': 'search/',
    'search_url_pattern': 'search/.*',
    'search_parameter': 'q',
    'card_url_pattern': 'product/.*',
    'search_method': 'fetch',
    'show_conditions': {
        'default': {
            'enabled': false,
        },
        'wb': {
            'allowed_categories': [
                'Автотовары',
                'Инструменты',
                'Для ремонта',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Строительство и ремонт',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Товары для строительства и ремонта',
            ]
        },
        'mm': {
            'allowed_categories': [
                'Строительство и ремонт',
            ]
        },
        'vi': {
            'enabled': true,
        },
        'lm': {
            'enabled': true,
        },
        'cl': {
            'allowed_categories': [
                'Строительство и ремонт',
            ]
        },
        'ae': {
            'allowed_categories': [
                'Обустройство дома и инструменты',
            ]
        },
    },
    'style': {
        'background': '#fff',
        'box-shadow': '0 2px 2px 0 #445c821f, -1px 4px 10px 0 #445c821a, 0 -2px 10px 0 #445c820d',
        'border': '0px solid black',
        'border-radius': '0px',
        'padding': '16px'
    },

    parseSearchError: function (search, doc) {
        let error = doc.querySelector('.not-found-message');
        if (error) {
            return 404;
        }

        return null;
    },

    parseSearchResult:  function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.page-item-list');
        shopperLog(`pt: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            var priceBlock = card.querySelector('[data-test="product-gold-price"]');
            if (!priceBlock) {
                priceBlock = card.querySelector('[data-test="product-retail-price"]');
            }
            if (!priceBlock) {
                shopperLog(`pt: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[data-test="product-title"]');
            const imageBlock = card.querySelector('[data-test="product-image"] img');
            const linkBlock = card.querySelector('a[data-test="product-link"]');

            var rating = null;
            var reviewBlock = null;
            const ratingBlocks = card.querySelectorAll('[data-test="yellow-star"]');
            if (ratingBlocks.length > 0) {
                rating = ratingBlocks.length + card.querySelectorAll('[data-test="yellow-star-half"]').length / 2;
                reviewBlock = ratingBlocks[0].parentElement.lastChild;
            }

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`pt: no price parsed at card ${i} doc ${search.doc_url}`);
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

        return result;
    },

    parseCard: function (doc) {
        const titleBlock = doc.querySelector('*[data-test="product-title"]');
        const title = parseTextContext(titleBlock);
    
        const pricesBlock = doc.querySelector('.product-price-container');
        var price = null;
        if (pricesBlock) {
            var block = pricesBlock.querySelector('[data-test="product-gold-price"]');
            if (!block) {
                block = pricesBlock.querySelector('[data-test="product-retail-price"]');
            }
            if (block) {
                price = parsePrice(block.textContent);
            }
        }
    
        const categoriesBlock = doc.querySelectorAll('.breadcrumb-text');
        var categories = [];
        if (categoriesBlock.length > 0) {
            categoriesBlock.forEach(el => {
                categories.push(el.textContent.trim());
            });
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = pricesBlock;
        if (!pricesBlock) {
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