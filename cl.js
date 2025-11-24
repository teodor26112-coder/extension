if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.cl = {
    'id': 'cl', 
    'name': 'Ситилинк',
    'short_name': 'СИ',
    'description': '',
    'color': '#ff5200',
    'font_color': 'white',
    'order': 13,
    'base_urls': {
        'ru': 'https://citilink.ru/',
    },
    'base_url_pattern': 'https://(.+\\.)?citilink\\.ru/',
    'search_url': 'search/',
    'search_url_pattern': '(search|catalog)/.*',
    'search_parameter': 'text',
    'card_url_pattern': 'product/.*',
    'search_method': 'iframe',
    'show_conditions': {
        'default': {
            'enabled': false,
        },
    },
    'style': {
        'background': 'inherit',
        'border': '1px solid rgb(254, 114, 0)',
        'border-radius': '6px',
        'max-width': '380px',
    },

    parseSearchResult: function (search, doc) {
        let result = [];

        let cards = doc.querySelectorAll('[data-meta-name="ProductListLayout"] [data-meta-name="ProductVerticalSnippet"]');
        if (!cards || cards.length === 0) {
            cards = doc.querySelectorAll('[data-meta-name="ProductListLayout"] [data-meta-name="ProductHorizontalSnippet"]');
        }

        shopperLog(`cl: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('[data-meta-name="Snippet__price"]');
            if (!priceBlock) {
                shopperLog(`cl: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[data-meta-name="Snippet__title"]');
            var imageBlock = card.querySelector('[data-meta-name="Snippet__images"] img');
            if (!imageBlock) {
                imageBlock = card.querySelector('img');
            }
            const linkBlock = titleBlock;

            const ratingBlock = card.querySelector('[data-meta-name="MetaInfo_rating"]');
            const reviewBlock = card.querySelector('[data-meta-name="MetaInfo_opinionsCount"]');

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`cl: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const titleBlock = doc.querySelector('*[data-meta-name="ProductHeaderLayout__title"]');
        const title = parseTextContext(titleBlock);
    
        const pricesBlock = doc.querySelector('[data-meta-name="PriceBlock__price"]');
        const price = parsePrice(pricesBlock.textContent)
    
        const categoriesBlock = doc.querySelectorAll('[itemtype="https://schema.org/BreadcrumbList"] [itemprop="itemListElement"]');
        let categories = [];
        categoriesBlock.forEach(el => {
            categories.push(el.textContent.trim());
        });

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        let injectBlock = pricesBlock;
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