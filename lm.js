if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.lm = {
    'id': 'lm',
    'name': 'Лемана Про',
    'short_name': 'ЛЕ',
    'description': 'Бывший Леруа Мерлен. В категориях, связанных с ремонтом, домом и садом',
    'color': '#fdc300',
    'font_color': 'white',
    'order': 7,
    'base_urls': {
        'ru': 'https://lemanapro.ru/',
    },
    'base_url_pattern': 'https://(.+\\.)?lemanapro\\.ru/',
    'search_url': 'search/',
    'search_url_pattern': 'search.*',
    'search_parameter': 'q',
    'card_url_pattern': 'product/.*$',
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
                'Сад и дача',
                'Дом',
            ]
        },
        'oz': {
            'allowed_categories': [
                'Строительство и ремонт',
                'Дом и сад',
            ]
        },
        'ym': {
            'allowed_categories': [
                'Товары для строительства и ремонта',
                'Дача, сад и огород',
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
        'vi': {
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
                'Автомобили и мотоциклы',
                'Дом, сад и офис',
            ]
        },
    },
    'style': {
        'background': 'white',
        'box-shadow': '0 1.17px 2px rgba(0, 0, 0, 0.0196802), 0 1.4px 5px rgba(0, 0, 0, 0.03), 0 2px 10px rgba(0, 0, 0, 0.03), 0 2px 18px rgba(0, 0, 0, 0.04), 0 9px 33px rgba(0, 0, 0, 0.03)',
        'border': 'none',
        'border-radius': '0px',
        'max-width': '370px',
    },

    parseSearchError: function (search, doc) {
        let error = doc.querySelector('[data-qa="error-layout"] h2');
        if (error && error.textContent.trim().toUpperCase() === 'НЕ НАЙДЕНО') {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        var cards = doc.querySelectorAll('[data-id="plp-reco-products-native-placement"] [data-qa="products-carousel"] [data-qa="product"]');
        if (!cards || cards.length === 0) {
            cards = doc.querySelectorAll('[data-qa="product"]');
        }
        shopperLog(`lm: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            var priceBlock = card.querySelector('[data-qa="product-old-new-price"]');
            if (priceBlock) {
                priceBlock = priceBlock.lastChild;
            }

            if (!priceBlock) {
                priceBlock = card.querySelector('[data-qa="product-primary-price"]');
            }

            if (!priceBlock) {
                shopperLog(`lm: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[data-qa="product-name"]');
            const imageBlock = card.querySelector('img');
            const linkBlock = titleBlock;

            var rating = null;
            var reviewBlock = null;
            const reviewsBlock = card.querySelector('[data-qa="product-reviews"]');
            if (reviewsBlock) {
                rating = 0;
                for (const star of reviewsBlock.querySelectorAll('svg')) {
                    if (star.querySelector('path') && star.querySelector('path').getAttribute('fill')) {
                        rating += 1;
                    }
                }
                reviewBlock = reviewsBlock;
            }

            const price = parsePrice(priceBlock.textContent);
            const title = parseTextContext(titleBlock);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`lm: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const widget = doc.querySelector('[data-qa="pdp-showcase"]')
        const titleBlock = widget.querySelector('h1[data-qa="product-name"]');
        const title = parseTextContext(titleBlock);

        var injectBlock = null;

        var pricesBlock = widget.querySelector('.primary-price');
        if (!pricesBlock) {
            pricesBlock = widget.querySelector('[data-qa="price-view"]')
        }
        if (pricesBlock) {
            if (pricesBlock.children.length > 1) {
                pricesBlock = pricesBlock.lastChild;
            }
            injectBlock = pricesBlock.parentElement
        } else {
            pricesBlock = widget.querySelector('[data-testid="price"]');
            injectBlock = widget.querySelector('[data-qa="prices_mf-pdp"]');
            if (injectBlock) {
                injectBlock = injectBlock.parentElement;
            } else {
                injectBlock = widget.querySelector('[data-testid="price-block-price"]');
            }
        }

        const price = parsePrice(pricesBlock?.textContent);

        const categoriesBlock = doc.querySelector('[data-qa="breadcrumbs"]');
        var categories = [];
        if (categoriesBlock) {
            categoriesBlock.querySelectorAll('[data-testid="breadcrumbItemName"]').forEach(el => {
                categories.push(parseTextContext(el));
            });
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

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