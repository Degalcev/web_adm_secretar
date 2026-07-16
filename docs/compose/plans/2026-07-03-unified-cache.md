# Unified In-Memory Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4 разных паттернов кэширования (localStorage, in-memory, dirty flags, hard reset) единым in-memory кэшем с единым механизмом обновления через SSE.

**Architecture:** Один объект `_dataCache` хранит данные всех страниц. При входе на страницу — render из кэша. При SSE — fetch → update cache → render. При обновлении страницы — кэш теряется, SSE восстанавливает за ~200ms.

**Tech Stack:** Vanilla JS, no frameworks

## Global Constraints

- Все коммиты и пояснения — на русском языке
- Деплой через `python deploy/deploy.py test` (ветка `develop`)
- Версионирование: инкрементировать второе значение (не patch)
- `loguru.logger` — никогда `print()` или `logging`
- НЕ трогай цвета вкладок/заголовка
- Backend: Python aiohttp, PostgreSQL, 5-7ms latency
- Frontend: vanilla JS SPA, no frameworks

## Текущие баги (исправить в процессе)

1. **VKS localStorage кэш не работает:** ключи чтения (`vks_cache_vks_board_active`) и записи (`vks_cache_active`) не совпадают — `_vksCacheGet` всегда возвращает null
2. **`store.allEvents`** — мёртвое поле, нигде не заполняется
3. **`_dashLocations` / `_dashOrganizers`** — дублируют `store.allLocations` / `store.allOrganizers`, заполняются в 3 местах

## Архитектура кэша

### Стратегия загрузки по страницам

| Страница | Стратегия | Причина |
|----------|-----------|---------|
| VKS Текущие | **Полная загрузка** | Мало событий, render мгновенно |
| VKS Завершённые | **Пагинация по 50** | Много событий, infinite scroll |
| Мероприятия Текущие | **Полная загрузка** | Мало событий |
| Мероприятия Завершённые | **Пагинация по 50** | Много событий |
| Dashboard | **Один endpoint** | Агрегаты + 8+8 событий |
| Календарь | **Диапазон дат** | ±20 дней от текущей недели |
| Справочники | **Полная загрузка** | Маленькие таблицы |

### Cache object

```javascript
const _dataCache = {
    // Текущие — полная загрузка, кэш = все события
    vksActive:       { events: [], stats: {}, loaded: false, ts: 0 },
    eventsActive:    { events: [], stats: {}, loaded: false, ts: 0 },
    // Завершённые — пагинация, кэш = накопленные страницы
    vksCompleted:    { events: [], stats: {}, hasMore: true, cursor: {}, loaded: false, ts: 0 },
    eventsCompleted: { events: [], stats: {}, hasMore: true, cursor: {}, loaded: false, ts: 0 },
    // Dashboard
    dashboard: { data: null, ts: 0 },
    // Справочники
    locations:  { items: [], ts: 0 },
    organizers: { items: [], ts: 0 },
    users:      { items: [], ts: 0 },
    // Календарь
    calendar: { ranges: {}, ts: 0 },
};

// Единый интерфейс
function cacheGet(page)          // → _dataCache[page]
function cacheSet(page, data)    // → _dataCache[page] = { ...data, ts: Date.now() }
function cacheInvalidate(page)   // → _dataCache[page] = null
function cacheIsValid(page, ttl) // → _dataCache[page]?.loaded && (now - ts) < ttl
```

### Стратегия фильтрации

| Страница | Загрузка | Фильтрация | Причина |
|----------|----------|------------|---------|
| Текущие (VKS/Events) | Полная | **В кэше** (client-side) | Все данные уже загружены, мгновенно |
| Завершённые (VKS/Events) | Пагинация | **На сервере** (server-side) | Полных данных нет |

### Поток данных

```
Текущие (VKS/Events):
  Вход → cacheIsValid()?
    Да → render из кэша (мгновенно)
    Нет → fetch ВСЕ → cacheSet(loaded:true) → render

  Фильтрация → фильтруем cached.events в JS → render (без запроса к серверу)

Завершённые (VKS/Events):
  Вход → cacheIsValid()?
    Да → render из кэша + infinite scroll для новых
    Нет → fetch первые 50 → cacheSet → render

  Фильтрация → fetch с query params (org, loc, search, date) → cacheSet → render

SSE:
  → fetch (полный для Текущих, 50 для Завершённых)
  → cacheSet → render (только если страница видима)
```

---

## Task 1: Создать модуль кэша `cache.js`

**Files:**
- Create: `app/static/js/cache.js`

