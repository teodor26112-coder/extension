export function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  const rounded = Math.round(value);
  return new Intl.NumberFormat('ru-RU').format(rounded) + ' ₽';
}

export function calcStats(item) {
  const history = Array.isArray(item.history) ? item.history : [];
  const current = typeof item.lastPrice === 'number' ? item.lastPrice : null;
  const average =
    history.length > 0
      ? history.reduce((sum, entry) => sum + entry.price, 0) / history.length
      : null;
  const firstPrice = history[0]?.price ?? current;
  const previousPrice = history.length > 1 ? history[history.length - 2].price : null;
  const changeFromStart =
    typeof current === 'number' && typeof firstPrice === 'number' ? current - firstPrice : null;
  const changeFromLast =
    typeof current === 'number' && typeof previousPrice === 'number' ? current - previousPrice : null;
  return {
    current,
    average,
    changeFromStart,
    changeFromLast,
  };
}

export function renderChart(canvas, history = []) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!history.length) {
    ctx.fillStyle = '#888';
    ctx.font = '12px system-ui';
    ctx.fillText('Нет данных', 10, height / 2);
    return;
  }
  const prices = history.map((entry) => entry.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padding = 10;
  ctx.strokeStyle = '#0b67ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((entry, index) => {
    const x = padding + (index / Math.max(history.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((entry.price - min) / range) * (height - padding * 2);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.fillStyle = '#0b67ff';
  history.forEach((entry, index) => {
    const x = padding + (index / Math.max(history.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((entry.price - min) / range) * (height - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}
