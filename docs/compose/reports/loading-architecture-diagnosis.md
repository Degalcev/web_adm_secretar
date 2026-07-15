---
feature: loading-architecture-diagnosis
status: analysis
branch: develop
---

# Диагноз: проблемы загрузки данных VKS / Мероприятия / Dashboard

## Краткое резюме

Текущий deployed код (v1.1.45) находится в промежуточном состоянии между старой архитектурой (загрузка всего в `store.allEvents`) и новой (серверная фильтрация + пагинация). Шаблоны в `templates/preload/` — это правильная целевая архитектура, но они НЕ задеплоены. Из-за этого возникают 4 категории багов.

---

## Проблема 1: Счётчики (Всего/Сегодня/Скоро/Пропущенные) = 0 после обновления страницы

### Корневая причина

Страница VKS: `loadVksActive()` → `loadAllEvents()` → `renderVksBoard()` → `_vksLoadMore()` → `updateVksStats()`.

Статистика загружается через `updateVksStats()` которая вызывается **только внутри `_vksLoadMore`** (vks-filters.js:109). Но `updateVksStats` — async fetch из `/api/events/stats`. Проблема: stats показывают 0 после refresh потому что:

1. **Timing**: `updateVksStats()` вызывается ПОСЛЕ `_vksRenderBoard()`, но DOM ещё может не обновиться
2. **Нет stats при первичной загрузке**: `loadVksActive()` НЕ вызывает `updateVksStats()` напрямую — ждёт пока `_vksLoadMore` завершится
3. **Shifting numbers**: stats пересчитываются при КАЖДОЙ дозагрузке (`updateVksStats()` в `_vksLoadMore`), потому что `_vksRenderBoard` перерисовывает ВСЕ загруженные данные, и stats считаются из загруженного массива, а не из БД

### Что происходит пошагово

```
refresh → loadVksActive()
  → loadAllEvents()           # загружает ~200 событий (backend cap) в store.allEvents
  → renderVksBoard()          # сбрасывает _vksPagination, вызывает _vksLoadMore
    → _vksLoadMore()          # загружает первую страницу 50 событий
      → _vksRenderBoard()     # рендерит карточки
      → updateVksStats()      # fetch /api/events/stats → ОБНОВЛЯЕТ счётчики
```

Stats **показываются** только после завершения `_vksLoadMore`. Если fetch медленный или страница ещё не полностью загружена — пользователь видит 0.

### Решение (в шаблонах)

Stats должны загружаться **параллельно** с данными доски, не после. `loadVksActive()` должен вызывать `updateVksStats()` сразу, не дожидаясь `_vksLoadMore`.

---

## Проблема 2: Мероприятия загружаются только от 13 июля

### Корневая причина

`events.js:_eventsLoadMore()` запрашивает `/admin/api/events?status=active&limit=50` без `type` фильтра. Backend возвращает 50 событий сортированных ASC по дате. Но проблема в другом:

1. **`loadAllEvents()` загружает 200 событий (backend cap) в `store.allEvents`** — это лишний запрос который НЕ нужен для серверной пагинации
2. **`events.js:95`**: `p.events.push(...(data.events || []).filter(e => e.type !== 'ВКС'))` — фильтрация ВКС происходит **клиентски**, после загрузки 50 событий. Если 40 из 50 — ВКС, на странице Мероприятий покажется только 10 карточек
3. **Infinite scroll не работает**: `_findScrollParent()` находит `.page` (`overflow-y: auto`), но `scrollEl.scrollTop + clientHeight >= scrollHeight - 300` не срабатывает повторно из-за flex layout. `events.js` имеет ту же проблему что и VKS — scroll listener на `.page` ненадёжен

### Что происходит

```
initEventsPage()
  → _eventsResetAndLoad()
    → _eventsLoadMore()         # fetch /api/events?status=active&limit=50
      → p.events.push(...filter) # 50 событий, минус ВКС = мало карточек
      → eventsRenderBoard()     # рендерит
    → scroll listener на .page  # НЕ работает повторно (flex layout issue)
```

### Решение (в шаблонах)

1. **Серверный фильтр `type`**: передавать `type` (исключая ВКС) на сервер, не фильтровать клиентски
2. **Sentinel-based scroll**: `renderVksBoard` / `eventsRenderBoard` создают sentinel `<div>`, scroll listener вешается на `_findScrollParent`, а sentinel сохраняется через `removeChild + appendChild` (не innerHTML)

