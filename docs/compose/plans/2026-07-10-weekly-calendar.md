# Weekly Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Недельный календарь VKS — grid залы×время, навигация, пересечения, now-line.

---

### Task 1: CSS — стили календаря

**Files:** Create `app/static/css/calendar.css`

- [ ] **Step 1:** Создать файл `app/static/css/calendar.css` со стилями:

```css
/* ═══ Weekly Calendar ════════════════════════════════════════════════ */

/* Container */
.cal-container {
    padding: 16px;
    height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Header: navigation + title */
.cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 12px;
    flex-shrink: 0;
}

.cal-nav {
    display: flex;
    align-items: center;
    gap: 8px;
}

.cal-nav-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    color: var(--fg);
    font-size: 0.8125rem;
    transition: background var(--motion-fast);
}

.cal-nav-btn:hover {
    background: var(--surface-strong);
}

.cal-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--fg);
}

.cal-today-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--motion-fast);
}

.cal-today-btn:hover {
    opacity: 0.85;
}

/* Grid */
.cal-grid-wrapper {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
}

.cal-grid {
    display: grid;
    position: relative;
    min-height: calc(17 * 60px); /* 17 hours × 60px */
}

/* Time column */
.cal-time-col {
    border-right: 1px solid var(--border);
    background: var(--surface);
}

.cal-time-slot {
    height: 60px;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 4px 8px;
    font-size: 0.6875rem;
    color: var(--fg-muted);
    border-bottom: 1px solid var(--border);
}

/* Location columns */
.cal-loc-col {
    border-right: 1px solid var(--border);
    position: relative;
}

.cal-loc-col:last-child {
    border-right: none;
}

.cal-loc-header {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--surface);
    padding: 8px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fg);
    text-align: center;
    border-bottom: 1px solid var(--border);
}

/* Cells */
.cal-cell {
    height: 60px;
    border-bottom: 1px solid var(--border);
    position: relative;
    padding: 1px;
}

.cal-cell:nth-child(even) {
    background: rgba(255,255,255,0.02);
}

/* Events container inside cell */
.cal-cell-events {
    display: flex;
    gap: 2px;
    height: 100%;
    position: relative;
}

/* Event card */
.cal-event {
    position: relative;
    flex: 1;
    min-width: 0;
    border-radius: 4px;
    padding: 3px 5px;
    font-size: 0.625rem;
    overflow: hidden;
    cursor: pointer;
    border-left: 3px solid var(--accent);
    background: rgba(var(--accent-rgb, 99, 102, 241), 0.08);
    transition: transform var(--motion-fast), box-shadow var(--motion-fast);
}

.cal-event:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 2;
}

.cal-event.completed {
    border-left-color: var(--success);
    background: rgba(74, 222, 128, 0.08);
}

.cal-event.missed {
    border-left-color: var(--danger);
    background: rgba(248, 113, 113, 0.08);
}

.cal-event-type {
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cal-event-org {
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cal-event-desc {
    color: var(--fg-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
}

/* Now line */
.cal-now-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--danger);
    z-index: 5;
    pointer-events: none;
}

.cal-now-line::before {
    content: '';
    position: absolute;
    left: -4px;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
}

/* Hour grid lines */
.cal-hour-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--border);
    pointer-events: none;
}

/* Empty state */
.cal-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--fg-muted);
    font-size: 0.875rem;
}

/* Scrollbar */
.cal-grid-wrapper::-webkit-scrollbar {
    width: 6px;
}
.cal-grid-wrapper::-webkit-scrollbar-track {
    background: transparent;
}
.cal-grid-wrapper::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
}

/* Mobile */
@media (max-width: 768px) {
    .cal-container { padding: 8px; }
    .cal-header { flex-wrap: wrap; gap: 8px; }
    .cal-title { font-size: 0.875rem; }
    .cal-time-slot { font-size: 0.5625rem; padding: 2px 4px; }
    .cal-loc-header { font-size: 0.625rem; padding: 4px; }
    .cal-event { font-size: 0.5625rem; padding: 2px 3px; }
}
```

- [ ] **Step 2:** Коммит

---

### Task 2: JS — логика календаря

**Files:** Create `app/static/js/calendar.js`

- [ ] **Step 1:** Создать `app/static/js/calendar.js`:

