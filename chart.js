function groupPricesByDate(history) {
    let historyByDate = {};
    let currency = '₽';

    for (var i = 0; i < history.length; ++i) {
        const hist = history[i];
        const date = new Date(hist.dttm);
        date.setHours(0, 0, 0, 0);
        if (!historyByDate[date]) {
            historyByDate[date] = [];
        }
        historyByDate[date].push(hist.price.value);
        currency = hist.price.currency;
    }

    let result = [];
    for (const [date, prices] of Object.entries(historyByDate)) {
        let avgPrice = 0, minPrice = 0, maxPrice = 0;
        for (const price of prices) {
            avgPrice += price;
            minPrice = Math.min(minPrice, price);
            maxPrice = Math.min(maxPrice, price);
        }
        avgPrice /= prices.length;

        result.push({
            date: new Date(date),
            prices: prices,
            avg_price: avgPrice,
            min_price: minPrice,
            max_price: maxPrice,
            currency: currency,
        });
    }

    result.sort((a, b) => a.date - b.date);
    return result;
}

function drawPriceHistoryChart(canvas, history) {
    const ctx = canvas.getContext('2d', { alpha: false });

    const dpr = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const points = groupPricesByDate(history);

    const priceDigits = 0;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const leftPadding = 50;
    const rightPadding = 20;
    const topPadding = 20;
    const bottomPadding = 40;
    const pointRadius = 3;
    const gridColor = '#e0e0e0';
    const lineColor = '#1976d2';
    const bgColor = '#fff';
    const font = '12px Arial';
    const tooltipFont = 'bold 13px Arial';
    const monthsRu = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    // Prepare data
    const xs = points.map(p => p.date.getTime());
    const ys = points.map(p => p.avg_price);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    function makePrice(value) {
        return value.toFixed(priceDigits).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    // Helper: map data to canvas coordinates
    function getCanvasX(x) {
        return leftPadding + ((x - minX) / (maxX - minX || 1)) * (width - leftPadding - rightPadding);
    }
    function getCanvasY(y) {
        return height - bottomPadding - ((y - minY) / (maxY - minY || 1)) * (height - topPadding - bottomPadding);
    }

    // Draw chart
    function drawChart(hoverIndex = null) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw vertical grid lines and x axis labels
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';

        const xTicks = points.length >= 2 ? Math.min(points.length, 10) : 2;
        for (let i = 0; i < xTicks; i++) {
            const idx = Math.round(i * (points.length - 1) / (xTicks - 1));
            const x = getCanvasX(xs[idx]);
            ctx.beginPath();
            ctx.moveTo(x, topPadding);
            ctx.lineTo(x, height - bottomPadding + 5);
            ctx.stroke();

            // X axis label
            const date = points[idx].date;
            const label = `${date.getDate()} ${monthsRu[date.getMonth()]}`;
            ctx.fillStyle = '#333';
            ctx.fillText(label, x + 10, height - bottomPadding + 18);
        }

        // Draw horizontal grid lines and y axis labels
        const yTicks = 6;
        for (let i = 0; i < yTicks; i++) {
            const yValue = minY + (maxY - minY) * (i / (yTicks - 1));
            const y = getCanvasY(yValue);
            ctx.beginPath();
            ctx.moveTo(leftPadding - 5, y);
            ctx.lineTo(width - rightPadding, y);
            ctx.stroke();

            // Y axis label
            ctx.fillText(makePrice(yValue), leftPadding - 8, y);
        }

        // Draw line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < points.length; ++i) {
            const p = points[i];
            const x = getCanvasX(p.date.getTime());
            const y = getCanvasY(p.avg_price);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw points
        for (var i = 0; i < points.length; ++i) {
            const p = points[i];
            const x = getCanvasX(p.date.getTime());
            const y = getCanvasY(p.avg_price);
            ctx.beginPath();
            ctx.arc(x, y, pointRadius, 0, 2 * Math.PI);
            ctx.fillStyle = (i === hoverIndex) ? '#ff9800' : lineColor;
            ctx.fill();
        };

        // Draw tooltip if hovering
        if (hoverIndex !== null) {
            const p = points[hoverIndex];
            const x = getCanvasX(p.date.getTime());
            const y = getCanvasY(p.avg_price);
            const label = `${p.date.getDate()} ${monthsRu[p.date.getMonth()]}`;
            const avgPrice = `${makePrice(p.avg_price)}${p.currency}`;
            let priceDiffText = null;
            let priceDiffColor;
            if (hoverIndex > 0)
            {
                const diff = p.avg_price - points[hoverIndex - 1].avg_price;
                priceDiffText = `${makePrice(diff)}${p.currency}`;
                if (diff > 0) {
                    priceDiffText = '+' + priceDiffText;
                    priceDiffColor = '#aa0000';
                } else if (diff < 0) {
                    priceDiffColor = '#006600';
                } else {
                    priceDiffText = '+' + priceDiffText;
                    priceDiffColor = '#333';
                }
                priceDiffText = `(${priceDiffText})`;
            }

            const tooltipText = `${label}: ${avgPrice}`;

            ctx.font = tooltipFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            // Tooltip box
            const tooltipTextMetrics = ctx.measureText(tooltipText);
            const priceDiffMetrics = priceDiffColor ? ctx.measureText(priceDiffColor) : null;
            const tw = tooltipTextMetrics.width + (priceDiffMetrics ? priceDiffMetrics.width + 4 : 0) + 16;
            const th = 28;
            let tx = x + 10;
            let ty = y - th - 10;
            if (tx + tw > width) tx = x - tw - 10;
            if (ty < 0) ty = y + 10;

            ctx.fillStyle = '#fffbe7';
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(tx, ty, tw, th);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.fillText(tooltipText, tx + 8, ty + 7);

            if (priceDiffText) {
                ctx.fillStyle = priceDiffColor;
                ctx.fillText(priceDiffText, tx + 8 + tooltipTextMetrics.width + 4, ty + 7);
            }
        }
    }

    // Interactivity
    let lastHoverIndex = null;

    canvas.onmousemove = function (e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let found = null;
        for (var i = 0; i < points.length; ++i) {
            const p = points[i];
            const x = getCanvasX(p.date.getTime());
            const y = getCanvasY(p.avg_price);
            if (Math.hypot(mx - x, my - y) <= pointRadius + 4) {
                found = i;
                break;
            }
        }
        if (lastHoverIndex !== found) {
            lastHoverIndex = found;
            drawChart(found);
        }
    };
    canvas.onmouseleave = function () {
        lastHoverIndex = null;
        drawChart();
    };

    drawChart();
}