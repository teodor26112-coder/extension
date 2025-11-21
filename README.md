# PriceHunt Extension

Проектная заготовка браузерного расширения (Manifest v3) для отслеживания и сравнения цен в Chrome/Firefox.

## Структура проекта
- `manifest.json` — конфигурация расширения: описание, права, фоновый сервис-воркер, контент-скрипты и всплывающее окно.
- `icons/` — иконки разных размеров, указанные в манифесте.
- `background/background.js` — сервис-воркер фона: запрос цен у API, кэширование и ответы всплывающему окну.
- `content-scripts/ozon.js` — интеграция с Ozon: извлечение карточки товара, вставка инлайн-блока, ответы popup.
- `content-scripts/wildberries.js` — интеграция с Wildberries: поиск цены на странице, вставка инлайн-блока, ответы popup.
- `content-scripts/yandex-market.js` — интеграция с Яндекс Маркетом: парсинг товара, инлайн-блок, ответы popup.
- `content-scripts/pricehunt.js` — базовая заготовка для обмена данными и проверки цен.
- `popup/index.html` — каркас всплывающего окна с заголовком, состоянием загрузки и списком результатов.
- `popup/script.js` — логика UI: запрос данных у активной вкладки, сравнение цен через background и рендер результатов.
- `popup/styles.css` — стили оформления всплывающего окна и карточек цен.

## Инструкция по тестированию
1. **Загрузка в Chrome (режим разработчика).** Откройте `chrome://extensions/`, включите «Режим разработчика», нажмите «Загрузить распакованное» и выберите папку репозитория `extension` (внутри должен лежать `manifest.json`).
2. **Тестовые страницы маркетплейсов.**
   - Ozon: `https://www.ozon.ru/product/styazhka-homut-neylonovaya-plastikovaya-krepezh-3-6h200mm-2169594332/`
   - Wildberries: `https://www.wildberries.ru/catalog/0/detail.aspx?targetUrl=XS&kind=1&search=носки`
   - Яндекс Маркет: `https://market.yandex.ru/product--naushniki/12345678` (замените на любой доступный товар).
3. **Чек-лист проверки.**
   - Убедитесь, что на каждой тестовой странице извлекаются данные карточки товара (название, цена, SKU) и контент-скрипт отвечает popup.
   - После нажатия кнопки в popup запрос уходит в background, ответы от API приходят и отображаются в списке маркетплейсов.
   - В всплывающем окне отображаются результаты: название площадки, цена и кнопка перехода; лучшая цена подсвечена.
   - Повторный запрос с тем же SKU в течение 15 минут отрабатывает из кэша (`chrome.storage.local`) без обращения к API.
   - Ошибки API можно имитировать подстановкой неверного ключа или параметров в URLs внутри `background/background.js`: проверьте, что popup показывает сообщение об ошибке и логирует её в консоль.

## Оптимизация запросов к API
Ниже приведены три подхода, которые помогают снизить нагрузку на API маркетплейсов и ускорить ответы.

1. **Пакетная обработка запросов (batching).**
   - **Описание.** Собираем несколько SKU в один запрос и отправляем их пачкой, уменьшая число HTTP-соединений.
   - **Пример кода (Node.js).**
     ```js
     async function fetchBatchPrices(skus) {
       const payload = { skus };
       const res = await fetch('https://api.example.com/prices/batch', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(payload),
       });
       if (!res.ok) throw new Error(`Batch failed: ${res.status}`);
       return res.json(); // { prices: { [sku]: { price, updatedAt } } }
     }
     ```
   - **Плюсы.** Меньше сетевых накладных расходов, проще контролировать лимиты. **Минусы.** Нужна поддержка батч-эндпоинта на стороне API; при ошибке падает вся пачка.

2. **Очередь с задержкой между запросами (rate limiting).**
   - **Описание.** Ограничиваем параллелизм и добавляем паузу между вызовами, чтобы не превышать лимиты API.
   - **Пример кода (Node.js).**
     ```js
     class RateQueue {
       constructor(delayMs = 300, concurrency = 2) {
         this.delayMs = delayMs;
         this.concurrency = concurrency;
         this.active = 0;
         this.queue = [];
       }
       enqueue(task) {
         return new Promise((resolve, reject) => {
           this.queue.push({ task, resolve, reject });
           this.run();
         });
       }
       async run() {
         if (this.active >= this.concurrency || this.queue.length === 0) return;
         const { task, resolve, reject } = this.queue.shift();
         this.active++;
         try {
           const result = await task();
           resolve(result);
         } catch (err) {
           reject(err);
         } finally {
           this.active--;
           setTimeout(() => this.run(), this.delayMs);
         }
       }
     }

     // Использование
     const queue = new RateQueue(300, 2);
     const price = await queue.enqueue(() => fetchPrice('SKU123'));
     ```
   - **Плюсы.** Простое соблюдение лимитов и контроль нагрузки. **Минусы.** Увеличение латентности и необходимость управления очередью.

3. **Кэширование на сервере (с бэкендом).**
   - **Описание.** Сохраняем ответы по SKU на сервере и отдаём кэш, если данные свежие, уменьшая число обращений к стороннему API.
   - **Пример кода (Node.js, Express).**
     ```js
     const cache = new Map(); // sku -> { data, ts }
     const TTL = 15 * 60 * 1000;

     app.get('/api/price/:sku', async (req, res) => {
       const { sku } = req.params;
       const cached = cache.get(sku);
       const fresh = cached && Date.now() - cached.ts < TTL;
       if (fresh) return res.json({ source: 'cache', ...cached.data });

       const apiRes = await fetch(`https://api.example.com/price/${sku}`);
       if (!apiRes.ok) return res.status(apiRes.status).json({ error: 'API error' });
       const data = await apiRes.json();
       cache.set(sku, { data, ts: Date.now() });
       res.json({ source: 'origin', ...data });
     });
     ```
   - **Плюсы.** Сокращает повторные вызовы, ускоряет ответы. **Минусы.** Нужен сервер и контроль TTL/инвалидации; риск устаревших данных.
