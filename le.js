if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}


var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.le = {
    'id': 'le',
    'name': 'Леонардо',
    'short_name': 'ЛЕ',
    'description': 'В категории товаров для хобби и творчества',
    'color': '#c62829',
    'font_color': 'white',
    'order': 15,
    'base_urls': {
        'ru': 'https://leonardo.ru/',
    },
    'base_url_pattern': 'https://(.*\\.)?leonardo\\.ru/',
    'search_url': 'ishop',
    'search_url_pattern':'ishop.*',
    'search_parameter': 'search',
    // Marketplace search returns random goods when using lot of tokens
    'search_text_patterns': getSearchPatternsForUglyMarketplaces({exclude_brand: true}),
    'card_url_pattern': 'ishop/good_.*',
    'search_method': 'iframe',
    'show_conditions': {
        'default': {
            'enabled': false,
        },
        'wb': {
            'allowed_categories': [
                'Канцтовары',
                'Досуг и творчество',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Хобби и творчество',
                'Канцелярские товары',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Товары для школы и офиса',
                'Товары для творчества и хобби',
            ]
        },
        'mm': {
            'allowed_categories': [
                'Книги, хобби, канцелярия',
            ]
        },
        'ae': {
            'allowed_categories': [
                'Игрушки и хобби',
            ]
        },
    },
    'style': {
        'background': 'white',
        'border': '1px solid rgba(227, 114, 48, 1)',
    },

    parseSearchError: function (seach, doc) {
        const error = doc.querySelector('.text-align-center > p');
        if (error && error.textContent.toUpperCase().match(/.*НИЧЕГО НЕ НАЙДЕНО.*/g)) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.goods.catalog-goods');
        shopperLog(`le: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('.price-new');
            if (!priceBlock) {
                shopperLog(`le: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('.goods__link');
            const imageBlock = card.querySelector('.img-link > img');
            const linkBlock = card.querySelector('.goods__link');
            const ratingAndReviewsgBlock = card.querySelector('.goods__rating');

            const title = parseTextContext(titleBlock);
            const price = parsePrice(priceBlock.textContent);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock, 'data-src');
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            
            // "3 / 3 отзыва", " 5 "
            var rating = null;
            var reviewCount = null;
            if (ratingAndReviewsgBlock) {
                const ratingAndReview = ratingAndReviewsgBlock.innerText.match(/.*(\d)+.*(\d)+.*отзыв.*/);
                if (ratingAndReview) {
                    rating = parseInt(ratingAndReview[1]);
                    reviewCount = parseInt(ratingAndReview[2]);
                } else {
                    const ratingOnly = ratingAndReviewsgBlock.innerText.match(/.*(\d)+.*/);
                    if (ratingOnly) {
                        rating = parseInt(ratingOnly[1]);
                    }
                }
            }

            if (!price) {
                shopperLog(`le: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const card = doc.querySelector('.card');
        if (!card) {
            return null;
        }

        const titleBlock = card.querySelector('h1');
        const title = parseTextContext(titleBlock);
    
        const priceBlock = card.querySelector('.price');
        if (priceBlock) {
            price = parsePrice(priceBlock.textContent)
        }
    
        const categoryBlocks = doc.querySelectorAll('.breadcrumb-link');
        var categories = [];
        categoryBlocks.forEach(el => categories.push(el.textContent.trim()));

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('.addtocart-withcounter-container');
        if (!injectBlock) {
            injectBlock = doc.querySelector('.saleprices-wrapper-goods')
        }
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