let UTF8_TO_WIN1251 = null;

function initEncoder() {
    UTF8_TO_WIN1251 = new Map();

    for (let i = 0x20; i <= 0x7E; i++) {
        UTF8_TO_WIN1251.set(String.fromCharCode(i), i);
    }

    UTF8_TO_WIN1251.set('А', 0xC0); UTF8_TO_WIN1251.set('Б', 0xC1); UTF8_TO_WIN1251.set('В', 0xC2); UTF8_TO_WIN1251.set('Г', 0xC3);
    UTF8_TO_WIN1251.set('Д', 0xC4); UTF8_TO_WIN1251.set('Е', 0xC5); UTF8_TO_WIN1251.set('Ж', 0xC6); UTF8_TO_WIN1251.set('З', 0xC7);
    UTF8_TO_WIN1251.set('И', 0xC8); UTF8_TO_WIN1251.set('Й', 0xC9); UTF8_TO_WIN1251.set('К', 0xCA); UTF8_TO_WIN1251.set('Л', 0xCB);
    UTF8_TO_WIN1251.set('М', 0xCC); UTF8_TO_WIN1251.set('Н', 0xCD); UTF8_TO_WIN1251.set('О', 0xCE); UTF8_TO_WIN1251.set('П', 0xCF);
    UTF8_TO_WIN1251.set('Р', 0xD0); UTF8_TO_WIN1251.set('С', 0xD1); UTF8_TO_WIN1251.set('Т', 0xD2); UTF8_TO_WIN1251.set('У', 0xD3);
    UTF8_TO_WIN1251.set('Ф', 0xD4); UTF8_TO_WIN1251.set('Х', 0xD5); UTF8_TO_WIN1251.set('Ц', 0xD6); UTF8_TO_WIN1251.set('Ч', 0xD7);
    UTF8_TO_WIN1251.set('Ш', 0xD8); UTF8_TO_WIN1251.set('Щ', 0xD9); UTF8_TO_WIN1251.set('Ъ', 0xDA); UTF8_TO_WIN1251.set('Ы', 0xDB);
    UTF8_TO_WIN1251.set('Ь', 0xDC); UTF8_TO_WIN1251.set('Э', 0xDD); UTF8_TO_WIN1251.set('Ю', 0xDE); UTF8_TO_WIN1251.set('Я', 0xDF);

    UTF8_TO_WIN1251.set('а', 0xE0); UTF8_TO_WIN1251.set('б', 0xE1); UTF8_TO_WIN1251.set('в', 0xE2); UTF8_TO_WIN1251.set('г', 0xE3);
    UTF8_TO_WIN1251.set('д', 0xE4); UTF8_TO_WIN1251.set('е', 0xE5); UTF8_TO_WIN1251.set('ж', 0xE6); UTF8_TO_WIN1251.set('з', 0xE7);
    UTF8_TO_WIN1251.set('и', 0xE8); UTF8_TO_WIN1251.set('й', 0xE9); UTF8_TO_WIN1251.set('к', 0xEA); UTF8_TO_WIN1251.set('л', 0xEB);
    UTF8_TO_WIN1251.set('м', 0xEC); UTF8_TO_WIN1251.set('н', 0xED); UTF8_TO_WIN1251.set('о', 0xEE); UTF8_TO_WIN1251.set('п', 0xEF);
    UTF8_TO_WIN1251.set('р', 0xF0); UTF8_TO_WIN1251.set('с', 0xF1); UTF8_TO_WIN1251.set('т', 0xF2); UTF8_TO_WIN1251.set('у', 0xF3);
    UTF8_TO_WIN1251.set('ф', 0xF4); UTF8_TO_WIN1251.set('х', 0xF5); UTF8_TO_WIN1251.set('ц', 0xF6); UTF8_TO_WIN1251.set('ч', 0xF7);
    UTF8_TO_WIN1251.set('ш', 0xF8); UTF8_TO_WIN1251.set('щ', 0xF9); UTF8_TO_WIN1251.set('ъ', 0xFA); UTF8_TO_WIN1251.set('ы', 0xFB);
    UTF8_TO_WIN1251.set('ь', 0xFC); UTF8_TO_WIN1251.set('э', 0xFD); UTF8_TO_WIN1251.set('ю', 0xFE); UTF8_TO_WIN1251.set('я', 0xFF);
}

function encodeStringToWin1251Url(inputString) {
    if (!UTF8_TO_WIN1251) {
        initEncoder();
    }

    let encodedBytes = [];
    for (let i = 0; i < inputString.length; i++) {
        const char = inputString[i];
        const byteValue = UTF8_TO_WIN1251.get(char);

        if (byteValue !== undefined) {
            encodedBytes.push(byteValue);
        } else {
            // skip
        }
    }

    let urlEncodedString = '';
    for (let i = 0; i < encodedBytes.length; i++) {
        const byte = encodedBytes[i];
        urlEncodedString += '%' + byte.toString(16).padStart(2, '0').toUpperCase();
    }
    return urlEncodedString;
}


// style: 'html' (or false), 'text'
function formatMoney(price, style) {
    if (!price) {
        return '';
    }

    var num = price.value;
    if (!Number.isSafeInteger(num)) {
        num = num.toFixed(2);
    }

    const spaceSymbol = (style === 'text') ? ' ' : '&nbsp;';
    const value = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, spaceSymbol);
    const currency = price.currency || '₽';

    return `${value}${spaceSymbol}${currency}`;
}

function formatDate(value) {
    if (!value) {
        return '';
    }

    let date;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        date = new Date(value);
    } else {
        throw new Error(`Invalid dttm: ${value}`);
    }

    const today = new Date();

    // const isToday = today.getFullYear() === date.getFullYear() &&
    //                 today.getMonth() === date.getMonth() &&
    //                 today.getDate() === date.getDate();
    // if (isToday) {
    //     const hours = String(date.getHours()).padStart(2, '0');
    //     const minutes = String(date.getMinutes()).padStart(2, '0');
    //     return `${hours}:${minutes}`;
    // }

    const isThisYear = today.getFullYear() === date.getFullYear();

    if (isThisYear) {
        const day = date.getDate();
        let month = new Intl.DateTimeFormat('default', { month: 'short' }).format(date);
        if (month.endsWith('.')) {
            month = month.substring(0, month.length-1);
        }

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day} ${month} ${hours}:${minutes}`;
    }

    const day = date.getDate();
    const month = new Intl.DateTimeFormat('default', { month: 'short' }).format(date);
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}


function formatPercent(value) {
    if (value > 1) {
        return Math.round(value);
    }
    return value.toFixed(1);
}

function formatRating(value) {
    if (!value) {
        return '';
    }

    return value.toFixed(1).toString();
}

function formatCountForm(number, words) {
    const options = [2, 0, 1, 1, 1, 2];
    return words[(number % 100 > 4 && number % 100 < 20) ? 2 : options[(number % 10 < 5) ? number % 10 : 5]];
}

function calcDefaultAlertPrice(value, fraction) {
    const pwr = (value <= 1) ? 100 :
                (value <= 10) ? 10 :
                (value <= 100) ? 1 :
                (value <= 1000) ? 0.1 :
                (value <= 10000) ? 0.01 :
                0.001;

    return Math.max(Math.round(value * pwr * fraction) / pwr, 0.01);
}

function secondsBetween(date1, date2) {
    return Math.abs(date1.getTime() - date2.getTime()) / 1000;
}