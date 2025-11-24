class TemporaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemporaryError';
  }
}

async function isSupportedBrowser() {
    try {
        const userAgent = navigator.userAgent;
        shopperLog(`User-Agent: ${userAgent}`);

        let isVivaldi = userAgent.includes('Vivaldi');
        if (!isVivaldi) {
            try {
                const tabs = await chrome.windows.getCurrent();
                if (tabs?.[0]?.['vivExtData']) {
                    isVivaldi = true;
                }
            } catch (e) {}
        }

        if (isVivaldi) {
            return false;
        }

        if (navigator.userAgentData) {
            const brands = navigator.userAgentData.brands || [];
            const chromeVersionBrand = brands.find(brand => brand.brand.includes('Chromium'));

            if (chromeVersionBrand && parseInt(chromeVersionBrand.version, 10) < 101) {
                return false;
            }
        } else {
            const isChrome = userAgent.includes('Chrome');
            if (!isChrome) {
                return false;
            }

            if (isChrome) {
                const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)/);
                if (chromeVersionMatch && chromeVersionMatch[1]) {
                    const chromeVersion = parseInt(chromeVersionMatch[1], 10);
                    if (chromeVersion < 101) {
                        return false;
                    }
                }
            }
        }
    } catch (e) {
        shopperLog(`isSupportedBrowser error: ${e}`);
    }

    return true;
}

async function isBrowserNotificationsGranted(requestPermissions) {
    let granted = await chrome.runtime.sendMessage({
        message_type: "service-worker.check-notifications-permission",
        request_permissions: requestPermissions || false,
    });

    return granted;
}

function getCurrentSortMethod(settings) {
    return settings.sort_method || 'price';
}

function formatDateDiff(startDate, endDate) {
    if (!startDate || !endDate) {
        return '';
    }

    const millisecondsInHour = 1000 * 60 * 60;
    const millisecondsInDay = millisecondsInHour * 24;

    const diffInMilliseconds = endDate.getTime() - startDate.getTime();

    if (diffInMilliseconds >= millisecondsInDay) {
        const nDays = Math.floor(diffInMilliseconds / millisecondsInDay);
        return `${nDays}&nbsp;` + formatCountForm(nDays, ['день', 'дня', 'дней']);
    } else if (diffInMilliseconds >= millisecondsInHour) {
        const nHours = Math.floor(diffInMilliseconds / millisecondsInHour);
        return `${nHours}&nbsp;` + formatCountForm(nHours, ['час', 'часа', 'часов']);;
    } else {
        return '';
    }
}

function formatMiniPrice(card, activeCard) {
    if (!activeCard.price || !card.price || activeCard.price.currency !== card.price.currency) {
        return formatMoney(card.price);
    }

    const priceDiff = activeCard.price.value - card.price.value;
    if (priceDiff > 0) {
        return `<span class="abc-shopper-marketplace-card-price-lower">&#9207;${formatMoney(card.price)}</span>`;
    }
    else if (priceDiff < 0) {
        return `<span class="abc-shopper-marketplace-card-price-higher">&#9206;${formatMoney(card.price)}</span>`;
    }

    return formatMoney(card.price);
}

function formatMiniReviews(card, settings) {
    if (settings.show_reviews === false) {
        return '';
    }

    let reviewCount = '';
    if (card.review_count) {
        if (card.review_count > 1000) {
            reviewCount = Math.floor(card.review_count / 1000) + 'к';
        } else {
            reviewCount = card.review_count.toString();
        }
        reviewCount = ` / ${reviewCount}`;
    }

    return `
        <div class="abc-shopper-marketplace-card-reviews">
            <img src="${chrome.runtime.getURL('images/star.png')}">
            ${formatRating(card.rating) || '-'} ${reviewCount}
        </div>
    `;
}

function generateHash(value) {
    let hash = 0;
    for (const char of value) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0;
    }
    return hash;
};

function removeMarketplaceCardTooltips(marketplace) {
    const tooltips = document.querySelectorAll(`[id*="abc-shopper-marketplace-card-tooltip-${marketplace.id}"]`);
    for (const tooltip of tooltips) {
        tooltip.remove();
    }
}

function createElement(tagName, className) {
    const element = document.createElement(tagName);
    element.classList.add(className);
    return element;
}

function createDiv(className, innerHTML) {
    const element = createElement('div', className);
    if (innerHTML) {
        element.innerHTML = innerHTML;
    }
    return element;
}

function createSpan(className) {
    return createElement('span', className)
}

function getShopperBlock() {
    return document.querySelector('.abc-shopper');
}

function showCardTooltip(event) {
    const tooltipId = event.target.dataset.tooltip_id;
    const tooltipBlock = tooltipId ? document.querySelector(`#${tooltipId}`) : null;
    if (tooltipBlock) {
        const shopperBlock = getShopperBlock();
        if (shopperBlock) {
            const cardBlockBb = shopperBlock.getBoundingClientRect();
            const right = window.innerWidth - cardBlockBb.left;
            const top = cardBlockBb.top + window.scrollY;
            tooltipBlock.style.right = `${right}px`;
            tooltipBlock.style.top = `${top}px`;
        }

        tooltipBlock.style.visibility = 'visible';
    }
}

function hideCardTooltip(event) {
    const tooltipId = event.target.dataset.tooltip_id;
    const tooltip = tooltipId ? document.querySelector(`#${tooltipId}`) : null;
    if (tooltip) {
        tooltip.style.visibility = 'hidden';
    }
}

function calcRelevanceBorder(cards) {
    if (!cards?.length) {
        return 0;
    }

    for (const card of cards) {
        if (card.relevance >= SHOPPER_HIGH_RELEVANCE_BORDER) {
            return SHOPPER_HIGH_RELEVANCE_BORDER;
        }

        if (card.relevance >= SHOPPER_MEDIUM_RELEVANCE_BORDER) {
            return SHOPPER_MEDIUM_RELEVANCE_BORDER;
        }
    }

    return SHOPPER_LOW_RELEVANCE_BORDER;
}

// sortMethod: 'price', 'relevance', 'native'
function sortRenderCards(cards, sortMethod, relevanceBorder) {
    switch (sortMethod)
    {
        case 'relevance': {
            cards.sort(
                (a, b) => {
                    if ((a.relevance >= relevanceBorder) != (b.relevance >= relevanceBorder)) {
                        return b.relevance - a.relevance;
                    }

                    if (a.price && b.price) {
                        return a.price.value - b.price.value;
                    }

                    return b.relevance - a.relevance;
                }
            );
            break;
        }

        case 'native': {
            cards.sort(
                (a, b) => {
                    return a.index - b.index;
                }
            );
            break;
        }

        case 'price':
        default: {
            cards.sort(
                (a, b) => {
                    if (a.price && b.price && a.price.currency === b.price.currency) {
                        return a.price.value - b.price.value;
                    }

                    return 0;
                }
            );
            break;
        }
    }
}

async function evalCardsRelevance(activeCard, cards) {
    for (var card of cards) {
        if (!card.tokens) {
            card.tokens = await parseCardTokens(card);
        }

        if (!card.relevance && card.relevance !== 0) {
            card.relevance = await calcCardRelevance(card, activeCard);
        }
    }

    return calcRelevanceBorder(cards);
}

