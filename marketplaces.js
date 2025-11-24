var MARKETPLACES = MARKETPLACES || {};

if (typeof(importScripts) !== 'undefined') {
    importScripts('./marketplaces/wb.js');
    importScripts('./marketplaces/oz.js');
    importScripts('./marketplaces/ym.js');
    importScripts('./marketplaces/mm.js');
    importScripts('./marketplaces/pt.js');
    importScripts('./marketplaces/dm.js');
    importScripts('./marketplaces/vi.js');
    importScripts('./marketplaces/lm.js');
    importScripts('./marketplaces/cl.js');
    importScripts('./marketplaces/ae.js');
    importScripts('./marketplaces/ps.js');
    importScripts('./marketplaces/ot.js');
    importScripts('./marketplaces/le.js');
    importScripts('./marketplaces/el.js');
}

function getAllMarketplaces() {
    var result = Object.values(MARKETPLACES);
    result.sort((left, right) => {
        return left.order < right.order ? -1 : 1;
    });
    return result;
}

function getMarketplaceById(id) {
    return MARKETPLACES[id];
}

function getMarketplaceByHostname(hostname) {
    hostname = 'https://' + hostname + '/';
    for (const marketplace of Object.values(MARKETPLACES)) {
        if (hostname.match(marketplace.base_url_pattern)) {
            return marketplace;
        }
    }

    return null;
}

function getMarketplaceBySearchPageUrl(url) {
    for (const marketplace of Object.values(MARKETPLACES)) {
        const urlPattern = `${marketplace.base_url_pattern}(${marketplace.search_url_pattern})`;
        if (url.match(urlPattern)) {
            return marketplace;
        }
    }

    return null;
}

function getMarketplaceByCardPageUrl(url) {
    for (const marketplace of Object.values(MARKETPLACES)) {
        const urlPattern = `${marketplace.base_url_pattern}(${marketplace.card_url_pattern})`;
        if (url.match(urlPattern)) {
            return marketplace;
        }
    }

    return null;
}

async function parseMarketplaceSearchResult(search, doc) {
    let cards = null;
    let error = null;
    try {
        if (!search.marketplace) {
            throw new Error(`Parse search result: no marketplace, url=${search.doc_url}`)
        }

        if (search.marketplace.parseSearchError) {
            error = search.marketplace.parseSearchError(search, doc);
        }
        cards = await search.marketplace.parseSearchResult(search, doc);
        if (cards) {
            for (var i = 0; i < cards.length; ++i) {
                cards[i].index = i;
            }
        }
        shopperLog(`${search.marketplace.id}: parsed search result: n_cards=${cards ? cards.length : 'null'}, error=${error}`);
    } catch (e) {
        shopperLog(`${search.marketplace ? search.marketplace.id : "null"}: failed to parse search result: ${e}, url=${search.doc_url}`);
        throw e;
    }
    return {
        cards: cards,
        error: error,
    }
}

function isLooksLikeBrand(category) {
    if (!category) {
		return false
	}

	let brandSymbols = category.match(/[a-zA-Z0-9]/g);
    if (!brandSymbols) {
        return false;
    }

    return brandSymbols.length / category.length > 0.3;
}

function guessMissingCardFields(card) {
    if (!card.brand)
    {
        const categories = card.categories || [];
        for (var i = 0; i < categories.length && i <= 2; ++i) {
            const category = categories[categories.length - 1 - i];
            if (isLooksLikeBrand(category)) {
                card.brand = category;
                break;
            }
        }
    }

    if (!card.product_type)
    {
        if (card.title) {
            card.product_type = card.title.split(',', 1)[0];
        }
    }
}

function parseMarketplaceCard(marketplace, doc, completeCard) {
    shopperLog(`${marketplace ? marketplace.id : 'null'}: start parsing card, url=${doc.URL}`);

    if (!marketplace) {
        return null;
    }

    try {
        var card = marketplace.parseCard(doc);
        if (!card) {
            shopperLog(`${marketplace.id}: null card`);
            return null;
        }

        if (completeCard) {
            if (!card.title || !card.price || !card.categories || card.categories.length === 0) {
                shopperLog(`${marketplace.id}: incomplete card: ${JSON.stringify(card)}`);
                card = null;
            }
        } else {
            if (!card.title) {
                shopperLog(`${marketplace.id}: no title on card: ${JSON.stringify(card)}`);
                card = null;
            }
        }

        shopperLog(`${marketplace.id}: card parsed ok: ${JSON.stringify(card)}`);
        if (card) {
            guessMissingCardFields(card);
        }

        return card;
    } catch (e) {
        shopperLog(`${marketplace.id}: error parsing card: ${e}, url=${doc.URL}`);
        throw e;
    }
}

