const SHOPPER_API_URL = 'https://shopper.bonbot.ru/api';
const SHOPPER_TIMEOUT = 1000;
const SHOPPER_RETRIES = 2;

function _makeRequestCard(card) {
    let result = {};
    if (!card) {
        return result;
    }
    if (card.index || card.index === 0) {
        result['index'] = card.index;
    }
    if (card.link) {
        result['link'] = card.link;
    }
    if (card.title) {
        result['title'] = card.title;
    }
    if (card.price) {
        result['price'] = {
            'value': card.price.value,
            'currency': card.price.currency,
        }
    }
    if (card.brand) {
        result['brand'] = card.brand;
    }
    if (card.product_type) {
        result['product_type'] = card.product_type;
    }
    if (card.image) {
        result['image'] = card.image;
    }
    if (card.categories) {
        result['categories'] = card.categories;
    }
    if (card.rating) {
        result['rating'] = card.rating;
    }
    if (card.review_count) {
        result['review_count'] = card.review_count;
    }
    if (card.attributes) {
        result['attributes'] = card.attributes;
    }

    return result;
}

function _makeRequestCards(cards) {
    let result = [];
    if (cards) {
        for (const card of cards) {
            result.push(_makeRequestCard(card));
        }
    }

    return result;
}

function _makeRequestSearch(search) {
    let result = {};
    result['id'] = search.id;
    result['marketplace'] = {'id': search.marketplace?.id || null};
    result['disabled'] = search.disabled || false;
    result['country'] = search.country;
    result['common_search_text'] = search.common_search_text;
    result['marketplaces'] = [];
    for (var mp of Object.values(search.marketplaces))
    {
        let item = {
            'marketplace_id': mp.marketplace.id,
            'category_search': {
                'url': mp.category_search?.url,
            },
            'default_search': {
                'url': mp.default_search?.url,
            },
            'search_result': {
                'ok': mp.search_result?.ok || null,
                'error': mp.search_result?.error || null,
                'cards': _makeRequestCards(mp.search_result?.cards),
            },
        };
        result['marketplaces'].push(item);
    }

    return result;
}

function _makePrice(value) {
    if (!value) {
        return null;
    }

    return {
        'value': value.value,
        'currency': value.currency,
    };
}

async function _shopperCall(path, request, retries = SHOPPER_RETRIES, timeout = SHOPPER_TIMEOUT) {
    try {
        let response = null;
        let retry = 1;

        while (response === null)
        {
            try {
                response = await fetch(
                    SHOPPER_API_URL + path,
                    {
                        method: 'POST',
                        body: JSON.stringify(request),
                        headers: {
                            'X-Shopper-Install-Id': await getShopperInstallId(),
                            'X-Shopper-Version': getShopperVersion(),
                            'Content-Type': 'application/json',
                        },
                        priority: 'high',
                        signal: AbortSignal.timeout(timeout),
                    }
                );
            } catch (e) {
                shopperLog(`request ${retry}/${retries} failed: ${e}`)
                retry += 1;
                if (retry > retries) {
                    throw e;
                }
            }
        }

        if (!response.ok) {
            throw new Error(`${path}: response status=${response.status}`);
        }

        const body = await response.json();

        shopperLog(`request ok: ${path}${request.search_id ? ', search_id=' + request.search_id : ''}`);
        return body;
    } catch (e) {
        shopperLog(`request failed: ${path}, ${e}${request.search_id ? ', search_id=' + request.search_id : ''}`);
        throw e;
    }
}

async function shopperMakeSearch(search) {
    const marketplaces = Object.keys(search.marketplaces).map(mpId => ({id: mpId}));

    const data = await _shopperCall('/make-search', {
        'search_id': search.id,
        'marketplace_id': search.marketplace.id,
        'card': _makeRequestCard(search.card),
        'marketplaces': marketplaces,
        'country': search.country,
        'sort_method': search.settings.sort_method,
    });
    return Promise.resolve(data);
}

