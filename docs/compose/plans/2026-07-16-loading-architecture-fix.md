# Исправление архитектуры загрузки данных — План

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить клиентскую загрузку `store.allEvents` на серверную пагинацию + фильтрацию, починить dashboard, stats, infinite scroll.

**Architecture:** Backend: добавить `exclude_type` в `get_events()` для исключения ВКС из Мероприятий. Frontend: каждая страница сама запрашивает нужный срез через `/admin/api/events` с серверными фильтрами. Preloader грузит ТОЛЬКО справочники. Dashboard использует агрегатный endpoint `/api/dashboard`.

**Tech Stack:** Python aiohttp (backend), Vanilla JS (frontend), PostgreSQL cursor pagination

## Global Constraints

- Все коммиты на русском языке
- Версионирование: инкрементировать второе значение (не patch)
- `loguru.logger` для логирования backend
- Frontend: vanilla JS, без фреймворков

---

## File Structure

| Файл | Изменение | Ответственность |
|------|-----------|-----------------|
| `database/requests.py` | Добавить `exclude_type` параметр в `get_events()` | Backend фильтрация |
| `app/static/js/vks-filters.js` | Убрать `loadAllEvents()`, `_LOAD_ALL_LIMIT`; stats параллельно | Удаление костыля |
| `app/static/js/dashboard.js` | `initDashboard()` → fetch `/api/dashboard` | Dashboard через агрегаты |
| `app/static/js/events.js` | Серверный `exclude_type=ВКС`, убрать клиентский фильтр | Серверная фильтрация |
| `app/static/js/navigation.js` | Очистка доски при переключении страниц | Fix stale data |
| `app/static/js/vks-board.js` | Убрать дубль `getOrganizerName`/`getLocationName` | Чистка |

---

### Task 1: Backend — добавить `exclude_type` в `get_events()`

**Covers:** Проблема 2 (Мероприятия от 13 июля)

**Files:**
- Modify: `database/requests.py:96-108` — добавить параметр `exclude_type`
- Modify: `database/requests.py:120-142` — добавить WHERE фильтр
- Modify: `app/routes/vks.py:46-58` — передать `exclude_type` из query params

**Interfaces:**
- Consumes: `exclude_type: str = None` — тип события для исключения
- Produces: `get_events()` исключает события указанного типа

- [ ] **Step 1: Добавить `exclude_type` в сигнатуру `get_events()`**

В `database/requests.py` строка 96-108, добавить параметр:

```python
async def get_events(
    completed: bool = None,
    event_type: str = None,
    exclude_type: str = None,       # ← НОВЫЙ ПАРАМЕТР
    participant_id: str = None,
    location_id: str = None,
    organizer_id: str = None,
    date_from: date = None,
    date_to: date = None,
    search: str = None,
    cursor_date: date = None,
    cursor_time: time = None,
    cursor_id: str = None,
    limit: int = 50,
):
```

- [ ] **Step 2: Добавить WHERE фильтр для `exclude_type`**

В `database/requests.py` после строки 127 (`if event_type:`) добавить:

```python
        if event_type:
            query = query.where(Event.type == event_type)
        if exclude_type:
            query = query.where(Event.type != exclude_type)
```

- [ ] **Step 3: Передать `exclude_type` из query params в handler**

В `app/routes/vks.py` строка 46-58, добавить передачу параметра:

```python
        events, has_more = await get_events(
            completed=completed,
            event_type=request.query.get('type', '').strip() or None,
            exclude_type=request.query.get('exclude_type', '').strip() or None,  # ← НОВОЕ
            participant_id=request.query.get('participant_id', '').strip() or None,
            # ... остальные параметры без изменений
        )
```

- [ ] **Step 4: Коммит**

```bash
git add database/requests.py app/routes/vks.py
git commit -m "feat: добавить exclude_type параметр в get_events() для исключения типов"
```

---

### Task 2: Убрать `loadAllEvents()` и `_LOAD_ALL_LIMIT` из vks-filters.js

**Covers:** Проблема 4 (костыль 10000), Проблема 1 (stats)