---

## Проблема 3: Dashboard не работает

### Корневая причина

`dashboard.js:renderDashboard()` использует `_dashEvents` (line 113: `const total = _dashEvents.length`). Но `_dashEvents` **никогда не заполняется**.

Цепочка:
```
initDashboard()                    # dashboard.js:10
  → renderDashboard()              # _dashEvents = [] → всё 0
  → preloadAllData().then(...)     # preloadAllData() загружает ТОЛЬКО locations/organizers
    → renderDashboard()            # _dashEvents ВСЁ ЕЩЁ = [] → всё 0
```

`preloadAllData()` (preloader.js:29) загружает `/admin/api/preload` → `store.allLocations` + `store.allOrganizers`. **События НЕ загружаются**. `_dashEvents` остаётся пустым.

Старый код имел `loadFullData()` (dashboard.js:34) который загружал события через `/admin/api/events?limit=10000`. Но `initDashboard()` больше не вызывает `loadFullData()` — он вызывает `preloadAllData()`.

### Backend готов

`dashboard_stats()` (vks.py:318) — endpoint `GET /admin/api/dashboard` — возвращает агрегаты через `get_event_counts_by_date()` + маленькие выборки today/soon. **Но frontend его НЕ использует** — `renderDashboard()` всё ещё считает из `_dashEvents`.

### Решение

Dashboard должен использовать `GET /api/dashboard` вместо `_dashEvents`:
```js
async function initDashboard() {
    const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
    const data = await resp.json();
    // data.total, data.active, data.completed, data.missed — числа
    // data.today, data.soon — массивы событий (по 8 штук)
    renderDashboardFromData(data);
}
```

---

## Проблема 4: `_LOAD_ALL_LIMIT = 10000` — костыль вернулся

### Корневая причина

`vks-filters.js:3`: `const _LOAD_ALL_LIMIT = 10000` — используется в `loadAllEvents()` (line 65):
```js
const resp = await fetch(`${BASE_URL}/admin/api/events?limit=${_LOAD_ALL_LIMIT}`);
```

**Backend ограничивает limit до 200** (vks.py:44):
```python
limit = min(int(request.query.get('limit', '50')), 200)
```

Значит `loadAllEvents()` загружает **максимум 200 событий**, не 10000. Это:
1. **Маскирует проблему**: `store.allEvents` содержит 200 событий — кажется что данные есть, но на самом деле это 200 из thousands
2. **Создаёт ложную зависимость**: код который ссылается на `store.allEvents` (dashboard, calendar, SSE) работает с неполными данными
3. **Дублирует запрос**: `loadAllEvents()` вызывается при каждой загрузке VKS/Events, хотя доска и так делает свой запрос через `_vksLoadMore`/`_eventsLoadMore`

### Почему вернулся

При откате/исправлении предыдущих ошибок (v1.1.39 → v1.1.45) `loadAllEvents()` был восстановлен как "подстраховка" для `store.allEvents`. Но `store.allEvents` больше не нужен при серверной пагинации.

### Решение (в шаблонах)

Убрать `loadAllEvents()` и `_LOAD_ALL_LIMIT`. Каждая страница сама загружает нужные данные через свой запрос с серверной фильтрацией. Preloader грузит ТОЛЬКО справочники.

---

## Проблема 5: Синтаксическая ошибка `sentinel` в vks-board.js

### Ошибка из консоли

```
vks-board.js?v=1.1.45:114 Uncaught SyntaxError: Identifier 'sentinel' has already been declared
```

### Корневая причина

В deployed версии v1.1.45 функция `_vksLoadMore` содержит `const sentinel` дважды:
- строка ~44: `const sentinel = board?.querySelector('.scroll-sentinel');`
- строка ~114: `const sentinel = ...` (дубликат)

`const` неallows повторного объявления в одном scope → SyntaxError → **весь файл vks-board.js не парсится** → все функции (`renderVksBoard`, `_vksLoadMore`, `renderVksCard`) недоступны.

### Влияние

