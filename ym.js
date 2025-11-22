if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.ym = {
    'id': 'ym',
    'name': 'Яндекс.Маркет',
    'short_name': 'ЯМ',
    'color': '#ff5226',
    'font_color': 'white',
    'order': 3,
    'base_urls': {
        'ru': 'https://market.yandex.ru/',
        'by': 'https://market.yandex.by/',
        'kz': 'https://market.yandex.kz/',
    },
    'base_url_pattern': 'https://market\\.yandex\\.(ru|by|kz)/',
    'search_url': 'search/',
    'search_url_pattern': '(search.*|catalog.*)',
    'search_parameter': 'text',
    'card_url_pattern': '(product|card/)((?!/reviews|/question).)*$',
    'search_method': 'iframe',
    'show_conditions': null,
    'shopogoliki': {
        'enabled': true,
    },
    'style': null,

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('[data-auto="searchOrganic"] [data-zone-name="productSnippet"]');
        shopperLog(`ym: found ${cards.length} cards at ${search.doc_url}`)

        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('[data-auto="snippet-price-current"]');
            if (!priceBlock) {
                shopperLog(`ym: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            const titleBlock = card.querySelector('[data-auto="snippet-title"]');
            const imageBlock = card.querySelector('img');
            const linkBlock = card.querySelector('a');

            var ratingBlock = null;
            var reviewBlock = null;
            const reviewsBlock = card.querySelector('.ds-rating');
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
                shopperLog(`ym: no price parsed at card ${i} doc ${search.doc_url}`);
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
        const titleBlock = doc.querySelector('*[data-auto="productCardTitle"]');
        const title = parseTextContext(titleBlock);

        const pricesBlock = doc.querySelector('[data-apiary-widget-name="@card/Price"]');
        var price = null;
        if (pricesBlock) {
            var block = pricesBlock.querySelector('[data-auto="snippet-price-current"]');
            if (!block) {
                block = pricesBlock.querySelector('[data-auto="price-block"]');
            }
            if (block) {
                price = parsePrice(block.textContent);
            }
        }

        const categoriesBlock = doc.querySelector('[data-zone-name="categoryPath"]');
        let categories = [];
        if (categoriesBlock) {
            categoriesBlock.querySelectorAll('li').forEach(el => {
                if (el.getAttribute('title')) {
                    categories.push(el.getAttribute('title'));
                } else {
                    categories.push(el.textContent.trim());
                }
            });
        }

        let attributes = {};
        let brand = null;
        let productType = null;
        let parseAttr = (attrName, attrValue) => {
            if (attrValue.includes('window')) {
                return;
            }
            attrName = attrName.trim();
            attrValue = attrValue.trim();
            attributes[attrName] = attrValue;

            switch (attrName.toUpperCase()) {
                case 'БРЕНД': brand = brand || attrValue; break;
                case 'ТИП': productType = attrValue; break;
            }
        }

        const shortAttrsBlock = doc.querySelector('[data-auto="specs-list-minimal"]')?.lastElementChild;
        if (shortAttrsBlock) {
            for (var el of shortAttrsBlock.querySelectorAll('& > div')) {
                parseAttr(el.firstElementChild?.innerText, el.lastElementChild?.innerText);
            }
        }

        const fullAttrsBlock = doc.querySelector('[data-auto="specs-list-fullExtended"]')
            ?.firstElementChild
            ?.firstElementChild
            ?.lastElementChild;
        if (fullAttrsBlock) {
            for (var el of fullAttrsBlock.querySelectorAll('& > div')) {
                parseAttr(el.firstElementChild?.innerText, el.lastElementChild?.innerText);
            }
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;

        let rating = null;
        let reviewCount = null;
        const reviewAndRatingBlock = doc.querySelector('[data-auto="product-rating"]');
        if (reviewAndRatingBlock) {
            const ratingBlock = reviewAndRatingBlock.querySelector('[data-auto="ratingValue"]');
            if (ratingBlock) {
                rating = parseNumber(ratingBlock);
            }

            const reviewCountBlock = reviewAndRatingBlock.querySelector('[data-auto="ratingCount"]');
            if (reviewCountBlock) {
                reviewCount = parseNumber(reviewCountBlock, {units: true});
            }
        }

        let injectBlock = pricesBlock;
        if (!injectBlock) {
            injectBlock = doc.querySelector('body');
        }

        return {
            link: doc.URL,
            title: title,
            image: image,
            price: price,
            rating: rating,
            review_count: reviewCount,
            categories: categories,
            brand: brand,
            product_type: productType,
            attributes: attributes,
            injectBlock: injectBlock,
        }
    },
}