async function renderMarketplaceCards(resultsBlock, search, marketplace) {
    let cards = search.marketplaces[marketplace.id].cards;

    resultsBlock.querySelector('.abc-shopper-marketplace-cards')?.remove();
    resultsBlock.querySelector('.abc-shopper-marketplace-cards-subtitle')?.remove();

    removeMarketplaceCardTooltips(marketplace);

    if (cards.length === 0) {
        const subtitleBlock = createDiv('abc-shopper-marketplace-cards-subtitle');
        subtitleBlock.innerText = 'Не нашлось похожих товаров';
        resultsBlock.appendChild(subtitleBlock);
        return;
    }

    if (!search.card.tokens) {
        search.card.tokens = await parseCardTokens(search.card, {highlight: true});
    }

    const settings = await getShopperSettings();
    const sortMethod = getCurrentSortMethod(settings);
    const relevanceBorder = (sortMethod === 'relevance') ? (await evalCardsRelevance(search.card, cards)) : 0;

    sortRenderCards(cards, sortMethod, relevanceBorder);

    const cardsBlock = createDiv('abc-shopper-marketplace-cards');
    let relevanceCardsBlocks = [];
    if (sortMethod === 'relevance') {
        const createFramedCardsSubblock = (title) => {
            const subBlock = createDiv('abc-shopper-marketplace-cards-framed-subblock');

            const titleBlock = createDiv('abc-shopper-marketplace-cards-framed-subblock-title');
            titleBlock.innerHTML = title;
            subBlock.appendChild(titleBlock);

            const itemsBlock = createDiv('abc-shopper-marketplace-cards-framed-subblock-items');
            subBlock.appendChild(itemsBlock);

            cardsBlock.appendChild(subBlock);

            return itemsBlock;
        }

        relevanceCardsBlocks.push(createFramedCardsSubblock('Похожие'));
        relevanceCardsBlocks.push(createFramedCardsSubblock('Непохожие'));

        cardsBlock.addEventListener('scroll', () => {
            const cardsBlockBB = cardsBlock.getBoundingClientRect();

            for (var itemsBlock of relevanceCardsBlocks)
            {
                const subBlock = itemsBlock.parentElement;
                const titleBlock = subBlock.children[0];

                const subBlockBB = subBlock.getBoundingClientRect();
                const subBlockOffset = cardsBlockBB.left - subBlockBB.left;
                if (subBlockOffset <= 0) {
                    titleBlock.style.transform = '';
                    continue;
                }

                const titleBB = titleBlock.getBoundingClientRect();
                const maxTranslate = Math.max(0, subBlockBB.width - titleBB.width - 20);
                const clampedScrollLeft = Math.min(subBlockOffset, maxTranslate);

                titleBlock.style.transform = `translateX(${clampedScrollLeft}px)`;
            }
        });

    } else {
        const cardsSubBlock = createDiv('abc-shopper-marketplace-cards-subblock');
        relevanceCardsBlocks.push(cardsSubBlock);
        relevanceCardsBlocks.push(cardsSubBlock);
        cardsBlock.appendChild(cardsSubBlock);
    }

    const body = document.querySelector('body');

    for (var i = 0; i < cards.length; ++i)
    {
        const card = cards[i];

        var markers = [];
        if (card.markers) {
            if (card.markers.includes('best')) {
                markers.push('<span class="abc-shopper-marketplace-card-marker">Лучшее</span>');
            }
            else if (card.markers.includes('min_price')) {
                markers.push('<span class="abc-shopper-marketplace-card-marker">Мин.цена</span>');
            }
        }

        const tooltipId = `abc-shopper-marketplace-card-tooltip-${marketplace.id}-${i}`;

        const cardBlock = createSpan('abc-shopper-marketplace-card');
        cardBlock.innerHTML = `
            <a target="_blank" rel="noopener noreferrer" href="${encodeURI(card.link)}">
                <div class="abc-shopper-marketplace-card-image-wrapper" data-tooltip_id="${tooltipId}">
                    <div class="abc-shopper-marketplace-card-image">
                        <img src="${encodeURI(card.image)}">
                        ${markers.join('')}
                    </div>
                    ${formatMiniReviews(card, search.settings)}
                </div>
                <div class="abc-shopper-marketplace-card-price">${formatMiniPrice(card, search.card)}</div>
            </a>`;

        const imageBlock = cardBlock.querySelector('.abc-shopper-marketplace-card-image-wrapper');
        imageBlock.addEventListener('mouseenter', showCardTooltip);
        imageBlock.addEventListener('mouseleave', hideCardTooltip);

        if (card.relevance >= relevanceBorder) {
            relevanceCardsBlocks[0].appendChild(cardBlock);
        } else {
            relevanceCardsBlocks[1].appendChild(cardBlock);
        }

        var priceDiffBlock = '';
        if (search.card.price && card.price && search.card.price.currency === card.price.currency)
        {
            const priceDiff = {
                value: search.card.price.value - card.price.value,
                currency: search.card.price.currency,
            }
            if (priceDiff.value > 0) {
                priceDiffBlock = `<span class="abc-shopper-marketplace-card-price-lower">&#9207;&nbsp;Дешевле на ${formatMoney(priceDiff)}</span>`;
            }
            else if (priceDiff.value < 0) {
                priceDiff.value = -priceDiff.value;
                priceDiffBlock = `<span class="abc-shopper-marketplace-card-price-higher">&#9206;&nbsp;Дороже на ${formatMoney(priceDiff)}</span>`;
            }
            else {
                priceDiffBlock = `Такая же цена`;
            }
        }
        else
        {
            priceDiffBlock = 'Цена'
        }

        var tooltipReviewCount = '';
        if (card.review_count) {
            const count = formatCountForm(card.review_count, ['оценка', 'оценки', 'оценок']);
            tooltipReviewCount = ` / ${card.review_count} ${count}`;
        } else if (!card.rating) {
            tooltipReviewCount = 'нет отзывов';
        }

        const tooltip = createDiv('abc-shopper-marketplace-card-tooltip');
        tooltip.id = tooltipId;
        tooltip.innerHTML = `
            <div class="abc-shopper-marketplace-card-tooltip-title">${highlightMatchingTokens(card, search.card)}</div>
            <div class="abc-shopper-marketplace-card-tooltip-image">
                <img src="${encodeURI(card.image)}">
            </div>
            <div class="abc-shopper-marketplace-card-tooltip-reviews">
                <img src="${chrome.runtime.getURL('images/star.png')}">
                ${formatRating(card.rating)} ${tooltipReviewCount}
            </div>
            <div class="abc-shopper-marketplace-card-tooltip-price">${formatMoney(card.price)}</div>
            <div class="abc-shopper-marketplace-card-tooltip-footer">
                ${priceDiffBlock}
                <div class="abc-shopper-marketplace-card-tooltip-footer-legal">
                    Карточка товара с сайта <b>${marketplace.name}</b>.
                    Кликните по карточке чтобы перейти на сайт продавца.
                </div>
            </div>`;
        body.appendChild(tooltip);
    }

    if (relevanceCardsBlocks[0] !== relevanceCardsBlocks[1]) {
        for (var block of relevanceCardsBlocks) {
            if (block.children.length === 0) {
                block.parentElement.remove();
            }
        }
    }

    resultsBlock.appendChild(cardsBlock);
}

function setMarketplaceError(resultsBlock, errorCode, e) {
    let error = '';
    if (errorCode === 401) {
        error = 'требуется авторизация на сайте';
    } else {
        error = `${e}`;
    }

    resultsBlock.innerHTML = `<span class="abc-shopper-search-error"><b>Ошибка:</b> ${error}</span>`;
}