async function shopperRearrangeCards(searchId, marketplace, cards, activeCard) {
    const data = await _shopperCall('/rearrange-cards', {
        'search_id': searchId,
        'marketplace_id': marketplace.id,
        'cards': _makeRequestCards(cards),
        'active_card': _makeRequestCard(activeCard),
    });

    const logOldCards = cards.map((card) => card.title);
    const logNewCards = data.cards.map((card) => card.title);
    shopperLog(`rearranged cards: ` +
        `old_cards(${cards.length})=${JSON.stringify(logOldCards)}, ` +
        `new_cards(${data.cards.length})=${JSON.stringify(logNewCards)}`
    )

    return Promise.resolve(data);
}

async function shopperShare(search, reason, comment, author) {
    const data = await _shopperCall('/share', {
        'card': _makeRequestCard(search.card),
        'reason': reason,
        'comment': comment,
        'author': author,
        'search': _makeRequestSearch(search),
    }, 1, 10000);

    shopperLog(`shared: ${search?.card?.link}`);
    return Promise.resolve(data);
}

async function shopperSendBugreport(bugreport) {
    const data = await _shopperCall('/bugreport', bugreport, 1, 10000);
    return Promise.resolve(data);
}

async function shopperWatch(action, card, alertPrice, refreshId) {
    const data = await _shopperCall('/watch', {
        'action': action,
        'card': _makeRequestCard(card),
        'alert_price': _makePrice(alertPrice),
        'refresh_id': refreshId || null,
    });

    shopperLog(`watch: ${card?.link}, action: ${action}`);
    return Promise.resolve(data);
}

////////////////////////////
// Fallback: rearrangeCards
////////////////////////////
function calcPricesDiffRatio(price1, price2) {
    return Math.min(price1, price2) / Math.max(price1, price2);
}

function filterCards(activeCard, cards) {
    for (var i = 0; i < cards.length; )
    {
        const card = cards[i];

        if (card.price && activeCard.price) {
            if (calcPricesDiffRatio(card.price, activeCard.price) < 0.6) {
                cards.splice(i, 1);
                continue;
            }
        }

        ++i;
    }
}

function sortCards(cards) {
    cards.sort((left, right) => {
        return left.price.value < right.price.value ? -1 : 1;
    });
}

function markCards(activeCard, cards) {
    var bestCardMark = -1;
    var minPriceMark = -1;

    for (var i = 0; i < cards.length; ++i)
    {
        const card = cards[i];
        card.markers = [];

        if (card.price) {
            if (minPriceMark === -1 || card.price.value < cards[minPriceMark].price.value) {
                minPriceMark = i;
            }
        }

        if (card.price && activeCard.price) {
            if (calcPricesDiffRatio(card.price, activeCard.price) < 0.3) {
                if (bestCardMark === -1 || card.price.value < cards[bestCardMark].price.value) {
                    bestCardMark = i;
                }
            }
        }
    }

    if (bestCardMark !== -1) {
        cards[bestCardMark].markers.push('best');
    }

    if (minPriceMark !== -1) {
        cards[minPriceMark].markers.push('min_price');
    }
}

async function localRearrangeCards(search, cards) {
    if (!cards) {
        return [];
    }
    var result = cards.slice();
    filterCards(search.card, result);
    if (result.length === 0 && cards.length > 0) {
        result = cards;
    }

    sortCards(result);
    // markCards(activeCard, result);
    return result;
}


////////////////////////////////////////////////////////
// Fallback: parse tokens & relevance
////////////////////////////////////////////////////////

const UNIT_MAPPING = {
    'кг': 'kg',
    'килограмм': 'kg',
    'килограм': 'kg',
    'г': 'g',
    'гр': 'g',
    'грамм': 'g',
    'грам': 'g',

    'л': 'l',
    'литр': 'l',
    'литра': 'l',
    'мл': 'ml',
    'миллилитр': 'ml',

    'tb': 'tb',
    'тб': 'tb',
    'gb': 'gb',
    'гб': 'gb',
    'mb': 'mb',
    'мб': 'mb',
    'kb': 'kb',
    'кб': 'kb',

    'см': 'cm',
    'mm': 'mm',
    'мм': 'mm',
    'м': 'm',
    'дюйм': 'inch',
    'дюйма': 'inch',
    'inch': 'inch',
    'in': 'inch',

    'ед': 'pc',
    'единиц': 'pc',
    'уп': 'pack',
    'упаковка': 'pack',
    'пачка': 'pack',
    'шт': 'pc',
    'штук': 'pc',
    'штука': 'pc',

    'ghz': 'ghz',
    'ггц': 'ghz',
    'mhz': 'mhz',
    'мгц': 'mhz',
    'кгц': 'khz',
    'khz': 'khz',
    'гц': 'hz',
    'hz': 'hz',

    'ватт': 'w',
    'вт': 'w',
    'w': 'w',
    'киловатт': 'kw',
    'квт': 'kw',
    'kw': 'kw',
    'мегаватт': 'mw',
    'мвт': 'mw',
    'mw': 'mw',
};