**Interfaces:**
- Produces: `_dataCache`, `cacheGet()`, `cacheSet()`, `cacheInvalidate()`, `cacheIsValid()`

- [ ] **Step 1: Создать `app/static/js/cache.js`**

```javascript
// ─── Единый in-memory кэш всех данных ──────────────────────────────

const _dataCache = {
    vksActive:    null,
    vksCompleted: null,
    eventsActive: null,
    eventsCompleted: null,
    dashboard:    null,
    locations:    null,
    organizers:   null,
    users:        null,
    calendar:     null,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

function cacheGet(page) {
    return _dataCache[page];
}

function cacheSet(page, data) {
    _dataCache[page] = { data, ts: Date.now() };
}

function cacheInvalidate(page) {
    _dataCache[page] = null;
}

function cacheIsValid(page, ttl) {
    const entry = _dataCache[page];
    if (!entry || !entry.data) return false;
    if (entry.data && Array.isArray(entry.data) && entry.data.length === 0) return false;
    if (ttl === undefined) ttl = CACHE_TTL;
    return (Date.now() - entry.ts) < ttl;
}

function cacheInvalidateAll() {
    Object.keys(_dataCache).forEach(k => { _dataCache[k] = null; });
}
```

- [ ] **Step 2: Подключить `cache.js` в `index.html`**

Добавить `<script src="/static/js/cache.js"></script>` перед `utils.js`.

- [ ] **Step 3: Коммит**

```bash
git add app/static/js/cache.js
git commit -m "feat: единый in-memory кэш — модуль cache.js"
```

---

## Task 2: Миграция VKS на единый кэш

**Files:**
- Modify: `app/static/js/vks-board.js` — убрать `_vksCacheGet`/`_vksCacheSet` (localStorage), использовать `cacheGet`/`cacheSet`
- Modify: `app/static/js/vks-filters.js` — `loadVksActive` (полная загрузка), `loadVksCompleted` (пагинация)
- Modify: `app/static/js/sse.js` — `_sseUpdateAndRender` пишет в `cacheSet`

**Interfaces:**
- Consumes: `cacheGet()`, `cacheSet()`, `cacheIsValid()` из `cache.js`
- Produces: `_vksPagination[boardId]` — in-memory данные текущей страницы

### Ключевое различие: Текущие vs Завершённые

**VKS Текущие** — загружаются ОДНИМ запросом (`limit=10000`). Кэш хранит ВСЕ события. Infinite scroll не нужен. SSE обновляет полный набор.

**VKS Завершённые** — пагинация по 50. Кэш накапливает страницы. Infinite scroll продолжает загрузку. SSE обновляет только видимую часть.

- [ ] **Step 1: Обновить `vks-board.js`**

Удалить `_vksCacheGet()` и `_vksCacheSet()` (строки 48-64).

Переписать `renderVksBoard()`:

```javascript
function renderVksBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;

    const cacheKey = filter === 'active' ? 'vksActive' : 'vksCompleted';
    const cached = cacheGet(cacheKey);
    const events = cached?.events || [];

    _vksPagination[boardId] = {
        events: events,
        cursorDate: cached?.cursorDate || null,
        cursorTime: cached?.cursorTime || null,
        cursorId: cached?.cursorId || null,
        hasMore: filter === 'active' ? false : (cached?.hasMore ?? true),
        loading: false,
    };

    if (events.length) {
        _sseRerenderFromCache(boardId, filter);
        return;
    }

    // Первый запуск — загрузка с сервера
    board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';

    if (filter === 'active') {
        // Текущие — полная загрузка одним запросом
        _vksLoadAll(boardId, filter);
    } else {
        // Завершённые — пагинация
        const scrollEl = _findScrollParent(board);
        if (scrollEl) {
            const handlerKey = '_vksScroll_' + boardId;
            if (scrollEl[handlerKey]) scrollEl.removeEventListener('scroll', scrollEl[handlerKey]);
            scrollEl[handlerKey] = () => {
                if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 300) {
                    _vksLoadMore(boardId, filter);
                }
            };
            scrollEl.addEventListener('scroll', scrollEl[handlerKey]);
        }
        _vksLoadMore(boardId, filter);
    }
}
```

Добавить новую функцию `_vksLoadAll()` (полная загрузка для Текущих):

```javascript
async function _vksLoadAll(boardId, filter) {
    const p = _vksPagination[boardId];
    if (p.loading) return;
    p.loading = true;

    try {
        const params = new URLSearchParams({ status: filter, type: 'ВКС', limit: 10000 });
        // ... server-side filters (org, loc, search, date) ...
        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events = data.events || [];
        p.hasMore = false;

        const cacheKey = 'vksActive';
        cacheSet(cacheKey, { events: p.events, stats: cacheGet(cacheKey)?.stats || {} });

        _vksRenderBoard(boardId, filter);
    } catch (e) {
        console.error('_vksLoadAll error:', e);
    }
    p.loading = false;
}
```

