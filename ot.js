if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.ot = {
    'id': 'ot',
    'name': 'Онлайн Трейд',
    'short_name': 'ОТ',
    'color': '#f58221',
    'font_color': 'white',
    'order': 6,
    'base_urls': {
        'ru': 'https://www.onlinetrade.ru/',
    },
    'base_url_pattern': 'https://(.*\\.)?onlinetrade\\.ru/',
    'search_url': 'sitesearch.html',
    'search_url_pattern': 'sitesearch.html.*',
    'search_parameter': 'query',
    'search_other_params': {
        'force_items': '1'
    },
    'search_parameter_encoding': 'win-1251',
    'card_url_pattern': 'catalogue/.*html',
    'search_method': 'iframe',
    'show_conditions': null,
    'style': {
        'background-color': '#f5f5f5',
        'padding': '16px',
        'margin-bottom': '0',
        'border-radius': '3px',
    },

    parseSearchError: function (search, doc) {
        const items = doc.querySelector('.pageSearch .indexGoods__item');
        if (items) {
            return null;
        }

        let pageSearch = doc.querySelector('.pageSearch');
        if (!pageSearch) {
            return 404;
        }

        if (pageSearch) {
            const text = pageSearch.textContent.toUpperCase();
            if (text.match(/.*НИЧЕГО НЕ НАЙДЕНО.*/g)) {
                return 404;
            }
            if (text.match(/.*ТАКИХ ТОВАРОВ НЕ НАШЛОСЬ.*/g)) {
                return 404;
            }
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.indexGoods__item');
        shopperLog(`ot: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];
    
            const priceBlock = card.querySelector('.indexGoods__item__price');
            const titleBlock = card.querySelector('.indexGoods__item__name');
            const imageBlock = card.querySelector('img');
            const linkBlock = card.querySelector('.indexGoods__item__name');
            const reviewsBlock = card.querySelector('.starsSVG'); 

            if (!priceBlock) {
                shopperLog(`ot: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            var rating = null;
            var reviewCount = null;
            if (reviewsBlock) {
                // title: "Нет оценок", "5 звезд по 29 оценкам", "4 звезды по 2 оценкам"
                const value = reviewsBlock.getAttribute('title');
                const matched = value?.match(/(\d+).+(\d+)/);
                if (matched && matched.length === 3) {
                    rating = parseFloat(matched[1]);
                    reviewCount = parseFloat(matched[2]);
                }
            }

            if (!price) {
                shopperLog(`ot: no price parsed at card ${i} doc ${search.doc_url}`);
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
    
        const pricesBlock = doc.querySelector('.js__actualPrice');
        const price = parsePrice(pricesBlock?.textContent);
    
        const categoryBlocks = doc.querySelectorAll('.breadcrumbs__item');
        var categories = [];
        categoryBlocks.forEach(el => {
            const name = el.querySelector('[itemprop="name"]');
            if (name) {
                categories.push(name.textContent.trim());
            }
        });

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('.productPage__offer');
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