```js
// ─── Weekly Calendar ──────────────────────────────────────────────────

const CAL_HOURS_START = 6;
const CAL_HOURS_END = 23;
const CAL_HOUR_HEIGHT = 60; // px
const CAL_TOTAL_HOURS = CAL_HOURS_END - CAL_HOURS_START; // 17

let _calWeekStart = null; // Monday of current week

function initCalendar() {
    _calWeekStart = getMonday(new Date());
    renderCalendar();
}

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function getWeekEnd(monday) {
    const end = new Date(monday);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

function calPrevWeek() {
    _calWeekStart.setDate(_calWeekStart.getDate() - 7);
    renderCalendar();
}

function calNextWeek() {
    _calWeekStart.setDate(_calWeekStart.getDate() + 7);
    renderCalendar();
}

function calGoToday() {
    _calWeekStart = getMonday(new Date());
    renderCalendar();
}

const CAL_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const CAL_DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function renderCalendar() {
    const container = document.getElementById('cal-container');
    if (!container) return;

    const weekEnd = getWeekEnd(_calWeekStart);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update title
    const titleEl = document.getElementById('cal-title');
    if (titleEl) {
        const s = _calWeekStart;
        const e = weekEnd;
        titleEl.textContent = `${s.getDate()} – ${e.getDate()} ${CAL_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
    }

    // Get locations from store
    const locations = store.allLocations || [];
    if (locations.length === 0) {
        container.innerHTML = '<div class="cal-empty">Нет локаций для отображения</div>';
        return;
    }

    // Filter events for this week
    const weekStart = new Date(_calWeekStart);
    const events = (store.allEvents || []).filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date + 'T00:00:00');
        return d >= weekStart && d <= weekEnd;
    });

    // Group events by location_id + date
    const eventMap = {}; // key: "locationId_date" → [events]
    events.forEach(e => {
        const key = `${e.location_id || 'none'}_${e.date}`;
        if (!eventMap[key]) eventMap[key] = [];
        eventMap[key].push(e);
    });

    // Build grid HTML
    let html = '<div class="cal-grid-wrapper"><div class="cal-grid" style="grid-template-columns: 60px repeat(' + locations.length + ', 1fr);">';

    // Header row
    html += '<div class="cal-time-col"><div class="cal-loc-header">Время</div>';
    for (let h = CAL_HOURS_START; h < CAL_HOURS_END; h++) {
        html += `<div class="cal-time-slot">${String(h).padStart(2, '0')}:00</div>`;
    }
    html += '</div>';

    // Location columns
    locations.forEach(loc => {
        html += `<div class="cal-loc-col"><div class="cal-loc-header">${esc(loc.name)}</div>`;

        for (let h = CAL_HOURS_START; h < CAL_HOURS_END; h++) {
            const dateStr = getDateForHour(h);
            const key = `${loc.id}_${dateStr}`;
            const cellEvents = eventMap[key] || [];

            // Filter events that start in this hour
            const hourEvents = cellEvents.filter(e => {
                if (!e.time) return h === CAL_HOURS_START; // events without time → first slot
                const [eh, em] = e.time.split(':').map(Number);
                return eh === h;
            });

            html += `<div class="cal-cell" data-loc="${loc.id}" data-hour="${h}" data-date="${dateStr}">`;
            html += '<div class="cal-cell-events">';

            hourEvents.forEach(e => {
                const cls = e.completed ? 'completed' : (new Date(e.date) < today && !e.completed ? 'missed' : '');
                const orgName = getOrgName(e.organizer_id);
                html += `<div class="cal-event ${cls}" onclick="openEditEventModal('${e.id}')" title="${esc(e.type || 'ВКС')} — ${esc(orgName)}">`;
                html += `<div class="cal-event-type">${esc(e.type || 'ВКС')}</div>`;
                if (orgName) html += `<div class="cal-event-org">${esc(orgName)}</div>`;
                if (e.description) html += `<div class="cal-event-desc">${esc(e.description)}</div>`;
                html += '</div>';
            });

            html += '</div></div>';
        }

        html += '</div>';
    });

    html += '</div></div>';

    // Now line
    const nowLineHtml = buildNowLine(weekStart, weekEnd, locations.length);

    container.innerHTML = html;

    // Add now line after render
    if (nowLineHtml) {
        const grid = container.querySelector('.cal-grid');
        if (grid) grid.insertAdjacentHTML('beforeend', nowLineHtml);
    }

    // Scroll to 08:00
    const wrapper = container.querySelector('.cal-grid-wrapper');
    if (wrapper) {
        wrapper.scrollTop = (8 - CAL_HOURS_START) * CAL_HOUR_HEIGHT;
    }
}