В `_vksLoadMore()` — заменить `_vksCacheSet(filter, p.events)` на `cacheSet` (только для Завершённых):

```javascript
// В конце _vksLoadMore, после успешной загрузки:
const cacheKey = 'vksCompleted';
const existing = cacheGet(cacheKey) || {};
cacheSet(cacheKey, {
    events: p.events,
    stats: existing.stats || {},
    cursorDate: p.cursorDate,
    cursorTime: p.cursorTime,
    cursorId: p.cursorId,
    hasMore: p.hasMore,
});
```

- [ ] **Step 2: Обновить `vks-filters.js`**

В `loadVksActive()` — читать stats из кэша, фильтрация client-side:

```javascript
async function loadVksActive() {
    populateDateSelects('f-vks-active');
    populateVksFilters();
    const cached = cacheGet('vksActive');
    if (cached?.stats) _vksRenderStats(cached.stats);
    const board = document.getElementById('vks-board-active');
    if (board && !board.querySelector('.vks-card')) renderVksBoard('vks-board-active', 'active');
    // ... pending filter logic (без изменений) ...
}
```

В `loadVksCompleted()` — аналогично с `cacheGet('vksCompleted')`.

**Ключевое изменение:** `filterVksByQuick()`, `filterVksListActive()`, `filterVksListCompleted()` — для Текущих фильтрация client-side, для Завершённых server-side.

Добавить новую функцию `_vksRenderFiltered()` для Текущих:

```javascript
function _vksRenderFiltered(boardId, filter) {
    if (filter !== 'active') {
        // Завершённые — server-side фильтрация (запрос с параметрами)
        renderVksBoard(boardId, filter);
        return;
    }
    // Текущие — client-side фильтрация из кэша
    const cached = cacheGet('vksActive');
    if (!cached?.events) return;

    let events = [...cached.events];

    // Быстрые фильтры (today/soon/missed)
    // ... apply quick filter ...

    // Фильтры по/org, loc, search, date
    // ... apply server-side filters client-side ...

    // Render
    _vksPagination[boardId].events = events;
    _vksRenderBoard(boardId, filter);
}
```

Заменить вызовы `renderVksBoard` в фильтрах на `_vksRenderFiltered`:

```javascript
function filterVksByQuick(type) {
    _quickFilter = (_quickFilter === type) ? '' : type;
    // ... update card active state ...
    _vksRenderFiltered('vks-board-active', 'active');
}

function filterVksListActive() {
    _vksRenderFiltered('vks-board-active', 'active');
}

function filterVksListCompleted() {
    renderVksBoard('vks-board-completed', 'completed'); // server-side
}
```

В `updateVksStats()` — обновлять stats в кэше:

```javascript
async function updateVksStats() {
    const status = _eventsCompleted ? 'completed' : 'active';
    // ... fetch stats ...
    const cacheKey = status === 'active' ? 'vksActive' : 'vksCompleted';
    const existing = cacheGet(cacheKey);
    if (existing) {
        existing.stats = stats;
        cacheSet(cacheKey, existing);
    }
}
```

- [ ] **Step 3: Обновить `sse.js` — `_sseUpdateAndRender`**

Для Текущих — полный re-fetch. Для Завершённых — fetch до текущего количества:

```javascript
async function _sseUpdateAndRender(boardId, filter) {
    const cacheKey = filter === 'active' ? 'vksActive' : 'vksCompleted';
    const existing = cacheGet(cacheKey);
    const limit = filter === 'active' ? 10000 : Math.max(existing?.events?.length || 50, 50);

    // Parallel: events + stats
    const [eventsResp, statsResp] = await Promise.all([
        fetch(`/admin/api/events?status=${filter}&type=ВКС&limit=${limit}`, { credentials: 'same-origin' }),
        fetch(`/admin/api/events/stats?status=${filter}&type=ВКС`, { credentials: 'same-origin' }),
    ]);

    const eventsData = await eventsResp.json();
    const stats = await statsResp.json();

    const p = _vksPagination[boardId];
    p.events = eventsData.events || [];
    p.hasMore = filter === 'active' ? false : !!eventsData.has_more;
    p.cursorDate = eventsData.next_cursor_date || null;
    p.cursorTime = eventsData.next_cursor_time || null;
    p.cursorId = eventsData.next_cursor_id || null;

    cacheSet(cacheKey, {
        events: p.events,
        stats,
        hasMore: p.hasMore,
        cursorDate: p.cursorDate,
        cursorTime: p.cursorTime,
        cursorId: p.cursorId,
    });

    _vksRenderStats(stats);
    _sseRerenderFromCache(boardId, filter);
}
```