function createMarketplaceEmptySearchResults(search, marketplace) {
    const resultsBlock = createDiv('abc-shopper-marketplace-results');
    const searchParams = getSearchParams(search, marketplace);
    const subtitleBlock = createDiv('abc-shopper-marketplace-cards-subtitle');

    if (searchParams.category)
    {
        const categoryBlock = createDiv('abc-shopper-marketplace-category');
        categoryBlock.innerHTML = `
            <span class="abc-shopper-marketplace-category-name">&rarr;&nbsp;${searchParams.category}</span>
            <span class="abc-shopper-marketplace-category-close">&#x2715;</span>
        `;

        createTooltip(
            `abc-shopper-category-tooltip-${generateHash(searchParams.category)}`,
            `Показаны товары из категории <b>${searchParams.category}</b>`,
            `Нажмите на &#x2715; чтобы искать во всех категориях`,
            {
                showBehavior: 'show-hover',
                hideBehavior: 'hide-hover',
                forBlock: categoryBlock.querySelector('.abc-shopper-marketplace-category-name'),
                sizeBlock: categoryBlock,
            },
        );

        resultsBlock.appendChild(categoryBlock);

        subtitleBlock.innerHTML = `Ищем товары в категории <b>${searchParams.category}</b>...`;
    } else {
        subtitleBlock.innerText = 'Ищем товары...';
    }

    resultsBlock.appendChild(subtitleBlock);

    return resultsBlock;
}

function createMarketplaceBlock(search, marketplace, visibility) {
    const marketplaceBlock = createDiv('abc-shopper-marketplace');
    marketplaceBlock.classList.add('abc-shopper-marketplace-' + marketplace.id);

    const searchMp = search.marketplaces[marketplace.id];
    const searchParams = searchMp.category_search ? searchMp.category_search : searchMp.default_search;

    if (!searchParams.url) {
        throw new Error(`marketplace missing search url: ${marketplace.id}`)
    }

    var actions = '';
    if (visibility !== 'enabled') {
        marketplaceBlock.classList.add('abc-shopper-marketplace-hidden');
        actions = `
        <span class="abc-shopper-marketplace-title-actions">
            <span class="abc-shopper-marketplace-title-action" id="abc-shopper-marketplace-title-action-open">(раскрыть)</span>
        </span>`;
    }

    // Result block primary content
    marketplaceBlock.innerHTML = `
        <div class="abc-shopper-marketplace-header">
            <a class="abc-shopper-marketplace-name" href="${searchParams.url}" target="_blank" rel="noopener noreferrer">
                <span class="abc-shopper-marketplace-name-icon">
                    ${marketplace.name.substring(0, 2)}
                </span>
                <span class="abc-shopper-marketplace-name-rest">
                    ${marketplace.name.substring(2)}
                </span>
            </a>
            ${actions}
        </div>
    `;

    const resultsBlock = createMarketplaceEmptySearchResults(search, marketplace);
    marketplaceBlock.appendChild(resultsBlock);

    if (visibility !== 'enabled')
    {
        const opener = marketplaceBlock.querySelector('#abc-shopper-marketplace-title-action-open');
        opener.addEventListener('click', async (event) => {
            const marketplaceResultsBlock = marketplaceBlock.querySelector('.abc-shopper-marketplace-results');
            const action = marketplaceBlock.querySelector('#abc-shopper-marketplace-title-action-open');

            if (event.target.innerText.trim() === '(раскрыть)')
            {
                marketplaceResultsBlock.style.display = 'flex';
                action.innerText = '(скрыть)';

                if (!marketplaceResultsBlock.classList.contains('abc-shopper-cards-loaded')) {
                    marketplaceResultsBlock.classList.add('abc-shopper-cards-loaded');
                    startMarketplaceSearch(search, marketplace);
                }
            }
            else
            {
                marketplaceResultsBlock.style.display = 'none';
                action.innerText = '(раскрыть)';
            }
        });
    }

    const categoryCloseButton = resultsBlock.querySelector(".abc-shopper-marketplace-category-close");
    if (categoryCloseButton)
    {
        categoryCloseButton.addEventListener('click', async () => {
            searchMp.category_search = null;

            const newResultsBlock = createMarketplaceEmptySearchResults(search, marketplace);
            resultsBlock.parentElement.appendChild(newResultsBlock);
            resultsBlock.remove();

            removeMarketplaceCardTooltips(marketplace);

            for (var searchLinkBlock of marketplaceBlock.querySelectorAll('a.abc-shopper-marketplace-search-link')) {
                searchLinkBlock.href = searchMp.default_search.url;
            }

            startMarketplaceSearch(search, marketplace);
        });
    }

    return marketplaceBlock;
}

function createNoMarketplacesBlock() {
    const block = createDiv('abc-shopper-no-marketplaces');
    block.innerHTML = 'Все маркетплейсы отключены в настройках расширения';
    return block;
}

function createShopperRoot(searchId) {
    const shopperBlock = createDiv('abc-shopper');
    if (searchId) {
        shopperBlock.setAttribute('searchId', searchId);
    }
    shopperBlock.setAttribute('loadedUrl', window.location.href);
    return shopperBlock;
}

async function createDummyShopperBlock() {
    const shopperBlock = createShopperRoot(null);
    const body = document.querySelector('body');
    body.appendChild(shopperBlock);
}

async function showSettings() {
    await chrome.runtime.sendMessage({
        message_type: 'service-worker.show-settings',
    });
};

async function flipMinimized(search) {
    const mpSettings = await getMarketplaceSettings(search.marketplace);
    const minimized = !(mpSettings.minimized === true);
    mpSettings.minimized = minimized;
    await setMarketplaceSettings(search.marketplace, mpSettings);

    const minimizeButton = document.querySelector('#abc-shopper-minimize')
    const contentBlock = document.querySelector('.abc-shopper-content');

    if (minimized) {
        minimizeButton.src = chrome.runtime.getURL('images/maximize.png');
        if (contentBlock) {
            contentBlock.style.display = 'none';
        }
    } else {
        minimizeButton.src = chrome.runtime.getURL('images/minimize.png');
        if (contentBlock) {
            contentBlock.style.display = null;
        }

        await startAllMarketplacesSearch(search);
    }
}

async function showTooltip(tooltipBlock, sizeBlock, offsetRect, eventHandler) {
    if (eventHandler) {
        let isShow = eventHandler(tooltipBlock, 'before-show');
        if (isShow instanceof Promise) {
            isShow = await isShow;
        }
        if (isShow === false) {
            return;
        }
    }

    let bb = sizeBlock.getBoundingClientRect();
    let pos = {
        left: bb.left,
        top: bb.top + bb.height + 10 + window.scrollY,
        width: bb.width,
        height: 0,
    }

    if (offsetRect) {
        if (offsetRect.top) pos.top += offsetRect.top;
        if (offsetRect.width) pos.width += offsetRect.width;
        if (offsetRect.height) pos.height += offsetRect.height;

        if (offsetRect.left || offsetRect.left === 0) {
            pos.left += offsetRect.left;
        } else if (offsetRect.right || offsetRect.right === 0) {
            pos.left = pos.left - pos.width + offsetRect.right;
        }
    }
    tooltipBlock.style.display = '';

    tooltipBlock.style.left = `${pos.left}px`;
    tooltipBlock.style.top = `${pos.top}px`;
    tooltipBlock.style.width = `${pos.width}px`;
    if (pos.height) {
        tooltipBlock.style.height = `${pos.height}px`;
    }

    if (eventHandler) {
        eventHandler(tooltipBlock, 'show');
    }
}