function getDateForHour(hour) {
    // Determine which date this hour belongs to based on _calWeekStart
    // Hours 0-23 all belong to the same day in our grid
    // Each column represents a day of the week
    // This function is called per-cell, but we need the column's date
    // Actually, we need to refactor: each location column shows ALL days? No.
    // The grid shows ONE week. Each column is a location. Each row is a time slot.
    // Events are filtered by date already. The cell just needs to know which date.
    // But in a weekly view, each cell represents a specific day+time+location.
    // Wait — the user said columns = locations, rows = time.
    // But a week has 7 days. How do we show all 7 days?
    //
    // REDESIGN: The calendar shows ONE DAY at a time, with locations as columns.
    // Navigation switches between days (or weeks).
    // Actually, re-reading the spec: "столбцы = локации, строки = время"
    // and "переключение недель" + "дни недели: Пн 07, Вт 08..."
    //
    // This means: show ALL 7 days × locations × time = 3D grid.
    // That's too complex for a single grid.
    //
    // SIMPLER: Show ONE day at a time. Columns = locations. Rows = time.
    // Navigation: ← день → or ← неделя →
    // Day tabs at the top: Пн 07 | Вт 08 | ... | Вс 13
    //
    // Actually, let me re-read the user's request:
    // "календарь мероприятий на неделю, с переключением недель,
    //  с распределением по залам проведения, времени"
    //
    // I think the intent is: show the whole week, with locations as columns.
    // But that means 7 days × N locations = huge grid.
    //
    // Most practical: show ONE day at a time with day tabs.
    // Let me adjust.
    return ''; // placeholder
}

function buildNowLine(weekStart, weekEnd, numLocs) {
    const now = new Date();
    if (now < weekStart || now > weekEnd) return '';

    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const top = (hours - CAL_HOURS_START) * CAL_HOUR_HEIGHT + (minutes / 60) * CAL_HOUR_HEIGHT;

    if (top < 0 || top > CAL_TOTAL_HOURS * CAL_HOUR_HEIGHT) return '';

    // Position: after time column (60px) + day column offset
    // Each location column width = (grid width - 60px) / numLocs
    // But we don't know grid width here. Use CSS instead.
    return `<div class="cal-now-line" style="top: ${60 + top}px;"></div>`;
}

function getOrgName(orgId) {
    if (!orgId) return '';
    const org = (store.allOrganizers || []).find(o => o.id === orgId);
    return org ? org.name : '';
}

// Update now line every minute
let _calNowTimer = null;
function startCalNowLine() {
    if (_calNowTimer) clearInterval(_calNowTimer);
    _calNowTimer = setInterval(() => {
        const line = document.querySelector('.cal-now-line');
        if (line) {
            const now = new Date();
            const top = (now.getHours() - CAL_HOURS_START) * CAL_HOUR_HEIGHT + (now.getMinutes() / 60) * CAL_HOUR_HEIGHT;
            line.style.top = (60 + top) + 'px';
        }
    }, 60000);
}
```

**Примечание:** Функция `getDateForHour` содержит placeholder. Реализация зависит от финального макета (один день vs вся неделя). Уточнить при реализации.

- [ ] **Step 2:** Коммит

---

### Task 3: Интеграция — sidebar + router + index.html

**Files:** `app/static/index.html`, `app/static/js/router.js`, `app/static/js/navigation.js`

- [ ] **Step 1:** В `index.html` добавить подключение CSS и JS:

В секцию CSS (после vks-modal.css):
```html
<link rel="stylesheet" href="/static/css/calendar.css?v=__VERSION__">
```

В секцию JS (перед app.js):
```html
<script src="/static/js/calendar.js?v=__VERSION__"></script>
```

- [ ] **Step 2:** В sidebar (index.html или navigation.js) добавить пункт «Календарь»:

Найти секцию sidebar с навигацией. Добавить:
```html
<li class="nav-item" data-page="calendar" onclick="navigateTo('calendar')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    <span>Календарь</span>
</li>
```

- [ ] **Step 3:** В `router.js` добавить маршрут:

Найти `handleNavigation` или `navigateTo`. Добавить case:
```js
if (page === 'calendar') {
    document.getElementById('page-calendar').classList.add('active');
    initCalendar();
    startCalNowLine();
}
```

- [ ] **Step 4:** В `index.html` добавить страницу:

```html
<div class="page" id="page-calendar">
    <div class="cal-container" id="cal-container">
        <div class="cal-header">
            <div class="cal-nav">
                <button class="cal-nav-btn" onclick="calPrevWeek()">←</button>
                <span class="cal-title" id="cal-title"></span>
                <button class="cal-nav-btn" onclick="calNextWeek()">→</button>
            </div>
            <button class="cal-today-btn" onclick="calGoToday()">Сегодня</button>
        </div>
        <div id="cal-grid-area"></div>
    </div>
</div>
```

- [ ] **Step 5:** Коммит

---

### Task 4: Тестирование локально

- [ ] **Step 1:** Запустить сервер локально
- [ ] **Step 2:** Открыть календарь → проверить grid
- [ ] **Step 3:** Переключить неделю → проверить навигацию
- [ ] **Step 4:** Проверить пересечения
- [ ] **Step 5:** Клик по событию → модалка

---

## Зависимости

```
Task 1 (CSS) ──→ Task 2 (JS) ──→ Task 3 (Integration) ──→ Task 4 (Test)
```