- [ ] **Step 4: Удалить мёртвый код**

- Удалить `_vksCacheGet()` и `_vksCacheSet()` из `vks-board.js`
- Удалить localStorage ключи `vks_cache_*` из `logout()` в `auth.js`
- Удалить localStorage.removeItem для `vks_cache_*` из `sse.js` (если есть)

- [ ] **Step 5: Коммит**

```bash
git add app/static/js/vks-board.js app/static/js/vks-filters.js app/static/js/sse.js app/static/js/auth.js
git commit -m "refactor: VKS на едином кэше — Текущие полная загрузка, Завершённые пагинация"
```

---

## Task 3: Миграция Мероприятий на единый кэш

**Files:**
- Modify: `app/static/js/events.js` — убрать `_eventsCache`, использовать `cacheGet`/`cacheSet`
- Modify: `app/static/js/sse.js` — `_refreshEvents` для events

**Interfaces:**
- Consumes: `cacheGet()`, `cacheSet()`, `cacheInvalidate()` из `cache.js`
- Produces: `_eventsPagination` — in-memory данные текущей страницы

### Стратегия загрузки

**Мероприятия Текущие** — полная загрузка (`limit=10000`, `exclude_type=ВКС`). Кэш = все текущие события. Infinite scroll не нужен.

**Мероприятия Завершённые** — пагинация по 50. Кэш накапливает. Infinite scroll продолжает.

- [ ] **Step 1: Обновить `events.js`**

Удалить `_eventsCache` (строки 10-14), `_eventsGetCache()`, `_eventsIsCacheValid()`, `_eventsWriteCache()`, `_eventsInvalidateCache()`, `EVENTS_CACHE_TTL`.

Переписать `initEventsPage()`:

```javascript
function initEventsPage(completed = false) {
    _eventsCompleted = completed;
    _eventsTypeFilter = null;
    const title = document.getElementById('events-page-title');
    if (title) title.textContent = completed ? 'Завершённые мероприятия' : 'Текущие мероприятия';
    _eventsPopulateFilters();

    const cacheKey = completed ? 'eventsCompleted' : 'eventsActive';
    const cached = cacheGet(cacheKey);

    if (cached?.loaded) {
        // Восстановить _eventsPagination из кэша
        _eventsPagination.events = cached.events || [];
        _eventsPagination.cursorDate = cached.cursorDate || null;
        _eventsPagination.cursorTime = cached.cursorTime || null;
        _eventsPagination.cursorId = cached.cursorId || null;
        _eventsPagination.hasMore = completed ? (cached.hasMore ?? true) : false;
        eventsRenderBoard();
        eventsUpdateStats();
        return;
    }

    // Первый вход — загрузка
    _eventsHardReset();
}
```

В `_eventsHardReset()` — для Текущих полная загрузка, для Завершённых пагинация:

```javascript
function _eventsHardReset() {
    const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
    cacheInvalidate(cacheKey);
    _eventsPagination.events = [];
    _eventsPagination.cursorDate = null;
    _eventsPagination.cursorTime = null;
    _eventsPagination.cursorId = null;
    _eventsPagination.hasMore = true;
    _eventsPagination.loading = false;

    const board = document.getElementById('events-board');
    if (!board) return;
    board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';

    if (!_eventsCompleted) {
        // Текущие — полная загрузка
        _eventsLoadAll();
    } else {
        // Завершённые — пагинация
        const scrollEl = _findScrollParent(board);
        if (scrollEl) {
            if (scrollEl._eventsScrollHandler) scrollEl.removeEventListener('scroll', scrollEl._eventsScrollHandler);
            scrollEl._eventsScrollHandler = () => {
                if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 300) _eventsLoadMore();
            };
            scrollEl.addEventListener('scroll', scrollEl._eventsScrollHandler);
        }
        _eventsLoadMore();
    }
}
```

Добавить `_eventsLoadAll()`:

```javascript
async function _eventsLoadAll() {
    const p = _eventsPagination;
    if (p.loading) return;
    p.loading = true;

    const board = document.getElementById('events-board');
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка…</div>';

    try {
        const params = new URLSearchParams({
            status: 'active', limit: 10000, exclude_type: 'ВКС',
        });
        // ... server-side filters (org, loc, search, date) ...
        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events = data.events || [];
        p.hasMore = false;

        cacheSet('eventsActive', {
            events: p.events,
            loaded: true,
            hasMore: false,
        });

        eventsRenderBoard();
        eventsUpdateStats();
    } catch (e) {
        console.error('_eventsLoadAll error:', e);
    }
    p.loading = false;
    if (sentinel) sentinel.innerHTML = '';
}
```

В `_eventsLoadMore()` (только для Завершённых) — заменить `_eventsWriteCache(data, true)` на `cacheSet`:

```javascript
// В конце _eventsLoadMore:
cacheSet('eventsCompleted', {
    events: p.events,
    cursorDate: p.cursorDate,
    cursorTime: p.cursorTime,
    cursorId: p.cursorId,
    hasMore: p.hasMore,
    loaded: true,
});
```

В `eventsRenderBoard()` — заменить `_eventsGetCache()` на `cacheGet()`:

```javascript
function eventsRenderBoard() {
    const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
    const cached = cacheGet(cacheKey);
    let events = [...(cached?.events || [])];
    // ... остальная логика фильтрации и рендера (без изменений) ...
}
```

- [ ] **Step 2: Обновить фильтрацию в `events.js`**

`eventsRenderBoard()` уже делает client-side фильтрацию из `_eventsGetCache()`. Заменить на `cacheGet()`:

```javascript
function eventsRenderBoard() {
    const board = document.getElementById('events-board');
    if (!board) return;

    const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
    const cached = cacheGet(cacheKey);
    let events = [...(cached?.events || [])];

    // Quick filter (today/soon/missed) — client-side
    if (_eventsQuickFilter) {
        const today = localDateStr(new Date());
        if (_eventsQuickFilter === 'today') events = events.filter(e => e.date === today);
        else if (_eventsQuickFilter === 'soon') events = events.filter(e => e.date && e.date > today);
        else if (_eventsQuickFilter === 'missed') events = events.filter(e => !e.date || e.date < today);
    }

    // Date filter (day/month/year) — client-side
    // ... existing code ...

    // Server-side filters (org, loc, desc) — client-side для Текущих, server-side для Завершённых
    if (orgVal) events = events.filter(e => e.organizer_id === orgVal);
    if (locVal) events = events.filter(e => e.location_id === locVal);
    if (descVal) events = events.filter(e =>
        (e.description || '').toLowerCase().includes(descVal) ||
        (e.url || '').toLowerCase().includes(descVal)
    );

    // ... render logic (без изменений) ...
}
```

Для Завершённых — server-side фильтрация через `_eventsLoadMore()` с query params (уже реализовано).

- [ ] **Step 3: Обновить `sse.js` для events**

В `_refreshEvents()` case `'events-active'`:

```javascript
case 'events-active': {
    // Текущие — полный re-fetch
    _eventsHardReset();
    break;
}
```

case `'events-completed'`:

```javascript
case 'events-completed': {
    // Завершённые — invalidate + re-fetch
    cacheInvalidate('eventsCompleted');
    _eventsHardReset();
    break;
}
```

- [ ] **Step 3: Удалить мёртвый код**

- Удалить `EVENTS_CACHE_TTL` из `events.js`
- Удалить `eventsResetCache()` если остался в `auth.js`
- Очистить `logout()` — вместо прямого доступа к `_eventsCache` вызвать `cacheInvalidateAll()`

- [ ] **Step 4: Коммит**

```bash
git add app/static/js/events.js app/static/js/sse.js app/static/js/auth.js
git commit -m "refactor: Мероприятия на едином кэше — Текущие полная загрузка, Завершённые пагинация"
```

---

## Task 4: Миграция Dashboard на единый кэш

**Files:**
- Modify: `app/static/js/dashboard.js` — убрать `_dashCache`, использовать `cacheGet`/`cacheSet`

**Interfaces:**
- Consumes: `cacheGet()`, `cacheSet()` из `cache.js`
- Produces: `renderDashboard()` читает из кэша

- [ ] **Step 1: Обновить `dashboard.js`**

Удалить `_dashCache` (строка 10). Заменить `_dashFetch()`:

```javascript
async function _dashFetch() {
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (!resp.ok) return;
        cacheSet('dashboard', await resp.json());
    } catch (e) {
        console.error('Dashboard fetch error:', e);
    }
}
```

Заменить `initDashboard()`:

```javascript
async function initDashboard() {
    setupDashboardClicks();
    if (cacheIsValid('dashboard')) {
        renderDashboard();
        _dashRefreshInBackground();
        return;
    }
    await _dashFetch();
    renderDashboard();
}
```