const KNOWN_UNIT_NAMES = new Set(Object.keys(UNIT_MAPPING));
const KNOWN_UNIT_SHORT_NAMES = new Set(Object.values(UNIT_MAPPING));

function localParseCardTokens(card, {highlight = false}) {
    let terms = (card.title || '')
        .split(/[^\p{L}\p{N}\.]+/u)
        .map(term => term.trim().toLowerCase())
        .filter(term => term.length > 0)
        .map(term => {
            // Convert units with dot at the end (e.g. "шт.")
            if (term.endsWith('.') && UNIT_MAPPING[term.slice(0, -1)]) {
                return UNIT_MAPPING[term.slice(0, -1)];
            }
            return UNIT_MAPPING[term] || term;
        });

    let result = {
        tok: {},
        highlight: [],
        n_ident: 0,
        n_brand: 0,
        n_important: 0,
        n_tok: 0,
    }

    const addTok = (term, {ident = false, brand = false, important = true, highlight_only = false} = {}) => {
        if (highlight_only && !highlight) {
            return;
        }

        let re;
        if (!ident) {
            // Match whole word only (using word boundaries)
            re = new RegExp(`(?<![\\p{L}\\p{N}_])(${term})(?![\\p{L}\\p{N}_])`, 'giv');
        } else {
            re = new RegExp(`(${term.split('').join('\\s*')})`, 'giv');
        }

        const tok = {
            term: term,
            re: re,
            ident: ident,
            brand: brand,
            important: important,
        }

        if (!highlight_only) {
            result.tok[term] = tok;

            result.n_tok += 1;
            if (ident) result.n_ident += 1;
            if (brand) result.n_brand += 1;
            if (important) result.n_important += 1;
        }

        if (highlight) {
            result.highlight.push(tok);
        }
    }

    const addDigitWithUnitTok =(digit, unit) => {
        addTok(digit);
        addTok(`${digit}${unit}`);

        for (const [origUnit, mappedUnit] of Object.entries(UNIT_MAPPING)) {
            if (unit === mappedUnit) {
                addTok(origUnit, {important: false, highlight_only: true});
            }
        }
    }

    const digitRe = /^\d+(\.\d*)?$/;
    const digitWithUnitRe = new RegExp("(^\\d+(\\.\\d*)?)(" + [...KNOWN_UNIT_NAMES].join('|') + ")\.?$");

    for (let i = 0; i < terms.length; i++)
    {
        const term = terms[i];
        const isDigit = digitRe.test(term);
        const isDigitWithUnit = !isDigit && digitWithUnitRe.test(term);
        const isIdent = !isDigit && /^[a-z0-9]+$/i.test(term) && /[a-z]/i.test(term) && /\d/.test(term);

        if (isDigit) {
            if (i + 1 < terms.length && KNOWN_UNIT_SHORT_NAMES.has(terms[i + 1])) {
                addDigitWithUnitTok(term, terms[i+1]);
                i += 1;
            } else {
                addTok(term);
            }
        } else if (isDigitWithUnit) {
            const match = term.match(digitWithUnitRe);
            let digit = match[1];
            let unit = match[3];
            if (unit.endsWith('.')) {
                unit = unit.slice(0, -1);
            }
            addDigitWithUnitTok(digit, UNIT_MAPPING[unit]);
        } else if (isIdent) {
            addTok(term, {ident: true});
        } else if (term.length >= 2) {
            addTok(term, {important: false});
        }
    }

    if (card.brand?.length > 0) {
        const brandTerms = card.brand
            .split(/[^\p{L}\p{N}]+/u)
            .map(term => term.trim().toLowerCase())
            .filter(term => term.length > 0)
            .map(term => UNIT_MAPPING[term] || term);

        for (var term of brandTerms) {
            addTok(term, {brand: true, important: false});
        }
    }

    result.highlight = result.highlight.sort((a, b) => b.term.length - a.term.length);

    return result;
}