async function hideTooltip(tooltipBlock, eventHandler) {
    tooltipBlock.style.display = 'none';
    if (eventHandler) {
        eventHandler(tooltipBlock, 'hide')
    }
}

async function toogleTooltip(tooltipBlock, sizeBlock, offsetRect, eventHandler) {
    if (tooltipBlock.style.display === '' || tooltipBlock.style.display === 'none') {
        return showTooltip(tooltipBlock, sizeBlock, offsetRect, eventHandler);
    } else {
        return hideTooltip(tooltipBlock, eventHandler);
    }
}

// showBehavior: show-hover, show-click
// hideBehavior: hide-hover, hide-click
function createTooltip(
    id, title, text, {
        showBehavior = 'show-hover',
        hideBehavior = 'hide-hover',
        forBlock = null,
        activateBlock = null,
        sizeBlock = null,
        offsetRect = null,
        textAlign = 'center',
    } = {},
    eventHandler = null,
) {
    if (!sizeBlock) {
        sizeBlock = forBlock;
    }
    if (!activateBlock) {
        activateBlock = forBlock;
    }

    const tooltipBlock = createDiv('abc-shopper-tooltip');
    tooltipBlock.id = id;
    tooltipBlock.style.display = 'none';

    let closeButton = '';
    if (hideBehavior === 'hide-click') {
        closeButton = `<img class="abc-shopper-tooltip-close" src="${chrome.runtime.getURL('images/close.png')}">`;
    }

    tooltipBlock.innerHTML = `
        <div class="abc-shopper-tooltip-header">
            <span class="abc-shopper-tooltip-title">${title}</span>
            ${closeButton}
        </div>
        <div class="abc-shopper-tooltip-text" style="text-align: ${textAlign}">${text}</div>
    `;

    document.body.appendChild(tooltipBlock);

    const show = async () => await showTooltip(tooltipBlock, sizeBlock, offsetRect, eventHandler);
    const hide = async () => await hideTooltip(tooltipBlock, eventHandler);
    const toggle = async () => await toogleTooltip(tooltipBlock, sizeBlock, offsetRect, eventHandler);

    if (showBehavior === 'show-hover') {
        activateBlock.addEventListener('mouseenter', show);
    } else if (showBehavior === 'show-click') {
        if (hideBehavior === 'hide-click') {
            activateBlock.addEventListener('click', toggle)
        } else {
            activateBlock.addEventListener('click', show);
        }
    } else {
        throw new Error(`Invalid show behaviour: ${showBehavior}`);
    }

    if (hideBehavior === 'hide-hover') {
        activateBlock.addEventListener('mouseleave', hide);
    } else if (hideBehavior === 'hide-click') {
        tooltipBlock.querySelector('.abc-shopper-tooltip-close').addEventListener('click', hide);
    } else {
        throw new Error(`Invalid hide behaviour: ${hideBehavior}`);
    }


    return tooltipBlock;
}


function createShareBlock(search, shopperControlsBlock) {
    const shareButton = shopperControlsBlock.querySelector('.abc-shopper-controls-share');

    if (!search.marketplace.shopogoliki?.enabled) {
        shareButton.style.display = 'none';
        return;
    }

    const shareDialogBlock = createTooltip(
        'abc-shopper-share-dialog',
        `<span class="abc-shopper-share-dialog-title">
            Поделиться товаром в канале <a class="abc-shopper-shopoholics-channel" href="https://t.me/shopaddicts">Шопоголики!</a>
        </span>`,

        `<label for="abc-shopper-share-dialog-reason" class="abc-shopper-share-dialog-label">Чем хорош товар?</label>
        <select class="abc-shopper-share-dialog-select" id="abc-shopper-share-dialog-reason">
            <option value="price">Цена ниже рынка</option>
            <option value="quality">Высокое качество</option>
            <option value="rare">Редкость</option>
            <option value="like">Мне нравится</option>
            <option value="other">Другое</option>
        </select>

        <label for="abc-shopper-share-dialog-comment" class="abc-shopper-share-dialog-label">Расскажите подробнее:</label>
        <textarea rows="5" class="abc-shopper-share-dialog-text invalid" id="abc-shopper-share-dialog-comment"></textarea>
        <div id="abc-shopper-share-dialog-comment-counter" class="invalid">Минимум 30 символов</div>

        <label for="abc-shopper-share-dialog-author" class="abc-shopper-share-dialog-label">Представьтесь (если хотите):</label>
        <input class="abc-shopper-share-dialog-text" id="abc-shopper-share-dialog-author"></input>

        <button class="abc-shopper-share-dialog-submit" id="abc-shopper-share-dialog-submit" disabled>
            Поделиться
        </button>`,
        {
            showBehavior: 'show-click',
            hideBehavior: 'hide-click',
            forBlock: shareButton,
            sizeBlock: shopperControlsBlock,
        },
        (tooltipBlock, action) => {
            if (action === 'show') {
                hideTooltip(document.querySelector('#abc-shopper-share-tooltip'));
            }
        },
    );

    const tooltipBlock = createTooltip(
        'abc-shopper-share-tooltip',
        'Нашли крутой товар задёшево?',
        `Расскажите о нём всем в телеграм-канале Шопоголики! (@shopaddicts).
        Мы опубликуем вашу ссылку на товар после проверки.
        Так вы поможете сэкономить другим покупателям и поддержите хорошего продавца
        <div class="abc-shopper-share-hint">Расширение Шоппер</div>`,
        {
            showBehavior: 'show-hover',
            hideBehavior: 'hide-hover',
            forBlock: shareButton,
            sizeBlock: shopperControlsBlock,
        },
        (tooltipBlock, action) => {
            if (action === 'show') {
                hideTooltip(shareDialogBlock);
            }
        },
    );

    shareDialogBlock.querySelector('#abc-shopper-share-dialog-comment').addEventListener('input', (event) => {
        const counter = shareDialogBlock.querySelector('#abc-shopper-share-dialog-comment-counter');
        const submit = shareDialogBlock.querySelector('#abc-shopper-share-dialog-submit');
        const textarea = event.target;
        const text = textarea.value;

        if (text.length < 30 || text.length > 300) {
            submit.disabled = true;
            textarea.classList.add("invalid");
            counter.classList.add("invalid");

            if (text.length === 0) {
                counter.innerText = `Минимум 30 символов`;
            } else if (text.length < 30) {
                const rest = 30 - text.length;
                counter.innerText = `Еще минимум ${rest} ${formatCountForm(rest, ['символ', 'символа', 'символов'])}`;
            } else {
                counter.innerText = `${text.length} из 300 символов`;
            }
        } else {
            submit.disabled = false;
            textarea.classList.remove("invalid");
            counter.classList.remove("invalid");
            counter.innerText = `${text.length} из 300 символов`;
        }
    }, false);

    shareDialogBlock.querySelector('.abc-shopper-share-dialog-submit').addEventListener('click', async (event) => {
        const comment = shareDialogBlock.querySelector('#abc-shopper-share-dialog-comment').value;
        if (comment.length < 30 || comment.length > 300) {
            alert('Текст комментария должен быть от 30 до 300 символов');
            return;
        }

        try {
            let res = await shopperShare(
                search,
                shareDialogBlock.querySelector('#abc-shopper-share-dialog-reason').value,
                shareDialogBlock.querySelector('#abc-shopper-share-dialog-comment').value,
                shareDialogBlock.querySelector('#abc-shopper-share-dialog-author').value,
            );
            if (!res.error) {
                alert('Спасибо! Мы проверим ссылку и опубликуем ее в канале Шопоголики');
            } else {
                alert('Не удалось опубликовать ссылку!\n' + res.error);
            }
        } catch (e) {
            alert(`Не удалось опубликовать товар: ${e}`);
        }
        hideTooltip(shareDialogBlock);
    });
}

