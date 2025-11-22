if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.vi = {
    'id': 'vi',
    'name': 'Все Инструменты',
    'short_name': 'ВИ',
    'description': 'В категориях, связанных с ремонтом',
    'color': '#d60000',
    'font_color': 'white',
    'order': 8,
    'base_urls': {
        'ru': 'https://www.vseinstrumenti.ru/',
    },
    'base_url_pattern': 'https://(.*\\.)?vseinstrumenti\\.ru/',
    'search_url': 'search/',
    'search_url_pattern': '(search|category)/.*',
    'search_parameter': 'what',
    'card_url_pattern': 'product/.*',
    'search_method': 'iframe',
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
        'pt': {
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
        'border': '1px solid var(--border-color, #f4f5f6)',
        'border-radius': '20px',
        'box-shadow': '0 6px 12px #e5e7e8',
        'padding': '24px',
        'background': '#ffffff',
        'max-width': '482px',
    },

    parseSearchError: function (search, doc) {
        let error = doc.querySelector('[data-qa="search-description"]');
        if (error && error.textContent.toUpperCase().match(/.*ПО ВАШЕМУ ЗАПРОСУ.*НИЧЕГО НЕ НАШЛОСЬ.*/g)) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('[data-qa="listing"] [data-qa="products-tile"]');
        shopperLog(`vi: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('[data-qa="product-price-current"]');
            const titleBlock = card.querySelector('[data-qa="product-name"]');
            const imageBlock = card.querySelector('img');
            const linkBlock = titleBlock;

            var ratingBlock = null;
            var reviewBlock = null;
            const reviewsBlock = card.querySelector('[data-qa="product-rating"]');
            if (reviewsBlock) {
                ratingBlock = reviewsBlock.firstChild;
                reviewBlock = reviewsBlock.lastChild;
            }

            if (!priceBlock) {
                shopperLog(`vi: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const price = parsePrice(getTextContentWithoutChildren(priceBlock));
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock, 'data-url');
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`vi: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const titleBlock = doc.querySelector('[data-qa="get-product-title"]');
        const title = parseTextContext(titleBlock);

        var pricesBlock = doc.querySelector('[data-qa="price-now"]');
        if (!pricesBlock)
        {
            const allProductPrices = doc.querySelector('[data-behavior="product-price"]');
            if (allProductPrices) {
                var nodeIterator = document.createNodeIterator(
                    allProductPrices,
                    NodeFilter.SHOW_ELEMENT,
                    (node) => {
                        return node.nodeName == 'P' && node.textContent.includes('физлицам') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                );

                var phiNode = nodeIterator.nextNode();
                pricesBlock = phiNode?.parentElement;
            }

            if (!pricesBlock) {
                pricesBlock = doc.querySelector('[data-behavior="price-now"]');
            }
        }

        const price = parsePrice(pricesBlock?.textContent);

        const categoriesBlock = doc.querySelector('[data-qa="breadcrumbs"]');
        var categories = [];
        if (categoriesBlock) {
            categoriesBlock.querySelectorAll('a').forEach(el => categories.push(el.textContent.trim()));
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('[data-qa="product-price"]');
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