const SHOPPER_EXACT_RELEVANCE_BORDER = 20.0;
const SHOPPER_HIGH_RELEVANCE_BORDER = 10.0;
const SHOPPER_MEDIUM_RELEVANCE_BORDER = 0.8;
const SHOPPER_LOW_RELEVANCE_BORDER = 0.6;

function localCalcCardRelevance(card, activeCard) {
    if (card.tokens.n_tok === 0 || activeCard.tokens.n_tok === 0) {
        return 0;
    }

    const nIdent = activeCard.tokens.n_ident;
    const nBrand = activeCard.tokens.n_brand;
    const nImportant = activeCard.tokens.n_important;

    const shortTitle = activeCard.tokens.n_tok <= 3;
    if (shortTitle && nIdent === 0 && nImportant === 0) {
        return 0;
    }

    if (card.title.toLowerCase() === activeCard.title.toLowerCase()) {
        return SHOPPER_EXACT_RELEVANCE_BORDER;
    }

    let nMatchedImportant = 0;
    let nMatchedIdents = 0;
    let nMatchedBrands = 0;
    let matchedTerms = new Set();

    // Share of matched tokens length in @activeCard
    let matchedActiveTokensLength = 0;
    let totalActiveTokensLength = 0;
    for (const token of Object.values(activeCard.tokens.tok))
    {
        const isMatched = !!card.tokens.tok[token.term];
        totalActiveTokensLength += token.term.length;

        if (isMatched) {
            if (token.important) nMatchedImportant += 1;
            if (token.ident) nMatchedIdents += 1;
            if (token.brand) nMatchedBrands += 1;

            matchedActiveTokensLength += token.term.length;
            matchedTerms.add(token.term);
        }
    }
    const activeCardTokenMatchShare = matchedActiveTokensLength / totalActiveTokensLength;

    // Share of non-matched tokens length in @card.
    let unmatchedCardTokensLength = 0;
    let totalCardTokensLength = 0;
    for (const token of Object.values(card.tokens.tok)) {
        totalCardTokensLength += token.term.length;
        if (!matchedTerms.has(token.term)) {
            unmatchedCardTokensLength += token.term.length;
        }
    }
    const cardTokenUnmatchShare = unmatchedCardTokensLength / totalCardTokensLength;

    let relevance = activeCardTokenMatchShare - cardTokenUnmatchShare*0.5;

    const allIdentMatched = nIdent > 0 && nMatchedIdents === nIdent;
    // const someIdentMatched = nIdent > 0 && nMatchedIdents > 0;
    const allImportantMatched = nImportant > 0 && nMatchedImportant === nImportant;
    const allBrandMatched = nBrand > 0 && nMatchedBrands === nBrand;

    if (allIdentMatched) {
        relevance += SHOPPER_EXACT_RELEVANCE_BORDER;
    }
    else if (allImportantMatched && allBrandMatched) {
        relevance += SHOPPER_EXACT_RELEVANCE_BORDER;
    }
    // else if (someIdentMatched && cardTokenUnmatchShare < 0.35) {
    //     relevance += SHOPPER_EXACT_RELEVANCE_BORDER;
    // }
    else if (allImportantMatched) {
        relevance += SHOPPER_HIGH_RELEVANCE_BORDER;
    }

    return relevance;
}

/////////////////////////////////////////
// Remote calls with fallback to locals
/////////////////////////////////////////
async function rearrangeCards(search, cards) {
    try {
        const response = await shopperRearrangeCards(search.id, search.marketplace, cards, search.card);
        if (!response.cards) {
            throw new Error("Server returned empty cards");
        }
        return response.cards;
    } catch (e) {
        shopperLog('Failed to rearrange cards by server: ' + e);
        return await localRearrangeCards(search, cards);
    }
}

async function parseCardTokens(card, options = {highlight = false} = {}) {
    return localParseCardTokens(card, options);
}

async function calcCardRelevance(card, activeCard) {
    return localCalcCardRelevance(card, activeCard);
}