async function createAdsHeadBlock(search) {
    if (!search.ads || !search.ads.head) {
        return null;
    }

    const ads = search.ads.head;

    let adsBlock;
    switch (ads.location || 'head') {
        case 'head':
            adsBlock = createDiv("abc-shopper-ads-head",
                `<span class="abc-shopper-ads-head-content">
                    <img class="abc-shopper-ads-head-content-icon" src="${ads.icon}" style="display: ${ads.icon ? 'block' : 'none'}">
                    <a href="${ads.link}" target="_blank" rel="noopener noreferrer">
                        ${ads.text}&nbsp;&rarr;
                    </a>
                </span>
                <span class="abc-shopper-ads-head-legal" id="abc-shopper-ads-head-legal">
                    Реклама
                </span>`
            );
            break;

        case 'wide-head':
            adsBlock = createDiv("abc-shopper-ads-head",
                `<span class="abc-shopper-ads-head-content">
                    <a href="${ads.link}" target="_blank" rel="noopener noreferrer">
                        <img class="abc-shopper-ads-head-content-wide-image" src="${ads.wide_image}">
                    </a>
                </span>
                <span class="abc-shopper-ads-head-legal overflow-content" id="abc-shopper-ads-head-legal">
                    Реклама
                </span>`
            );
            break;

        default:
            return null;
    }

    if (ads.image || ads.description) {
        const adsContent = adsBlock.querySelector('.abc-shopper-ads-head-content');
        createTooltip(
            'abc-shopper-ads-head-tooltip',
            `${ads.title}`,
            `<div class="abc-shopper-ads-head-tooltip-content">
                <img class="abc-shopper-ads-head-tooltip-content-img" src="${ads.image}" ${!ads.image ? 'style="display: none"' : ''}>
                <div class="abc-shopper-ads-head-tooltip-content-description" ${!ads.description ? 'style="display: none"' : ''}>${ads.description}</div>
            </div>`,
            {
                showBehavior: 'show-hover',
                hideBehavior: 'hide-hover',
                forBlock: adsContent,
                sizeBlock: adsBlock,
                offsetRect: {
                    right: -20,
                    top: -80,
                    width: 100,
                },
            },
        );
    }

    const legalBlock = adsBlock.querySelector('#abc-shopper-ads-head-legal');
    createTooltip(
        'abc-shopper-ads-head-legal-tooltip',
        'Сведения о рекламе',
        `<div style="text-align: left; word-wrap: break-word;">
            ${ads.legal}
        </div>
        <div style="margin-top: 12px; font-size: 0.9em; font-style: italic;">
            Покупая рекламируемые товары, вы помогаете Шопперу развиваться
        </div>`,
        {
            showBehavior: 'show-click',
            hideBehavior: 'hide-click',
            forBlock: legalBlock,
            sizeBlock: adsBlock,
        },
    );

    return adsBlock;
}