Заменить `renderDashboard()`:

```javascript
function renderDashboard() {
    const cached = cacheGet('dashboard');
    if (!cached?.data) return;
    const data = cached.data;
    // ... весь рендер из data ...
}
```

Заменить `refreshDashboard()`:

```javascript
async function refreshDashboard() {
    await _dashFetch();
    renderDashboard();
}
```

В `drawChart()` — заменить `_dashCache.chart_*` на `cacheGet('dashboard')?.data?.chart_*`.

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/dashboard.js
git commit -m "refactor: Dashboard на едином in-memory кэше"
```

---

## Task 5: Миграция Справочников и Календаря

**Files:**
- Modify: `app/static/js/sse.js` — `_refreshLocations/Organizers/Users` пишут в `cacheSet`
- Modify: `app/static/js/preloader.js` — пишет в `cacheSet`
- Modify: `app/static/js/calendar.js` — `_calEventsCache` → `cacheGet('calendar')`
- Modify: `app/static/js/utils.js` — удалить `store.allEvents`

**Interfaces:**
- Consumes: `cacheGet()`, `cacheSet()` из `cache.js`
- Produces: Справочники и календарь читают из единого кэша

- [ ] **Step 1: Обновить `sse.js` — справочники**

```javascript
async function _refreshLocations() {
    const resp = await fetch('/admin/api/locations', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const locs = await resp.json();
    cacheSet('locations', locs);
    // Обратная совместимость — store для фильтров
    store.allLocations = locs;
    if (currentPage === 'locations') renderLocations(locs);
    if (currentPage === 'dashboard') renderDashboard();
}

async function _refreshOrganizers() {
    const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const orgs = await resp.json();
    cacheSet('organizers', orgs);
    store.allOrganizers = orgs;
    if (currentPage === 'organizers') renderOrganizers(orgs);
    if (currentPage === 'dashboard') renderDashboard();
}

async function _refreshUsers() {
    const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const users = await resp.json();
    cacheSet('users', users);
    store.allUsers = users;
    if (currentPage === 'users') renderUsers(users);
}
```

Убрать `_saveRefCache()` и localStorage запись для `dash_cache`.

- [ ] **Step 2: Обновить `preloader.js`**

```javascript
function restoreFromCache() {
    const cached = localStorage.getItem('dash_cache');
    if (!cached) return false;
    try {
        const c = JSON.parse(cached);
        store.allLocations = c.locations || [];
        store.allOrganizers = c.organizers || [];
        cacheSet('locations', store.allLocations);
        cacheSet('organizers', store.allOrganizers);
        return store.allLocations.length > 0 || store.allOrganizers.length > 0;
    } catch (e) { return false; }
}

async function preloadAllData() {
    if (_preloaded) return;
    const resp = await fetch('/admin/api/preload', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const data = await resp.json();
    store.allLocations = data.locations || [];
    store.allOrganizers = data.organizers || [];
    cacheSet('locations', store.allLocations);
    cacheSet('organizers', store.allOrganizers);
    try {
        localStorage.setItem('dash_cache', JSON.stringify({
            locations: store.allLocations,
            organizers: store.allOrganizers,
        }));
    } catch (e) {}
    _preloaded = true;
}
```

- [ ] **Step 3: Обновить `calendar.js`**

Удалить `_calEventsCache` и `_calLoadingRange`. В `_calLoadRange()`:

```javascript
async function _calLoadRange(from, to) {
    const key = _calGetRangeKey(from, to);
    const cached = cacheGet('calendar');
    if (cached?.data?.ranges?.[key]) return cached.data.ranges[key];
    if (_calLoadingRange) return [];
    _calLoadingRange = true;
    // ... fetch loop ...
    _calLoadingRange = false;
    // Сохранить в кэш
    const existing = cacheGet('calendar')?.data?.ranges || {};
    cacheSet('calendar', { ranges: { ...existing, [key]: allEvents } });
    return allEvents;
}
```

В SSE handler для calendar — заменить `_calEventsCache = {}` на `cacheInvalidate('calendar')`.

- [ ] **Step 4: Удалить мёртвый код**

- Удалить `store.allEvents` из `utils.js`
- Удалить `_dashLocations` / `_dashOrganizers` из `dashboard.js` — заменить на `cacheGet('locations')` / `cacheGet('organizers')` в `locName()`/`orgName()`
- Удалить `_saveRefCache()` из `sse.js`
- Убрать localStorage запись `dash_cache` из `sse.js` (оставить в preloader для быстрого старта)

- [ ] **Step 5: Коммит**

```bash
git add app/static/js/sse.js app/static/js/preloader.js app/static/js/calendar.js app/static/js/utils.js app/static/js/dashboard.js
git commit -m "refactor: Справочники и календарь на едином кэше — удалить мёртвый код"
```

---

## Task 6: Очистка logout + финальный sweep старого кода

**Files:**
- Modify: `app/static/js/auth.js` — `logout()` вызывает `cacheInvalidateAll()`
- Modify: `app/static/js/navigation.js` — убрать Events board clear
- Modify: `app/static/js/vks-board.js` — удалить `_vksCacheGet`, `_vksCacheSet`
- Modify: `app/static/js/events.js` — удалить `_eventsCache`, `_eventsGetCache`, `_eventsIsCacheValid`, `_eventsWriteCache`, `_eventsInvalidateCache`, `EVENTS_CACHE_TTL`
- Modify: `app/static/js/dashboard.js` — удалить `_dashCache`, `_dashLocations`, `_dashOrganizers`
- Modify: `app/static/js/calendar.js` — удалить `_calEventsCache`, `_calLoadingRange`
- Modify: `app/static/js/sse.js` — удалить `_saveRefCache`, localStorage операции
- Modify: `app/static/js/utils.js` — удалить `store.allEvents`
- Modify: `app/static/js/preloader.js` — оставить localStorage только для быстрого старта справочников

**Interfaces:**
- Consumes: `cacheInvalidateAll()` из `cache.js`

### Полный список удаляемого кода

| Файл | Что удалить | Причина |
|------|-------------|---------|
| `vks-board.js` | `_vksCacheGet()`, `_vksCacheSet()` | Заменены на `cacheGet`/`cacheSet` |
| `events.js` | `_eventsCache` (строки 10-14) | Заменён на `_dataCache` |
| `events.js` | `_eventsGetCache()` | Заменён на `cacheGet()` |
| `events.js` | `_eventsIsCacheValid()` | Заменён на `cacheIsValid()` |
| `events.js` | `_eventsWriteCache()` | Заменён на `cacheSet()` |
| `events.js` | `_eventsInvalidateCache()` | Заменён на `cacheInvalidate()` |
| `events.js` | `EVENTS_CACHE_TTL` | Заменён на `CACHE_TTL` в cache.js |
| `dashboard.js` | `_dashCache` (строка 10) | Заменён на `cacheGet('dashboard')` |
| `dashboard.js` | `_dashLocations` (строка 4) | Заменён на `cacheGet('locations')` |
| `dashboard.js` | `_dashOrganizers` (строка 5) | Заменён на `cacheGet('organizers')` |
| `dashboard.js` | `locName()`, `orgName()` — переписать на чтение из кэша | |
| `calendar.js` | `_calEventsCache` (строка 32) | Заменён на `cacheGet('calendar')` |
| `calendar.js` | `_calLoadingRange` (строка 33) | Оставить как transient state |
| `sse.js` | `_saveRefCache()` (строки 217-224) | больше не нужно |
| `sse.js` | `localStorage.setItem('dash_cache', ...)` в SSE | оставить только в preloader |
| `sse.js` | `_vksCacheSet` вызовы | заменены на `cacheSet` |
| `utils.js` | `store.allEvents` (строка 75) | мёртвое поле |
| `auth.js` | прямой доступ к `_eventsCache` в `logout()` | заменён на `cacheInvalidateAll()` |
| `auth.js` | `localStorage.removeItem('vks_cache_*')` | больше нет localStorage для VKS |
| `navigation.js` | Events board innerHTML clear (строки 52-55) | `initEventsPage()` сам управляет через кэш |

- [ ] **Step 1: Обновить `logout()` в `auth.js`**

```javascript
async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, { method: 'POST' });
    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    window.currentUser = null;
    store.allUsers = [];
    store.allOrganizers = [];
    store.allLocations = [];
    const userEl = document.getElementById('topbar-user');
    if (userEl) userEl.style.display = 'none';
    document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
    if (typeof disconnectSSE === 'function') disconnectSSE();
    if (typeof calStopNowLineTimer === 'function') calStopNowLineTimer();
    if (typeof _preloaded !== 'undefined') _preloaded = false;
    localStorage.removeItem('dash_cache');
    cacheInvalidateAll();
    showLogin();
    window.history.replaceState(null, '', '/');
}
```

- [ ] **Step 2: Убрать Events board clear из `navigation.js`**

Убрать строки 52-55 (Events innerHTML clear). `initEventsPage()` сам управляет через кэш.

- [ ] **Step 3: Удалить мёртвый код из `vks-board.js`**

Удалить функции `_vksCacheGet()` и `_vksCacheSet()` (строки 48-64).

- [ ] **Step 4: Удалить мёртвый код из `events.js`**

Удалить:
- `_eventsCache` объявление (строки 10-14)
- `EVENTS_CACHE_TTL` (строка 14)
- `_eventsGetCache()` (строки 16-18)
- `_eventsIsCacheValid()` (строки 20-23)
- `_eventsWriteCache()` (строки 25-34)
- `_eventsInvalidateCache()` (строки 36-39)
- `eventsResetCache()` (если остался)

- [ ] **Step 5: Удалить мёртвый код из `dashboard.js`**

Удалить:
- `_dashCache` объявление (строка 10)
- `_dashLocations` объявление (строка 4)
- `_dashOrganizers` объявление (строка 5)

Переписать `locName()` и `orgName()`:

```javascript
function locName(id) {
    const locs = cacheGet('locations');
    const loc = locs?.items?.find(l => l.id === id);
    return loc?.name || '—';
}
function orgName(id) {
    const orgs = cacheGet('organizers');
    const org = orgs?.items?.find(o => o.id === id);
    return org?.short_name || org?.name || '—';
}
```

- [ ] **Step 6: Удалить мёртвый код из `calendar.js`**

Удалить `_calEventsCache` (строка 32). `_calLoadingRange` оставить — это transient state, не кэш.

- [ ] **Step 7: Удалить мёртвый код из `sse.js`**

Удалить:
- `_saveRefCache()` функцию (строки 217-224)
- Все `localStorage.setItem('dash_cache', ...)` вызовы в SSE handlers
- Все `_vksCacheSet` вызовы (заменены на `cacheSet`)

- [ ] **Step 8: Удалить `store.allEvents` из `utils.js`**

Удалить строку `allEvents: [],` из объявления `store`.

- [ ] **Step 9: Коммит**

```bash
git add app/static/js/auth.js app/static/js/navigation.js app/static/js/vks-board.js app/static/js/events.js app/static/js/dashboard.js app/static/js/calendar.js app/static/js/sse.js app/static/js/utils.js
git commit -m "refactor: удалить весь мёртвый код старой реализации кэширования"
```

---

## Итоговая схема

```
┌─────────────────────────────────────────────────────┐
│                   _dataCache                         │
│  vksActive │ vksCompleted │ eventsActive │ dashboard │
│  eventsCompleted │ locations │ organizers │ users │ cal│
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     cacheGet()   cacheSet()  cacheInvalidate()
          │            │            │
     ┌────┴────┐  ┌────┴────┐  ┌───┴────┐
     │ Страница │  │   SSE   │  │ Logout │
     │ render() │  │ fetch → │  │ clear  │
     │ из кэша  │  │ update  │  │ всё    │
     └─────────┘  └─────────┘  └────────┘