**Files:**
- Modify: `app/static/js/vks-filters.js:3` — удалить `_LOAD_ALL_LIMIT`
- Modify: `app/static/js/vks-filters.js:48-61` — удалить `ensureOrgsAndLocs()`
- Modify: `app/static/js/vks-filters.js:63-69` — удалить `loadAllEvents()`
- Modify: `app/static/js/vks-filters.js:71-78` — `loadVksActive()` без `loadAllEvents()`
- Modify: `app/static/js/vks-filters.js:212-219` — `loadVksCompleted()` без `loadAllEvents()`

**Interfaces:**
- Consumes: `store.allOrganizers`, `store.allLocations` (из preloader)
- Produces: `updateVksStats()` вызывается параллельно с `renderVksBoard()`

- [ ] **Step 1: Удалить `_LOAD_ALL_LIMIT`**

Удалить строку 3:

```js
// УДАЛИТЬ:
const _LOAD_ALL_LIMIT = 10000; // fallback для calendar/dashboard
```

- [ ] **Step 2: Удалить `ensureOrgsAndLocs()`**

Удалить строки 48-61:

```js
// УДАЛИТЬ:
async function ensureOrgsAndLocs() {
    if (!store.allOrganizers || !store.allOrganizers.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/organizers`, { credentials: 'same-origin' });
            if (resp.ok) store.allOrganizers = await resp.json();
        } catch (e) { store.allOrganizers = []; }
    }
    if (!store.allLocations || !store.allLocations.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/locations`, { credentials: 'same-origin' });
            if (resp.ok) store.allLocations = await resp.json();
        } catch (e) { store.allLocations = []; }
    }
}
```

- [ ] **Step 3: Удалить `loadAllEvents()`**

Удалить строки 63-69:

```js
// УДАЛИТЬ:
async function loadAllEvents() {
    await ensureOrgsAndLocs();
    const resp = await fetch(`${BASE_URL}/admin/api/events?limit=${_LOAD_ALL_LIMIT}`);
    if (resp.status === 401) { showLogin(); return; }
    const json = await resp.json();
    store.allEvents = Array.isArray(json) ? json : (json.events || []);
}
```

- [ ] **Step 4: Исправить `loadVksActive()`**

Заменить строки 71-78:

```js
// БЫЛО:
async function loadVksActive() {
    if (!store.allEvents.length) {
        await loadAllEvents();
    }
    populateDateSelects('f-vks-active');
    populateVksFilters();
    const board = document.getElementById('vks-board-active');
    if (board) renderVksBoard('vks-board-active', 'active');
}

// СТАЛО:
async function loadVksActive() {
    populateDateSelects('f-vks-active');
    populateVksFilters();
    updateVksStats();
    const board = document.getElementById('vks-board-active');
    if (board) renderVksBoard('vks-board-active', 'active');
}
```

- [ ] **Step 5: Исправить `loadVksCompleted()`**

Заменить строки 212-219:

```js
// БЫЛО:
async function loadVksCompleted() {
    if (!store.allEvents.length) {
        await loadAllEvents();
    }
    populateDateSelects('f-vks-completed');
    populateVksFilters();
    const board = document.getElementById('vks-board-completed');
    if (board) renderVksBoard('vks-board-completed', 'completed');
}

// СТАЛО:
async function loadVksCompleted() {
    populateDateSelects('f-vks-completed');
    populateVksFilters();
    updateVksStats();
    const board = document.getElementById('vks-board-completed');
    if (board) renderVksBoard('vks-board-completed', 'completed');
}
```

- [ ] **Step 6: Коммит**

```bash
git add app/static/js/vks-filters.js
git commit -m "refactor: убрать loadAllEvents() и _LOAD_ALL_LIMIT, stats параллельно с загрузкой"
```

---

### Task 3: Dashboard через `/api/dashboard` вместо `_dashEvents`

**Covers:** Проблема 3 (dashboard не работает)

**Files:**
- Modify: `app/static/js/dashboard.js:1-16` — переменные + `initDashboard()`
- Modify: `app/static/js/dashboard.js:34-70` — удалить `loadFullData()`
- Modify: `app/static/js/dashboard.js:109-178` — `renderDashboard()`, `renderToday()`, `renderSoon()`
- Modify: `app/static/js/dashboard.js:484-551` — `dashCompleteEvent()`

**Interfaces:**
- Consumes: `GET /api/dashboard` → `{ total, completed, active, missed, today: [...], soon: [...] }`
- Produces: `renderDashboard()` рендерит из полученных данных

- [ ] **Step 1: Добавить переменные состояния**

Добавить после строки 8 (`let _dashYear = ...`):

```js
let _dashTotal = 0;
let _dashActive = 0;
let _dashCompleted = 0;
let _dashMissed = 0;
let _dashTodayEvents = [];
let _dashSoonEvents = [];
```

- [ ] **Step 2: Переписать `initDashboard()`**

```js
// БЫЛО (строки 10-16):
function initDashboard() {
    renderDashboard();
    setupDashboardClicks();
    preloadAllData().then(() => renderDashboard());
}

// СТАЛО:
async function initDashboard() {
    setupDashboardClicks();
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(resp.status);
        const data = await resp.json();
        _dashTotal = data.total || 0;
        _dashActive = data.active || 0;
        _dashCompleted = data.completed || 0;
        _dashMissed = data.missed || 0;
        _dashTodayEvents = data.today || [];
        _dashSoonEvents = data.soon || [];
    } catch (e) {
        console.error('Dashboard load error:', e);
        _dashTotal = 0; _dashActive = 0; _dashCompleted = 0; _dashMissed = 0;
        _dashTodayEvents = []; _dashSoonEvents = [];
    }
    renderDashboard();
}
```

- [ ] **Step 3: Переписать `renderDashboard()`**

```js
// БЫЛО (строки 109-128):
function renderDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const total = _dashEvents.length;
    const completed = _dashEvents.filter(e => e.completed).length;
    const active = _dashEvents.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) >= today).length;
    const missed = _dashEvents.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) < today).length;
    document.getElementById('dash-total').textContent = total;
    document.getElementById('dash-active').textContent = active;
    document.getElementById('dash-completed').textContent = completed;
    document.getElementById('dash-missed').textContent = missed;
    renderToday();
    renderSoon();
    renderDashLocations();
    drawChart();
    setupChartToggle();
}

// СТАЛО:
function renderDashboard() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dash-total', _dashTotal);
    set('dash-active', _dashActive);
    set('dash-completed', _dashCompleted);
    set('dash-missed', _dashMissed);
    renderTodayFromData(_dashTodayEvents);
    renderSoonFromData(_dashSoonEvents);
    renderDashLocations();
    drawChart();
    setupChartToggle();
}
```

- [ ] **Step 4: Удалить `renderToday()` и `renderSoon()`**

Удалить строки 130-178. Функции `renderTodayFromData()` и `renderSoonFromData()` уже существуют (строки 72-103) и используются в новом `renderDashboard()`.

- [ ] **Step 5: Удалить `loadFullData()`**

Удалить строки 34-70:

```js
// УДАЛИТЬ:
async function loadFullData() { ... }
```

- [ ] **Step 6: Исправить `dashCompleteEvent()`**

```js
// БЫЛО (строки 530-551):
async function dashCompleteEvent(id, checked) {
    // ...
    if (data.ok) {
        await loadAllEvents();
        _dashEvents = [...store.allEvents];
        try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, ... })); } catch(e) {}
        renderDashboard();
        showToast(checked ? 'ВКС завершено' : 'ВКС восстановлено', 'success');
    }
}

// СТАЛО:
async function dashCompleteEvent(id, checked) {
    // ... (начало без изменений)
    if (data.ok) {
        await initDashboard();
        showToast(checked ? 'ВКС завершено' : 'ВКС восстановлено', 'success');
    }
}
```

- [ ] **Step 7: `renderDashLocations()` и `drawChart()` — загружать события отдельно**

Эти функции используют `_dashEvents` для подсчёта по локациям и графика. Загружать события при вызове:

```js
function renderDashLocations() {
    fetch('/admin/api/events?limit=500', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(data => {
            _dashEvents = data.events || [];
            // ... существующая логика рендера (строки 225-267)
        });
}

function drawChart() {
    fetch('/admin/api/events?limit=500', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(data => {
            _dashEvents = data.events || [];
            // ... существующая логика графика (строки 382-481)
        });
}
```

- [ ] **Step 8: Коммит**

```bash
git add app/static/js/dashboard.js
git commit -m "refactor: dashboard через /api/dashboard endpoint, убрать _dashEvents"
```

---

### Task 4: Серверный `exclude_type` для Мероприятий

**Covers:** Проблема 2 (Мероприятия от 13 июля) — frontend часть

**Files:**
- Modify: `app/static/js/events.js:57` — добавить `exclude_type=ВКС` в params
- Modify: `app/static/js/events.js:95` — убрать клиентский фильтр `e.type !== 'ВКС'`

**Interfaces:**
- Consumes: `GET /admin/api/events?status=active&exclude_type=ВКС` (Task 1)
- Produces: `eventsRenderBoard()` рендерит без клиентской фильтрации типов

- [ ] **Step 1: Добавить `exclude_type` в `_eventsLoadMore()`**

В `app/static/js/events.js` строка 57, добавить параметр:

```js
// БЫЛО:
const params = new URLSearchParams({ status: _eventsCompleted ? 'completed' : 'active', limit: EVENTS_PAGE_SIZE });

// СТАЛО:
const params = new URLSearchParams({
    status: _eventsCompleted ? 'completed' : 'active',
    limit: EVENTS_PAGE_SIZE,
    exclude_type: 'ВКС',
});
```

- [ ] **Step 2: Убрать клиентский фильтр `e.type !== 'ВКС'`**

В `app/static/js/events.js` строка 95:

```js
// БЫЛО:
p.events.push(...(data.events || []).filter(e => e.type !== 'ВКС'));

// СТАЛО:
p.events.push(...(data.events || []));
```

- [ ] **Step 3: Коммит**

```bash
git add app/static/js/events.js
git commit -m "fix: серверный exclude_type=ВКС для страницы Мероприятий"
```

---

### Task 5: Очистка доски при переключении страниц

**Covers:** Проблема 6 (старые данные при переходе)

**Files:**
- Modify: `app/static/js/navigation.js:44-48` — очистка доски перед показом

**Interfaces:**
- Consumes: `switchPage(page)` вызывается при навигации
- Produces: доска очищается до показа новой страницы

- [ ] **Step 1: Очистить доски при переключении**

В `switchPage()` после строки 48 (`if (pageEl) pageEl.classList.add('active');`) добавить:

```js
// Очистить доски при переключении — убрать старые данные
if (page === 'vks-active') {
    const board = document.getElementById('vks-board-active');
    if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
}
if (page === 'vks-completed') {
    const board = document.getElementById('vks-board-completed');
    if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
}
if (page === 'events-active' || page === 'events-completed') {
    const board = document.getElementById('events-board');
    if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
}
```

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/navigation.js
git commit -m "fix: очистка доски при переключении страниц — убрать flash старых данных"
```

---

### Task 6: Убрать дубль `getOrganizerName`/`getLocationName` из vks-board.js

**Covers:** Чистка кода

**Files:**
- Modify: `app/static/js/vks-board.js:259-267` — удалить дублирующие функции

**Interfaces:**
- Consumes: `getOrganizerName()`, `getLocationName()` из `utils.js`
- Produces: нет (удаление)

- [ ] **Step 1: Удалить дубли**

Удалить строки 259-267:

```js
// УДАЛИТЬ:
function getOrganizerName(id) {
    const o = (store.allOrganizers || []).find(x => x.id === id);
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (store.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}
```

Эти функции уже определены в `utils.js` (строки 15-23).

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/vks-board.js
git commit -m "refactor: убрать дубль getOrganizerName/getLocationName из vks-board.js"
```

---

### Task 7: Деплой и тестирование

**Covers:** Все проблемы

**Files:**
- Нет изменений кода

- [ ] **Step 1: Обновить версию**

В `app/static/index.html` обновить `__VERSION__`.

- [ ] **Step 2: Коммит**

```bash
git add -A
git commit -m "release: v1.1.46 — исправление архитектуры загрузки данных"
```

- [ ] **Step 3: Деплой на test**

```bash
python deploy/deploy.py test
```

- [ ] **Step 4: Тестирование**

Проверить:
1. VKS Active — счётчики показывают числа (не 0), infinite scroll работает 2+ раза
2. VKS Completed — аналогично
3. Мероприятия — загружаются все типы (не только от 13 июля), scroll работает
4. Dashboard — показывает числа и списки сегодня/скоро
5. Переход VKS → Мероприятия → VKS — нет flash старых данных
6. SSE — обновление при изменении события

- [ ] **Step 5: Если всё работает — коммит в develop**

```bash
git push origin develop
```