async function createControlsBlock(search) {
    const watchlistItem = await getWatchlistItem(search.card);

    let priceRange = '';
    let minPrice = null;
    let maxPrice = null;

    if (watchlistItem && watchlistItem.history && watchlistItem.history.length > 0)
    {
        lastHistoryItem = watchlistItem.history[watchlistItem.history.length-1];

        for (var i = 0; i < watchlistItem.history.length; ++i) {
            const hist = watchlistItem.history[i];

            if (!minPrice || hist.price.value < minPrice.value) {
                minPrice = hist.price;
            }
            if (!maxPrice || hist.price.value > maxPrice.value) {
                maxPrice = hist.price;
            }
        }

        priceRange = `<span class="abc-shopper-controls-watch-prices-link">История цены: </span>`;

        if (minPrice.value === maxPrice.value) {
            priceRange += `<span class="abc-shopper-controls-watch-prices-price">${formatMoney(minPrice)}</span>`;
        } else {
            priceRange += `
                <span class="abc-shopper-controls-watch-prices-price">${formatMoney(minPrice)}</span>
                -
                <span class="abc-shopper-controls-watch-prices-price">${formatMoney(maxPrice)}</span>`;
        }
    } else {
        priceRange = 'Нет истории цены';
    }

    const shopperControlsBlock = createDiv('abc-shopper-controls');
    shopperControlsBlock.innerHTML = `
        <button class="abc-shopper-controls-dropdown" id="abc-shopper-controls-search-order-button">
            <img src="${chrome.runtime.getURL('images/sort-' + getCurrentSortMethod(search.settings) + '.png')}">
            <div class="abc-shopper-controls-dropdown-items" data-for="abc-shopper-controls-search-order-button">
                <div class="abc-shopper-controls-dropdown-items-header">Порядок сортировки:</div>
                <div class="abc-shopper-controls-dropdown-items-item" data-sort-method="price">
                    <img src="${chrome.runtime.getURL('images/sort-price.png')}">
                    Сначала дешевые
                </div>
                <div class="abc-shopper-controls-dropdown-items-item" data-sort-method="relevance">
                    <img src="${chrome.runtime.getURL('images/sort-relevance.png')}">
                    Сначала похожие
                </div>
                <div class="abc-shopper-controls-dropdown-items-item" data-sort-method="native">
                    <img src="${chrome.runtime.getURL('images/sort-native.png')}">
                    Как на маркетплейсе
                </div>
            </div>
        </button>
        <button class="abc-shopper-controls-button" id="abc-shopper-controls-watch-button">
            <img src="${chrome.runtime.getURL('images/watch-on.png')}">
        </button>
        <span class="abc-shopper-controls-watch-prices">
            ${priceRange}
        </span>
        <button class="abc-shopper-controls-button abc-shopper-controls-watchlist" title="Все наблюдаемые товары">
            <img src="${chrome.runtime.getURL('images/watchlist.png')}">
        </button>
        <button class="abc-shopper-controls-button abc-shopper-controls-share" title="Рассказать Шопоголикам">
            <img src="${chrome.runtime.getURL('images/share.png')}">
        </button>
    `;

    shopperControlsBlock.querySelector(".abc-shopper-controls-watchlist").addEventListener('click', async (event) => {
        await chrome.runtime.sendMessage({
            message_type: "service-worker.open-url",
            url: chrome.runtime.getURL('ui/watchlist.html'),
        });
    });


    const priceHistoryBlock = shopperControlsBlock.querySelector('.abc-shopper-controls-watch-prices-link');
    let priceHistoryTooltipBlock = null;

    if (priceHistoryBlock) {
        priceHistoryTooltipBlock = createTooltip(
            'abc-shopper-controls-watch-price-history-tooltip',
            'История цены товара',
            `<div>На графике указана средняя цена товара за каждый день наблюдений</div>
            <div class="abc-shopper-price-history-wrapper">
                <canvas style="width: 100%; height: 200px;" id="abc-shopper-price-history"></canvas>
            </div>`,
            {
                showBehavior: 'show-click',
                hideBehavior: 'hide-click',
                forBlock: priceHistoryBlock,
                sizeBlock: shopperControlsBlock,
                offsetRect: {
                    left: -200,
                    width: +200,
                },
            },

            (_, actions) => {
                if (actions !== 'show') {
                    return;
                }
                drawPriceHistoryChart(
                    priceHistoryTooltipBlock.querySelector('#abc-shopper-price-history'),
                    watchlistItem?.history,
                );
            }
        );
    }

    const searchOrderButton = shopperControlsBlock.querySelector('#abc-shopper-controls-search-order-button');
    searchOrderButton.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const dropdownItemsBlock = document.querySelector(`.abc-shopper-controls-dropdown-items[data-for="${button.id}"]`);

        if (!event.target.classList.contains("abc-shopper-controls-dropdown-items-item")) {
            const buttonBB = button.getBoundingClientRect();
            if (dropdownItemsBlock.style.display === 'none' || dropdownItemsBlock.style.display === '') {
                dropdownItemsBlock.style.top = `${buttonBB.height + 2}px`;
                dropdownItemsBlock.style.display = 'block';
            } else {
                dropdownItemsBlock.style.display = 'none';
            }
        } else {
            dropdownItemsBlock.style.display = 'none';

            let settings = await getShopperSettings();
            settings.sort_method = event.target.getAttribute('data-sort-method');
            await setShopperSettings(settings);

            searchOrderButton.querySelector('img').src = chrome.runtime.getURL('images/sort-' + getCurrentSortMethod(settings) + '.png');

            await renderAllMarketplacesCards();
        }
    });

    const watchButton = shopperControlsBlock.querySelector('#abc-shopper-controls-watch-button');
    if (await isWatching(search.card)) {
        watchButton.classList.add("enabled");
    }

    const setWatching = async (isWatching, alertPrice) => {
        const isListFull = await chrome.runtime.sendMessage({
            message_type: "service-worker.update-watching",
            watch_enabled: isWatching,
            alert_price: alertPrice || null,
            marketplace_id: search.marketplace.id,
            country: search.country,
            card: search.card,
        });

        if (isWatching && !isListFull) {
            watchButton.classList.add("enabled");
        } else {
            watchButton.classList.remove("enabled");
        }

        return Promise.resolve(isListFull);
    }

    const watchDisabledTooltipBlock = createTooltip(
        'abc-shopper-controls-watch-disabled-tooltip',
        'Включить отслеживание цены',
        `Шоппер уведомит вас если цена упадет ниже порога.<br><br>
        Цена проверяется раз в час, но только когда компьютер включен и не находится в режиме сна.<br>
        Уведомление будет показано на текущем компьютере.`,
        {
            showBehavior: 'show-hover',
            hideBehavior: 'hide-hover',
            forBlock: watchButton,
            sizeBlock: shopperControlsBlock,
        },
        async (tooltipBlock, event) => {
            if (event === 'before-show') {
                return !(await isWatching(search.card));
            }
        }
    );

    const watchEnabledTooltipBlock = createTooltip(
        'abc-shopper-controls-watch-enabled-tooltip',
        'Отслеживание цены включено',
        `Шоппер будет периодически проверять цену товара и уведомит вас если она упадет.<br><br>
        Уведомление будет показано на текущем компьютере.`,
        {
            showBehavior: 'show-hover',
            hideBehavior: 'hide-hover',
            forBlock: watchButton,
            sizeBlock: shopperControlsBlock,
        },
        async (tooltipBlock, event) => {
            if (event === 'before-show') {
                return await isWatching(search.card);
            }
        }
    );


    let value = calcDefaultAlertPrice(search.card.price?.value || 100, 0.9);

    const watchDialogBlock = createTooltip(
        'abc-shopper-controls-watch-dialog',
        'Включить отслеживание цены',
        `<div class="abc-shopper-watch-dialog">
            <label for="abc-shopper-watch-dialog-min-price">Оповестить, если цена упадет ниже</label>
            <div class="abc-shopper-watch-dialog-min-price">
                <input id="abc-shopper-watch-dialog-min-price" type="number" min="0" value="${value}"/>
                ${search.card?.price?.currency}
            </div>
            <button id="abc-shopper-watch-dialog-submit">Включить</button>
            <div class="abc-shopper-licence-agreement">
                Включая отслеживание цены, вы соглашаетесь с <a href="https://shopper.bonbot.ru/privacy-policy.txt" target="_blank" rel="noopener noreferrer">условиями использования</a>
            </div>
        </div>`,
        {
            showBehavior: 'show-click',
            hideBehavior: 'hide-click',
            forBlock: watchButton,
            sizeBlock: shopperControlsBlock,
        },
        async (watchDialogBlock, event) => {
            if (event !== 'before-show') {
                return;
            }

            await hideTooltip(watchDisabledTooltipBlock);
            await hideTooltip(watchEnabledTooltipBlock);
            if (priceHistoryTooltipBlock) {
                await hideTooltip(priceHistoryTooltipBlock);
            }

            try {
                // Show dialog only if not watching yet. Otherwise disable watching.
                const watching = await isWatching(search.card);
                if (!watching)
                {
                    const notificationsGranted = await isBrowserNotificationsGranted(true);
                    if (!notificationsGranted) {
                        shopperLog(`Watch: notifications not granted`);
                        return false;
                    }

                    return true;
                } else {
                    await setWatching(false);
                }
            } catch (e) {
                alert(`Что-то пошло не так. Перезагрузите страницу и попробуйте снова`);
                shopperLog(`Watch unset failed: card=${search.card.url}, error=${e}`);
            }
            return false;
        }
    );

    watchDialogBlock.querySelector('#abc-shopper-watch-dialog-min-price').addEventListener('input', (event) => {
        const input = event.target;
        let v = parseInt(input.value);
        if (isNaN(v) || v < 0) {
            v = 0;
        }
        input.value = v;
    });

    document.querySelector('#abc-shopper-watch-dialog-submit').addEventListener('click', async (event) => {
        const minPriceBlock = document.querySelector('#abc-shopper-watch-dialog-min-price');
        try {
            const isWatchlistFull = await setWatching(true, {
                value: parseInt(minPriceBlock.value),
                currency: search.card.price.currency,
            });

            if (isWatchlistFull) {
                alert(`Список наблюдения переполнен!\nВы добавили в список ${MAX_WATCHLIST_SIZE} товаров, удалите часть чтобы добавить новые.`)
            }

        } catch (e) {
            shopperLog(`Watch failed: card=${search.card.url}, error=${e}`);
            alert(`Что-то пошло не так: ${e}`);
        }
        await hideTooltip(watchDialogBlock);
    });

    createShareBlock(search, shopperControlsBlock);

    return shopperControlsBlock;
}

