if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}

var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.oz = {
    'id': 'oz',
    'name': 'Ozon',
    'short_name': 'OZ',
    'color': '#005bff',
    'font_color': 'white',
    'order': 2,
    'base_urls': {
        'ru': 'https://www.ozon.ru/',
        'by': 'https://ozon.by/',
        'kz': 'https://ozon.kz/',
    },
    'base_url_pattern': 'https://(.*\\.)?ozon\\.(ru|by|kz)/',
    'search_url': 'search/',
    'search_url_pattern': '(search|category)/.*',
    'search_parameter': 'text',
    'card_url_pattern': '(product/)((?!/reviews).)*$',
    'search_method': 'iframe',
    'show_conditions': null,
    'shopogoliki': {
        'enabled': true,
    },
    'style': null,

    parseSearchError: function (search, doc) {
        let error = doc.querySelector('[data-widget="searchResultsError"]');
        if (error && error.textContent.toUpperCase().match(/.*ПО ВАШЕМУ ЗАПРОСУ ТОВАРОВ СЕЙЧАС НЕТ.*/g)) {
            return 404;
        }

        return null;
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.tile-root');
        shopperLog(`oz: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const titleBlock = card.querySelector('.tsBody500Medium');
            const title = parseTextContext(titleBlock);
            if (!title) {
                shopperLog(`oz: no title at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const priceBlock = card.querySelector('.tsHeadline500Medium');
            const price = parsePrice(priceBlock?.textContent);
            if (!price) {
                shopperLog(`oz: no price at card ${i} doc ${search.doc_url}`);
                continue;
            }

            const imageBlock = card.querySelector('img');
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);

            const linkBlock = card.querySelector('.tile-clickable-element');
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);

            const reviewsBlock = card.querySelector('.tsBodyMBold');
            var ratingBlock = null;
            var reviewBlock = null;
            if (reviewsBlock && reviewsBlock.children.length > 0) {
                ratingBlock = reviewsBlock.children[0].lastChild;
                if (reviewsBlock.children.length > 1) {
                    reviewBlock = reviewsBlock.children[1].lastChild;
                }
            }
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

        return Promise.resolve(result);
    },

    parseCard: function (doc) {
        var title = null;
        var titleBlock = doc.querySelector('div[data-widget="webProductHeading"]');
        if (titleBlock) {
            if (titleBlock.children.length > 0)
                title = parseTextContext(titleBlock.children[0]);
            else
                title = parseTextContext(titleBlock);
        } else {
            titleBlock = doc.querySelector('meta[property="og:title"]');
            title = titleBlock?.getAttribute('content');
        }

        var price = null;
        const pricesBlock = doc.querySelector('div[data-widget="webPrice"]');
        if (pricesBlock) {
            var block = pricesBlock;
            while (block.children.length > 0) {
                block = block.children[0];
            }
            if (block) {
                price = parsePrice(block.textContent);
            }
        }

        let categories = [];
        const categoriesBlock = doc.querySelector('[data-widget="breadCrumbs"]');
        if (categoriesBlock) {
            categoriesBlock.querySelectorAll('li').forEach(el => categories.push(el.textContent.trim()));
        }

        let attributes = {};
        let brand = null;
        let productType = null;
        let parseAttr = (attrName, attrValue) => {
            attrName = attrName.trim();
            attrValue = attrValue.trim();
            attributes[attrName] = attrValue;

            switch (attrName.toUpperCase()) {
                case 'БРЕНД': brand = brand || attrValue; break;
                case 'ТИП': productType = attrValue; break;
            }
        }

        const shortAttrsBlock = doc.querySelector('[data-widget="webShortCharacteristics"]');
        if (shortAttrsBlock) {
            for (var el of shortAttrsBlock?.lastElementChild?.children) {
                parseAttr(el.firstElementChild?.innerText, el.lastElementChild?.innerText);
            }
        }

        const fullAttrBlocks = doc.querySelectorAll('#section-characteristics dl');
        for (var el of fullAttrBlocks) {
            parseAttr(el.querySelector('dt')?.innerText, el.querySelector('dd')?.innerText);
        }

        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;


        var rating = null;
        var reviewCount = null;
        const reviewAndRatingBlock = doc.querySelector('[data-widget="webSingleProductScore"]');
        if (reviewAndRatingBlock) {
            const reviewAndRating = reviewAndRatingBlock.innerText.split('•');
            if (reviewAndRating.length >= 1) {
                rating = parseNumber(reviewAndRating[0]);
            }
            if (reviewAndRating.length >= 1) {
                reviewCount = parseNumber(reviewAndRating[1]);
            }
        }

        const injectBlock = pricesBlock || doc.querySelector('[data-widget="webSale"]');

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