```

**Порядок реализации:** Task 1 → 2 → 3 → 4 → 5 → 6

**Каждая задача** производит рабочее ПО — можно деплоить после каждой.

## Итоговая сводка

| Страница | Загрузка | Фильтрация | SSE обновление |
|----------|----------|------------|----------------|
| VKS Текущие | Полная (limit=10000) | **Client-side** в кэше | Полный re-fetch → cacheSet → render |
| VKS Завершённые | Пагинация (limit=50) | **Server-side** запрос с фильтрами | Fetch до количества → cacheSet → render |
| Мероприятия Текущие | Полная (limit=10000) | **Client-side** в кэше | Полный re-fetch → cacheSet → render |
| Мероприятия Завершённые | Пагинация (limit=50) | **Server-side** запрос с фильтрами | Invalidate → re-fetch → cacheSet → render |
| Dashboard | Один endpoint | Нет фильтрации | Fetch → cacheSet → render |
| Календарь | Диапазон дат (±20 дней) | Client-side по дате | Invalidate кэша → re-fetch |
| Справочники | Полная загрузка | Нет фильтрации | Fetch → cacheSet → render |

### Что удаляется

- `_vksCacheGet()` / `_vksCacheSet()` (localStorage)
- `_eventsCache` / `_eventsGetCache()` / `_eventsIsCacheValid()` / `_eventsWriteCache()` / `_eventsInvalidateCache()`
- `EVENTS_CACHE_TTL`
- `_dashCache` / `_dashLocations` / `_dashOrganizers`
- `_calEventsCache` / `_calLoadingRange`
- `_saveRefCache()` + localStorage запись для `dash_cache` из SSE
- `store.allEvents`
- localStorage ключи `vks_cache_*`
- `eventsResetCache()`
