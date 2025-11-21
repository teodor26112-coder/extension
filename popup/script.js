const setInfo = (text) => {
  const info = document.querySelector('.info-text');
  if (info) {
    info.textContent = text;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setInfo(
    'PriceHunt сравнивает цены прямо на странице товара. Перейдите к карточке на маркетплейсе и пролистайте до цены.'
  );
});
