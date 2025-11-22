if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.dm = {
    'id': 'dm', 
    'name': 'Детский Мир',
    'short_name': 'ДМ',
    'description': 'В категории детских товаров',
    'color': '#2882e6',
    'font_color': 'white',
    'order': 10,
    'base_urls': {
        'ru': 'https://detmir.ru/',
        'by': 'https://detmir.by/',
        'kz': 'https://detmir.kz/',
    },
    'base_url_pattern': 'https://(.*\\.)?detmir\\.(ru|by|kz)/',
    'search_url': 'search/results/',
    'search_url_pattern': 'search/results/.*',
    'search_parameter': 'qt',
    'card_url_pattern': 'product/index/id/.*',
    'search_method': 'iframe',
    'show_conditions': {
        'default': {
            'enabled': false,
        },
        'wb': {
            'allowed_categories': [
                'Игрушки',
                'Детям',
                'Канцтовары',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Детские товары',
                'Детям',
                'Канцелярские товары',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Детские товары',
                'Товары для школы и офиса',
            ]
        },
        'mm': {
            'allowed_categories': [
                'Детские товары',
                'Книги, хобби, канцелярия',
            ]
        },
        'cl': {
            'allowed_categories': [
                'Канцтовары',
            ]
        },
        'ae': {
            'allowed_categories': [
                'Мама и малыш',
                'Игрушки и хобби',
            ]
        },
    },
    'style': {
        'background': '#fff',
        'border-radius': '0px',
    },

    parseSearchResult:  function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('*[data-product-id]');
        shopperLog(`dm: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            var productPriceBlock = card.querySelector('[data-testid="productPrice"]');
            if (!productPriceBlock) {
                shopperLog(`dm: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            var price = null;
            for (const block of productPriceBlock.querySelectorAll('*')) {
                const blockPrice = parsePrice(block.textContent);
                if (!blockPrice) {
                    continue;
                }

                if (price === null || (blockPrice.value != 0 && blockPrice.value < price.value)) {
                    price = blockPrice;
                }
            }

            if (!price) {
                shopperLog(`dm: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            var titleBlock = null;
            var imageBlock = null;
            var linkBlock = null;
            for (const link of card.querySelectorAll('a')) {
                const img = link.querySelector('img');
                if (img) {
                    imageBlock = img;
                } else {
                    titleBlock = link;
                    linkBlock = link;
                }
            }

            if (!imageBlock) {
                shopperLog(`dm: no image found at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const ratingBlock = card.querySelector('[data-testid="rating"]');
            const reviewBlock = card.querySelector('[data-testid="reviewCount"]');

            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

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
        const titleBlock = doc.querySelector('*[data-testid="pageTitle"]');
        var title = parseTextContext(titleBlock);
    
        const pricesBlock = doc.querySelector('*[data-testid="price"]');
        var price = null;
        if (pricesBlock) {
            price = parsePrice(pricesBlock.textContent);
        }
    
        const categoriesBlock = doc.querySelectorAll('*[data-testid="breadcrumbsItem"]');
        var categories = [];
        if (categoriesBlock.length > 0) {
            categoriesBlock.forEach(el => {
                categories.push(el.textContent.trim());
            });
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        var injectBlock = doc.querySelector('*[data-testid="priceBlock"]');
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