async function getMarketplaceSettings(marketplace) {
    const settings = await getShopperSettings();
    if (settings
        && settings.marketplaces
        && settings.marketplaces[marketplace.id])
    {
        return settings.marketplaces[marketplace.id];
    }

    return {
        enabled: true,
        minimized: false,
    };
}

async function setMarketplaceSettings(marketplace, mpSettings) {
    const settings = await getShopperSettings();
    settings.marketplaces = settings.marketplaces || {};
    settings.marketplaces[marketplace.id] = mpSettings;
    await setShopperSettings(settings);
}

async function getMarketplaceVisible(marketplace, currentMarketplace, activeCard, settings) {
    if (marketplace.id === currentMarketplace.id) {
        if (settings.allow_selfmarket === false) {
            return 'disabled';
        }
    }

    if (marketplace.searchable === false) {
        return 'disabled';
    }

    const mpSettings = await getMarketplaceSettings(marketplace);
    if (mpSettings.enabled === false) {
        return 'disabled';
    }

    if (marketplace.show_conditions && marketplace.id !== currentMarketplace.id)
    {
        var cond = marketplace.show_conditions[currentMarketplace.id];
        if (!cond) {
            cond = marketplace.show_conditions['default'];
        }
        if (cond)
        {
            if (cond.enabled === false) {
                return 'disabled_category';
            }

            if (cond.allowed_categories && activeCard.categories) {
                var hasCategory = false;
                for (var j = 0; j < cond.allowed_categories.length; ++j) {
                    const category = cond.allowed_categories[j].toLowerCase();

                    for (var k = 0; k < activeCard.categories.length; ++k) {
                        if (category === activeCard.categories[k].toLowerCase()) {
                            hasCategory = true;
                            break;
                        }
                    }

                    if (hasCategory) {
                        break;
                    }
                }

                if (!hasCategory) {
                    return 'disabled_category';
                }
            }
        }
    }

    return 'enabled';
}

function getMarketplaceBaseUrlForCountry(marketplace, country) {
    var url = marketplace.base_urls[country];
    if (!url) {
        url = marketplace.base_urls['ru'];
    }
    return url;
}

function getMarketplaceBaseUrl(marketplace, docUrl) {
    const country = getCountryByUrl(docUrl);
    return getMarketplaceBaseUrlForCountry(marketplace, country);
}

function makeMarketplaceSearchUrl(marketplace, country, searchText) {
    let encodedSearchText = "";
    if (marketplace.search_parameter_encoding === 'win-1251') {
        encodedSearchText = encodeStringToWin1251Url(searchText);
    } else {
        encodedSearchText = encodeURIComponent(searchText);
    }

    let searchParams = '';
    if (marketplace.search_other_params) {
        for (var [param, value] of Object.entries(marketplace.search_other_params)) {
            searchParams += `${param}=${encodeURIComponent(value)}&`;
        }

    }
    searchParams += `${marketplace.search_parameter}=${encodedSearchText}`;

    const baseUrl = getMarketplaceBaseUrlForCountry(marketplace, country);
    const searchUrl = new URL(`${marketplace.search_url}?${searchParams}`, baseUrl);
    return searchUrl.toString();
}

function getCountryByUrl(docUrl) {
    const url = new URL(docUrl);
    if (url.origin.endsWith('.by')) {
        return 'by';
    }

    if (url.origin.endsWith('.kz')) {
        return 'kz';
    }

    return 'ru';
}

