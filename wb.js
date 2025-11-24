if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/common.js');
}


var MARKETPLACES = MARKETPLACES || {};

MARKETPLACES.wb = {
    'id': 'wb',
    'name': 'Wildberries',
    'short_name': 'WB',
    'color': '#c12be6',
    'font_color': 'white',
    'order': 1,
    'base_urls': {
        'ru': 'https://www.wildberries.ru/',
        'by': 'https://www.wildberries.by/',
        'kz': 'https://www.wildberries.kz/',
    },
    'base_url_pattern': 'https://.*\\.wildberries\\.(ru|by|kz)/',
    'search_url': 'catalog/0/search.aspx',
    'search_url_pattern':'catalog/0/search.aspx.*',
    'search_parameter': 'search',
    'card_url_pattern': 'catalog/.*/detail.aspx.*',
    'search_method': 'iframe',
    'show_conditions': null,
    'shopogoliki': {
        'enabled': true,
    },
    'style': {
        'font-size': '0.9em',
    },

    parseSearchResult: async function (search, doc) {
        let result = [];

        const cards = doc.querySelectorAll('.product-card');
        shopperLog(`wb: found ${cards.length} cards at ${search.doc_url}`)
        for (var i = 0; i < cards.length; ++i) {
            const card = cards[i];

            const priceBlock = card.querySelector('.price__lower-price');
            if (!priceBlock) {
                shopperLog(`wb: no price found at card ${i} doc ${search.doc_url}`);
                continue;
            }
            var titleBlock = card.querySelector('.product-card__brand-wrap');
            if (!titleBlock) {
                titleBlock = card.querySelector('.product-card__name');
            }

            const imageBlock = card.querySelector('.product-card__img-wrap img');
            const linkBlock = card.querySelector('.product-card__link');
            const ratingBlock = card.querySelector('.product-card__rating-wrap .address-rate-mini');
            const reviewBlock = card.querySelector('.product-card__rating-wrap .product-card__count');

            var title = parseTextContext(titleBlock);
            const price = parsePrice(priceBlock.textContent);
            const image = parseUrl(search.marketplace, search.marketplace_base_url, imageBlock);
            const link = parseUrl(search.marketplace, search.marketplace_base_url, linkBlock);
            const rating = parseNumber(ratingBlock);
            const reviewCount = parseNumber(reviewBlock);

            if (!price) {
                shopperLog(`wb: no price parsed at card ${i} doc ${search.doc_url}`);
                continue;
            }

            if (title && title.length > 0 && title[0] === '/') {
                title = title.substr(1).trim();
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
        const titleBlock = findElement(doc, [
            '.product-page__title',
            '.product-page h1',
            'h1',
            '[class*="productHeader"] h3',
            'h3',
        ]);
        const title = parseTextContext(titleBlock);

        var price = null;
        var pricesBlock = doc.querySelector('div.product-page__price-block--aside > div.price-block');
        if (pricesBlock && !pricesBlock.checkVisibility()) {
            pricesBlock = doc.querySelector('div.product-page__price-block--common');
        }
        if (pricesBlock) {
            pricesBlock = pricesBlock.querySelector('.price-block__wallet-price');
            if (!pricesBlock) {
                pricesBlock = pricesBlock.querySelector('.price-block__final-price');
            }
            if (pricesBlock) {
                price = parsePrice(pricesBlock.textContent);
            }
        } else {
            pricesBlock = doc.querySelector('[class*="priceBlockWalletPrice"]');
            if (!pricesBlock) {
                pricesBlock = doc.querySelector('[class*="priceBlockPrice-"]');
            }
            if (pricesBlock) {
                price = parsePrice(pricesBlock.textContent);
            }
        }

        var categories = [];
        const categoriesBlock = findElement(doc, [
            '.breadcrumbs__list',
            '[itemtype="https://schema.org/BreadcrumbList"]',
        ]);
        if (categoriesBlock) {
            categoriesBlock.querySelectorAll('li').forEach(el => categories.push(el.textContent.trim()));
        }

        var brand = null;
        var productType = null;

        const brandBlock = findElement(doc, [
            '[data-name-for-wba="Item_Brand_Name"]',
            '[class*="productHeaderBrand"]',
        ]);
        if (brandBlock) {
            brand = brandBlock.innerText.trim();
        }

        var attributes = {};
        let parseAttr = (attrName, attrValue) => {
            attrName = attrName.trim();
            attrValue = attrValue.trim();
            attributes[attrName] = attrValue;

            switch (attrName.toUpperCase()) {
                case 'БРЕНД': brand = brand || attrValue; break;
                case 'МОДЕЛЬ': productType = attrValue; break;
            }
        }

        const attrsBlock = findElement(doc, [
            '.product-params__table',
            '[class*="product-page"] [class*="options"]',
        ]);
        if (attrsBlock) {
            for (var el of attrsBlock.querySelectorAll('tr')) {
                parseAttr(el.querySelector('th')?.innerText, el.querySelector('td')?.innerText);
            }
        }

        let image = null;
        const imageBlock = findElement(doc, [
            `[data-image-index="0"] img`,
            `[class*="swiper-slide"] img`],
        );
        if (imageBlock) {
            image = imageBlock.getAttribute('src');
        }

        let rating = null;
        let reviewCount = null;

        const reviewAndRatingBlock = findElement(doc, [
            '[class*="product-review__rating"]',
            '[class*="productReviewRating"]',
        ]);
        if (reviewAndRatingBlock)
        {
            if (reviewAndRatingBlock.textContent?.includes('·')) {
                const items = reviewAndRatingBlock.textContent.split('·');
                rating = parseNumber(items.at(0));
                reviewCount = parseNumber(items.at(1));
            } else {
                rating = parseNumber(reviewAndRatingBlock);

                const reviewCountBlock = findElement(doc, [
                    '[class*="product-review__count-review"]',
                    '[class*="productReviewCount"]',
                ]);
                if (reviewCountBlock) {
                    reviewCount = parseNumber(reviewCountBlock);
                }
            }
        }

        let injectBlock = findElement(doc, [
            '[class*="productPrice"]',
            '[class*="priceBlockContent"]',
            '[class*="productPrice"]',
        ]);
        if (!injectBlock) {
            injectBlock = pricesBlock;
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