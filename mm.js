if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.mm = {
    'id': 'mm',
    'name': 'Мегамаркет',
    'short_name': 'ММ',
    'color': '#8654CC',
    'font_color': 'white',
    'order': 5,
    'base_urls': {
        'ru': 'https://megamarket.ru/',
    },
    'base_url_pattern': 'https://megamarket\\.ru/',
    'search_url': 'catalog/',
    'search_url_pattern': 'catalog/.*',
    'search_parameter': 'q',
    // Marketplace search returns no goods when using lot of tokens
    'search_text_patterns': getSearchPatternsForUglyMarketplaces(),
    'card_url_pattern': '(catalog|promo-page)/details/.*',
    'search_method': 'iframe',
    'show_conditions': null,
    'style': {
        'background': '#fff',
        'box-shadow': '0 8px 24px 0 #08090a14',
        'padding': '16px',
        'border-radius': '24px',
    },

    parseSearchError: function (seach, doc) {
        let error = doc.querySelector('.catalog-listing-not-found-regular');
        if (error) {
            return 404;
        }

        error = doc.querySelector('.captcha__title');
        if (error && error.innerText.toUpperCase().match(/ЧТО ВЫ НЕ РОБОТ/)) {
            return 401;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('[itemprop="itemListElement"]');
        shopperLog(`mm: found ${cards.length} cards at ${search.doc_url}`);

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            var priceBlock = card.querySelector('[itemprop="price"]');
            if (!priceBlock) {
                shopperLog(`mm: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[data-test="product-name"] > a');
            const imageBlock = card.querySelector('.catalog-item-photo img');
            const linkBlock = card.querySelector('[data-test="product-name"] > a');
            
            var ratingBlock = null;
            var reviewBlock = null;
            const reviewsBlock = card.querySelector('.pui-rating-display');
            if (reviewsBlock) {
                ratingBlock = reviewsBlock.firstChild;
                reviewBlock = reviewsBlock.lastChild;
            }

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`mm: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const titleBlock = doc.querySelector('.pdp-header__title');
        const title = parseTextContext(titleBlock);
    
        const pricesBlock = doc.querySelector('meta[itemprop="price"]');
        const currencyBlock = doc.querySelector('meta[itemprop="priceCurrency"]');
        var price = null;
        if (pricesBlock) {
            const currency = currencyBlock ? currencyBlock.getAttribute('content') : 'RUB';
            price = parsePrice(pricesBlock.getAttribute('content') + currency);
        }
    
        const categoriesBlock = doc.querySelectorAll('.breadcrumb-item > a');
        var categories = [];
        if (categoriesBlock.length > 0) {
            categoriesBlock.forEach(el => {
                categories.push(el.textContent.trim());
            });
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
    
        var injectBlock = doc.querySelector('.pdp-sales-block');
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