Это **критическая ошибка** — без vks-board.js:
- VKS страница полностью не работает
- `renderVksBoard is not defined` ошибка в vks-filters.js
- `getOrganizerName is not defined` ошибка в events.js (функция определена в utils.js, но events.js может вызываться до загрузки из-за цепочки ошибок)

### Решение

В текущем локальном коде (line 114) используется `const s = ...` вместо `const sentinel = ...` — ошибка исправлена. Но deployed версия всё ещё содержит баг.

---

## Проблема 6: Показ старых данных при переходе между страницами

### Корневая причина

SPA-маршрутизация: `switchPage()` (navigation.js:20) скрывает все `.page` divs и показывает нужную. Но HTML-содержимое доски (`.vks-board`, `#events-board`) **остаётся в DOM** от предыдущего рендера.

Когда пользователь переключается с VKS на Мероприятия и обратно:
1. Страница показывается мгновенно (CSS `display`)
2. `_eventsResetAndLoad()` начинает async загрузку
3. **Во время загрузки** видны старые данные из прошлого рендера
4. После загрузки — новые данные заменяют старые

### Решение

При `switchPage()` **очищать** содержимое доски перед показом:
```js
// В switchPage(), перед показом страницы:
if (page === 'vks-active') {
    const board = document.getElementById('vks-board-active');
    if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
}
```

Или: `renderVksBoard()` уже делает `board.innerHTML = '<div class="scroll-sentinel">...'` — проблема в timing между `classList.add('active')` и началом загрузки.

---

## Сравнение: deployed код vs шаблоны

| Компонент | Deployed (v1.1.45) | Шаблоны (templates/preload/) |
|-----------|--------------------|-----------------------------|
| **VKS загрузка** | `loadAllEvents()` → `store.allEvents` → `renderVksBoard()` | Только `renderVksBoard()` → `_vksLoadMore()` → серверный запрос |
| **Events загрузка** | Клиентский фильтр `e.type !== 'ВКС'` после загрузки | Серверный `type` параметр (не ВКС) |
| **Dashboard** | `_dashEvents` (пустой) → `renderDashboard()` | `GET /api/dashboard` → агрегаты + today/soon |
| **Stats** | `updateVksStats()` в `_vksLoadMore` (только после загрузки) | Параллельно с загрузкой доски |
| **Preloader** | `loadAllEvents()` + `preloadAllData()` | Только `preloadAllData()` (справочники) |
| **SSE** | `_refreshEvents()` → полный сброс | `_refreshEvents()` → инвалидация текущего вида |
| **Scroll** | `_findScrollParent` + `.page` (ненадёжно) | Sentinel-based + removeChild |
| **`_LOAD_ALL_LIMIT`** | Есть (10000, backend cap 200) | Убран |

---

## Файлы для изменения

1. **`app/static/js/vks-filters.js`** — убрать `loadAllEvents()`, `_LOAD_ALL_LIMIT`; `loadVksActive()` / `loadVksCompleted()` не должны вызывать `loadAllEvents()`
2. **`app/static/js/dashboard.js`** — `initDashboard()` → `fetch('/api/dashboard')` вместо `_dashEvents`
3. **`app/static/js/events.js`** — серверный `type` фильтр вместо клиентского `filter(e => e.type !== 'ВКС')`
4. **`app/static/js/vks-board.js`** — исправить дубль `sentinel` (deployed баг)
5. **`app/static/js/preloader.js`** — уже правильный (шаблон = deployed)
6. **`app/static/js/sse.js`** — уже правильный (шаблон = deployed)
7. **`app/static/js/navigation.js`** — очистка доски при переключении страниц
8. **`app/static/js/vks-filters.js`** — `updateVksStats()` вызывать параллельно с `renderVksBoard()`

---

## Journey Log

- [dead end] `IntersectionObserver` для infinite scroll — sentinel уничтожается при `board.innerHTML = html`, observer теряет цель
- [dead end] Scroll listener на `.page` через `_findScrollParent` — flex layout не даёт `scrollHeight` расти корректно, listener срабатывает 1 раз
- [lesson] `limit=10000` маскирует отсутствие серверной фильтрации — backend cap 200 делает его бесполезным
- [lesson] `store.allEvents` — антипаттерн при серверной пагинации — каждая страница должна сама запрашивать нужный срез
- [lesson] Dashboard должен использовать агрегатный endpoint (`/api/dashboard`), не загружать все события