async function createShopperBlock(search) {
    const shopperBlock = createShopperRoot(search.id);

    const mpSettings = await getMarketplaceSettings(search.marketplace);
    const minimized = mpSettings.minimized === true;

    const caption = createDiv("abc-shopper-caption");
    caption.innerHTML =
        `<span class="abc-shopper-main-header">
            <span class="abc-shopper-brand">
                <a class="abc-shopper-logo" href="https://chromewebstore.google.com/detail/${chrome.runtime.id}" target="_blank" rel="noopener noreferrer">
                    <img src="${chrome.runtime.getURL('icons/shopper3_128.png')}">
                    Шоппер
                </a>
                : в других магазинах
            </span>
            <img id="abc-shopper-settings" src="${chrome.runtime.getURL('images/settings.png')}">
            <img id="abc-shopper-minimize" src="${chrome.runtime.getURL(minimized ? 'images/maximize.png' : 'images/minimize.png')}">
        </span>`;

    caption.querySelector('#abc-shopper-settings').addEventListener('click', (event) => {
        showSettings();
    });

    caption.querySelector('#abc-shopper-minimize').addEventListener('click', (event) => {
        flipMinimized(search);
    });

    shopperBlock.appendChild(caption);

    if (!(await isSupportedBrowser()))
    {
        const errorBlock = createDiv('abc-shopper-error');
        errorBlock.innerHTML = `
            Ваш браузер не поддерживается расширением Шоппер.<br>
            Поддерживаемые браузеры:
            <ul>
            <li>Google Chrome версии 101 и выше
            <li>Яндекс.Браузер версии 101 и выше
            <li>Microsoft Edge версии 101 и выше
            <li>Opera версии 87 и выше
            </ul>
        `;
        shopperBlock.appendChild(errorBlock);
        search.card.injectBlock.insertAdjacentElement('afterend', shopperBlock);
        return Promise.resolve();
    }

    const shopperAdsHeadBlock = await createAdsHeadBlock(search);
    if (shopperAdsHeadBlock) {
        shopperBlock.appendChild(shopperAdsHeadBlock);
    }

    const shopperControlsBlock = await createControlsBlock(search);
    if (shopperControlsBlock) {
        shopperBlock.appendChild(shopperControlsBlock);
    }

    const shopperContentBlock = createDiv('abc-shopper-content');
    shopperContentBlock.style.display = minimized ? 'none' : null;
    shopperBlock.appendChild(shopperContentBlock);

    const activeMarketplacesBlock = createDiv('abc-shopper-prices');

    const hiddenMarketplacesBlock = createDiv('abc-shopper-hidden-marketplaces');
    hiddenMarketplacesBlock.innerHTML = `
        <div class="abc-shopper-marketplaces-title">Отключены в категории</div>
        <div class="abc-shopper-marketplaces-subtitle">Результаты могут быть неожиданными</div>
    `

    if (search.marketplace.style) {
        for (const [key, value] of Object.entries(search.marketplace.style)) {
            shopperBlock.style[key] = value;
        }
    }

    for (var marketplace of getAllMarketplaces())
    {
        const visible = await getMarketplaceVisible(marketplace, search.marketplace, search.card, search.settings);
        if (visible === 'disabled') {
            continue;
        }

        const marketplaceBlock = createMarketplaceBlock(search, marketplace, visible);

        if (visible === 'enabled') {
            activeMarketplacesBlock.appendChild(marketplaceBlock);
        } else {
            hiddenMarketplacesBlock.appendChild(marketplaceBlock);
        }
    }

    if (activeMarketplacesBlock.children.length > 0) {
        shopperContentBlock.appendChild(activeMarketplacesBlock);
    } else {
        shopperContentBlock.appendChild(createNoMarketplacesBlock());
    }

    if (hiddenMarketplacesBlock.children.length > 2) {
        shopperContentBlock.appendChild(hiddenMarketplacesBlock);
    }


    search.card.injectBlock.insertAdjacentElement('afterend', shopperBlock);

    await startAllMarketplacesSearch(search);

    return Promise.resolve();
}

let SHOPPER_ACTIVE_SEARCH = null;

function getMarketplaceResultsBlock(marketplace, shopperBlock, logPrefix) {
    logPrefix = logPrefix || marketplace.id;
    if (!shopperBlock) {
        shopperLog(`${logPrefix}: no shopper block`);
        return null;
    }

    const marketplaceBlock = shopperBlock.querySelector(`.abc-shopper-marketplace-${marketplace.id}`);
    if (!marketplaceBlock) {
        shopperLog(`${logPrefix}: no marketplace block`);
        return null;
    }

    const resultsBlock = marketplaceBlock.querySelector('.abc-shopper-marketplace-results');
    if (!resultsBlock) {
        shopperLog(`${logPrefix}: no results block`);
        return null;
    }

    return resultsBlock;
}

async function renderAllMarketplacesCards() {
    const search = SHOPPER_ACTIVE_SEARCH;
    if (!search) {
        return;
    }

    const shopperBlock = getShopperBlock();
    if (!shopperBlock) {
        shopperLog(`Can't update search results: no shopper block`);
        return;
    }

    for (var marketplace of Object.values(search.marketplaces)) {
        const logPrefix = `${search.id}/${marketplace.id}`;

        if (!marketplace.search_result) {
            shopperLog(`${logPrefix}: can't update search results, no search result`);
            continue;
        }

        const resultsBlock = getMarketplaceResultsBlock(marketplace.marketplace, shopperBlock, logPrefix);
        if (!resultsBlock) {
            continue;
        }

        await renderMarketplaceCards(resultsBlock, search, marketplace.marketplace);
    }
}

async function setMarketplaceSearchResult(search, marketplace, result) {
    const logPrefix = `${search.id}/${marketplace.id}/`

    const shopperBlock = getShopperBlock();
    if (!shopperBlock) {
        shopperLog(`${logPrefix}: no shopper block`);
        return;
    }

    const activeSearchId = shopperBlock.getAttribute('searchId');
    if (search.id !== activeSearchId) {
        shopperLog(`${logPrefix}: ignore old search result, active_search_id=${activeSearchId}`);
        return;
    }

    search.marketplaces[marketplace.id].search_result = result;

    const resultsBlock = getMarketplaceResultsBlock(marketplace, shopperBlock, logPrefix);
    if (!resultsBlock) {
        return;
    }

    try {
        shopperLog(`${logPrefix}: marketplace status ${result.ok ? 'ok' : 'error'}, error=${result.error ? result.error : '-'}`);
        if (!result.ok && result.error !== 404) {
            throw new Error(
                `Search failed, status=${result.status ? result.status.toString() : ''}, code=${result.error ? result.error : ''}`
            );
        }

        shopperLog(`${logPrefix}: rearranging cards: n_cards=${result.cards ? result.cards.length : 'no cards'}`);
        const rearrangedCards = await rearrangeCards(search, result.cards || []);

        search.marketplaces[marketplace.id].cards = rearrangedCards;

        await renderMarketplaceCards(resultsBlock, search, marketplace);
    } catch (e) {
        shopperLog(`${search.id}: marketplace ${marketplace.id} failed: ${e}`);
        setMarketplaceError(resultsBlock, result.error, e);

        console.groupCollapsed(`Shopper: set result failed, ${e}`);
        console.error(e.stack);
        console.groupEnd();
    }
}

function getSearchParams(search, marketplace) {
    const searchMp = search.marketplaces[marketplace.id];
    if (searchMp.category_search && (search.settings.guess_category !== false)) {
        return searchMp.category_search;
    }

    return searchMp.default_search;
}

function startMarketplaceSearch(search, marketplace) {
    const searchParams = getSearchParams(search, marketplace);

    const marketplaceSearchId = `${search.id}/${marketplace.id}/${searchParams.category ? searchParams.category : ''}`;

    const promise = chrome.runtime.sendMessage({
        message_type: "service-worker.search-marketplace",
        marketplace_id: marketplace.id,
        marketplace_search_id: marketplaceSearchId,
        search_id: search.id,
        search_url: searchParams.url,
        search_text: searchParams.search_text,
        country: search.country,
        card: {
            price: search.card.price,
            title: search.card.title,
            categories: search.card.categories,
        },
    });

    promise.then(
        (result) => setMarketplaceSearchResult(search, marketplace, result)
    );
}

async function cancelSearch() {
    if (!SHOPPER_ACTIVE_SEARCH) {
        return;
    }

    if (chrome?.runtime) {
        await chrome.runtime.sendMessage({
            message_type: "service-worker.cancel-search",
            search_id: SHOPPER_ACTIVE_SEARCH.id,
        });
    }

    SHOPPER_ACTIVE_SEARCH = null;
}