function parseSearchLiterals(card) {
    var searchLiterals = {
        title: [],
        categories: [],
        all: [],
    };

    function hasSearchLiteral(literal) {
        literal = literal.toLowerCase();
        for (const searchLiteral of searchLiterals.all) {
            if (searchLiteral.includes(literal)) {
                return true;
            }
        }

        return false;
    }


    // Get literals from title
    if (card.title && card.title.length > 0) {
        const titleLiterals = card.title.split(/[\s,]+/).map(token => token.trim());
        for (var literal of titleLiterals) {
            if (literal) {
                searchLiterals.title.push(literal);
                searchLiterals.all.push(literal.toLowerCase());
            }
        }
    }

    // If title has limited number of literals
    // then try to add few from categories starting from end
    const MAX_GOOD_SEARCH_LITERALS = 3;
    let titleGoodLiteralCount = 0;
    for (var i = 0; i < searchLiterals.title.length; ++i) {
        if (searchLiterals.title[i].length > 2) {
            ++titleGoodLiteralCount;
        }
    }

    if (titleGoodLiteralCount < MAX_GOOD_SEARCH_LITERALS && card.categories && card.categories.length > 0)
    {
        const MAX_CATEGORIES_VISITED = 2;
        const MAX_CATEGORIES_INCLUDED = 2;

        var includedCategories = 0;
        for (var i = 0;
             i < card.categories.length &&
             i < MAX_CATEGORIES_VISITED &&
             includedCategories < MAX_CATEGORIES_INCLUDED;
             ++i)
        {
            const category = card.categories[card.categories.length - 1 - i];
            if (!category) {
                continue;
            }

            const categoryTokens = category
                                   .split(/[\s,\-]+/)
                                   .map(token => token.trim().slice(0, -2).toLowerCase())
                                   .filter(token => token.length > 0);

            var found = false;
            const brandLowercase = card.brand?.toLowerCase() || '';
            for (const token of categoryTokens) {
                if (brandLowercase.includes(token.toLowerCase()) || hasSearchLiteral(token)) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                searchLiterals.categories.unshift(category);
                searchLiterals.all.unshift(category.toLowerCase());
                ++includedCategories;
            }
        }
    }

    return searchLiterals;
}

function parseSearchTokens(card) {
    let searchLiterals = parseSearchLiterals(card);
    return {
        '$title': searchLiterals.title.join(' '),
        '$primary_categories': searchLiterals.categories.join(' '),
        '$brand': card.brand,
        '$product_type': card.product_type,
        '$raw_title': card.title,
    };
}

function makeSearchTextFromPatterns(searchPatterns, searchTokens) {
    for (var pattern of searchPatterns)
    {
        var allTokensFound = true;
        var resultTokens = [];
        for (var tokenName of pattern.tokens)
        {
            const token = searchTokens[tokenName];
            if (!token) {
                allTokensFound = false;
                break;
            }

            resultTokens.push(token);
        }

        if (allTokensFound)
        {
            let result = resultTokens.join(' ');

            if (pattern.min_words || pattern.max_words || pattern.trunc_words)
            {
                let words = result.split(' ');
                if (pattern.min_words && words.length < pattern.min_words)
                {
                    continue;
                }
                if (pattern.max_words && words.length > pattern.max_words)
                {
                    continue;
                }

                if (pattern.trunc_words && words.length > pattern.trunc_words)
                {
                    // Keep at most pattern.trunc_words words (ignoring small words length <= 2)
                    let resultWords = [];
                    let nBigWords = 0;
                    while (nBigWords < pattern.trunc_words && words.length > 0) {
                        resultWords.push(words.shift());
                        if (resultWords.at(-1).length > 2) {
                            nBigWords += 1;
                        }
                    }

                    // Remove small non-numeric words at the end
                    while (resultWords.length > 0) {
                        if (resultWords.at(-1).length > 2 || resultWords.at(-1).match(/\d+/)) {
                            break;
                        }
                        resultWords.pop();
                    }

                    if (resultWords.length === 0) {
                        resultWords = words;
                    }

                    result = resultWords.join(' ');
                }
            }

            return result;
        }
    }

    return null;
}

function makeCommonSearchText(searchTokens) {
    return makeSearchTextFromPatterns(getSearchPatternsDefault(), searchTokens);
}

function makeMakeplaceSearchText(marketplace, searchTokens) {
    if (!marketplace.search_text_patterns) {
        return null;
    }

    return makeSearchTextFromPatterns(marketplace.search_text_patterns, searchTokens);
}

function highlightMatchingTerms(card, cards) {
    if (!cards || cards.length === 0) {
        return;
    }
    const terms = card.title.split(' ').map(t => t.trim().toLowerCase()).filter(t => t.length > 2);

    for (const c of cards) {
        const cTitle = c.title.toLowerCase();
        c.highlights = [];
        for (const term of terms) {
            // Find positions of term in cTitle
            let startIndex = 0;
            while ((startIndex = cTitle.indexOf(term, startIndex)) !== -1) {
                c.highlights.push({
                    term: term,
                    start: startIndex,
                    end: startIndex + term.length
                });
                startIndex += term.length;
            }
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = {
        getAllMarketplaces,
        getMarketplaceById,
        getMarketplaceBySearchPageUrl,
        getMarketplaceByCardPageUrl,
        getMarketplaceByHostname,
        getMarketplaceBaseUrl,
        parseMarketplaceSearchResult,
        parseMarketplaceCard,
        getMarketplaceSettings,
        setMarketplaceSettings,
        getMarketplaceVisible,
        parseSearchTokens,
        makeCommonSearchText,
        makeMakeplaceSearchText,
        makeMarketplaceSearchUrl,
    };
}