async function startAllMarketplacesSearch(search) {
    const shopperBlock = getShopperBlock();
    if (!shopperBlock || shopperBlock.classList.contains('abc-shopper-loaded')) {
        return;
    }

    const mpSettings = await getMarketplaceSettings(search.marketplace);
    if (mpSettings.minimized === true) {
        return;
    }

    shopperBlock.classList.add('abc-shopper-loaded');

    shopperLog(
        `${search.id}: start search` +
        `, default_search=${search.default_search ? search.default_search.url : ''}` +
        `, category_search=${search.category_search ? search.category_search.url : ''}` +
        `, location=${window.location.href}`
    );

    var disabledMarketplaces = [];

    for (var marketplace of getAllMarketplaces()) {
        const visibility = await getMarketplaceVisible(marketplace, search.marketplace, search.card, search.settings);

        if (visibility !== 'enabled') {
            disabledMarketplaces.push(`${marketplace.id}: ${visibility}`);
            continue;
        }

        startMarketplaceSearch(search, marketplace);
    }

    shopperLog(`${search.id}: disabled marketplaces: ${disabledMarketplaces.join(', ')}`);
}

function highlightMatchingTokens(card, activeCard) {
    if (card.title.toLowerCase() === activeCard.title.toLowerCase()) {
        return `<span class="abc-shopper-highlight">${card.title}</span>`;
    }

    if (!card.title || !activeCard.tokens.highlight.length) {
        return card.title;
    }

    let title = card.title;
    for (const token of activeCard.tokens.highlight) {
        title = title.replace(token.re, '<span class="abc-shopper-highlight">$1</span>');
    }

    return title;
}

async function makeSearch(marketplace, activeCard, settings) {
    let search = {
        id: createSearchId(),
        marketplace: marketplace,
        card: activeCard,
        disabled: false,
        common_search_text: null,
        marketplaces: {},
        settings: settings,
        country: getCountryByUrl(window.location.origin),
    };

    for (var mp of getAllMarketplaces()) {
        const visibility = await getMarketplaceVisible(mp, search.marketplace, search.card, search.settings);
        if (visibility !== 'disabled') {
            search.marketplaces[mp.id] = {
                marketplace: mp,
                visibility: visibility,
                default_search: null,
                category_search: null,
                search_result: null,
            };
        }
    }

    try {
        const response = await shopperMakeSearch(search);

        if (!response.search_mode || response.search_mode === "server")
        {
            if (!response.disabled && !response.search_text) {
                throw new Error('server returned empty search text');
            }

            search.disabled = response.disabled;
            search.common_search_text = response.search_text;

            if (response.marketplaces)
            {
                for (var mp of response.marketplaces) {
                    for (var searchUrl of mp.search_urls) {
                        let searchType = searchUrl.category ? 'category_search' : 'default_search';
                        search.marketplaces[mp.id][searchType] = searchUrl;
                    }
                }
            }
        }

        search.ads = response.ads || null;
    } catch (e) {
        shopperLog("Request to shopper /make-search failed: " + e);
        search.disabled = false;
    }

    const searchTokens = parseSearchTokens(search.card);
    if (!search.common_search_text) {
        search.common_search_text = makeCommonSearchText(searchTokens);
    }

    // Fallback: generate default_search locally if request to server failed
    // or server did not return search url for some marketplaces
    for (var mp of Object.values(search.marketplaces))
    {
        if (mp.default_search) {
            continue;
        }

        let searchText = makeMakeplaceSearchText(mp.marketplace, searchTokens);
        if (!searchText) {
            searchText = search.common_search_text;
            if (!searchText) {
                throw new Error(`Failed to make search text for ${marketplace.id}: ${searchTokens.toString()}`);
            }
        }

        const url = makeMarketplaceSearchUrl(mp.marketplace, search.country, searchText);

        mp.default_search = {
            url: url,
            search_text: searchText,
            category: null,
        };
    }

    SHOPPER_ACTIVE_SEARCH = search;

    return Promise.resolve(search);
}

function isUrlChanged(shopperBlock) {
    const loadedUrl = shopperBlock.getAttribute('loadedUrl');
    return loadedUrl !== document.location.href;
}

let INJECTING = false;
let ATTEMPT = 0;

async function inject() {
    const settings = await getShopperSettings();
    if (settings.extension_enabled === false) {
        shopperLog('disabled');
        return;
    }

    const oldShopperBlock = getShopperBlock();
    if (oldShopperBlock) {
        if (!isUrlChanged(oldShopperBlock)) {
            return Promise.resolve();
        }
        INJECTING = false;
    }

    if (INJECTING) {
        return Promise.resolve();
    }
    INJECTING = true;
    ATTEMPT += 1;

    try {
        shopperLog(`injecting: url=${document.URL}`);

        await uninject();

        var marketplace = getMarketplaceByCardPageUrl(document.URL);
        if (!marketplace) {
            shopperLog('not a card page: ' + document.URL);
            marketplace = getMarketplaceByHostname(window.location.hostname);
            if (marketplace) {
                await createDummyShopperBlock();
            }

            return Promise.resolve();
        }

        const needCompleteCard = ATTEMPT <= 10;
        const activeCard = parseMarketplaceCard(marketplace, document, needCompleteCard);
        if (!activeCard) {
            throw new TemporaryError(`no active card yet: url=${document.URL}`);
        }

        const search = await makeSearch(marketplace, activeCard, settings);
        if (search.disabled) {
            shopperLog('search disabled');
            await createDummyShopperBlock();
            return Promise.resolve();
        }

        if (!activeCard.injectBlock) {
            throw new TemporaryError(`no inject block: url=${document.URL}`);
        }

        await createShopperBlock(search);
        shopperLog(`injected ok: url=${document.URL}`);

        // In case if price block was recreated
        setTimeout(inject, Math.min(ATTEMPT*300, 3000));

        ATTEMPT = 0;
    } catch (e) {
        shopperLog(`inject failed: ${e}, url=${document.URL}`);
        await uninject();

        const hasRetry = (ATTEMPT <= 20);
        if (!hasRetry || !(e instanceof TemporaryError)) {
            console.groupCollapsed(`Shopper: inject failed (hasRetry=${hasRetry}), ${e}`);
            console.error(e.stack);
            console.groupEnd();
        }

        if (hasRetry) {
            setTimeout(inject, 1000);
        }
    } finally {
        INJECTING = false;
    }

    return Promise.resolve();
}

async function uninject() {
    const shopperBlock = getShopperBlock();
    if (shopperBlock) {
        shopperBlock.remove();
    }

    for (var element of document.querySelectorAll('.abc-shopper-marketplace-card-tooltip')) {
        element.remove();
    }

    for (var tooltipBlock of document.querySelectorAll('.abc-shopper-tooltip')) {
        tooltipBlock.remove();
    }

    await cancelSearch();

    return Promise.resolve();
}

// Primary entry point
window.addEventListener("load", (event) => {
    inject();
});

// Called when SPA changes page content without reloading
chrome.runtime.onMessage.addListener((request) => {
    if (request.message_type === 'content-script.tab-loaded') {
        const shopperBlock = getShopperBlock();
        if (shopperBlock && shopperBlock.getAttribute('loadedUrl') === request.tab_url) {
            return;
        }

        uninject().finally(() => {
            setTimeout(inject, 500);
        });
    }
});

// In case if document loading takes too long because of some footer element
setTimeout(inject, 3000);

// Free background resources if page closed before all searches finished
try {
    window.addEventListener("beforeunload", (event) => {
        uninject();
    });
} catch (e) {
    shopperLog(`setting unload failed: ${e}`);
}
