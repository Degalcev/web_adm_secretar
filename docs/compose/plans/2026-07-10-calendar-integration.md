# Calendar Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Интегрировать календарь VKS из мокапа в основной проект.

**Architecture:** Новые файлы `calendar.css` и `calendar.js`, интеграция через существующие точки: router, navigation, index.html sidebar + page div.

**Tech Stack:** CSS (flexbox, absolute positioning), Vanilla JS, store.allEvents.

## Global Constraints

- CSS порядок: responsive.css → vks-modal.css → calendar.css
- JS порядок: ... → updater.js → calendar.js → app.js
- Sidebar навигация через `data-page` + `data-href`
- Роутинг через `ROUTES` объект в router.js
- Данные из `store.allEvents` (preload/SSE)
- Доступные CSS переменные из base.css

---

### Task 1: CSS — calendar.css

**Files:** Create `app/static/css/calendar.css`

- [ ] **Step 1:** Создать `app/static/css/calendar.css` — извлечь все календарные стили из мокапа `docs/calendar-mockups.html`. Стили включают:
  - `.cal-container` — flex column, full height
  - `.cal-header` — navigation (←/→, title, Сегодня)
  - `.day-tabs` — horizontal day selector
  - `.cal` — flex container (time col + location cols)
  - `.cal-time`, `.cal-col`, `.cal-col-hdr` — grid structure
  - `.cal-ev` — event cards (absolute positioned, 20% opacity colors)
  - `.cal-ev.split` — compact mode for overlaps
  - `.cal-ev:hover` — expand to show full info
  - `.now-line`, `.now-time` — current time indicator
  - `.hour-line` — grid lines
  - `.ev-status`, `.ev-badge` — status dots and doc/link badges
  - Mobile responsive `@media (max-width: 768px)`
  - Использовать CSS переменные проекта: `--bg`, `--surface`, `--border`, `--fg`, `--accent`, `--success`, `--warning`, `--danger`, `--radius-sm`, `--motion-fast`, `--ease-standard`

- [ ] **Step 2:** Коммит

---

### Task 2: JS — calendar.js

**Files:** Create `app/static/js/calendar.js`

- [ ] **Step 1:** Создать `app/static/js/calendar.js` — извлечь JS из мокапа, адаптировать к проекту:

**Ключевые функции:**
- `initCalendar()` — инициализация, вызывается из switchPage
- `renderCalendar()` — рендер grid (time col + location cols + events)
- `renderDayTabs()` — вкладки дней недели
- `calPrevWeek()` / `calNextWeek()` / `calGoToday()` — навигация
- `calSelectDay(idx)` — выбор дня
- `findOverlapGroups(events)` — группировка пересечений
- `updateNowLine()` — обновление now-line (отдельно от renderCalendar)
- `calSetTheme(id)` — переключение темы

**Адаптация к проекту:**
- Использовать `store.allEvents` вместо захардкоженных данных
- Использовать `store.allLocations` для столбцов
- Использовать `store.allOrganizers` для имён организаторов
- Использовать `getCsrfToken()` для fetch запросов
- Использовать `esc()` для XSS-защиты
- Использовать `openEditEventModal()` при клике на событие
- Данные фильтровать по неделе: `e.date >= weekStart && e.date <= weekEnd`

**Обновление now-line:**
- `setInterval(updateNowLine, 60000)` — только now-line, без полного re-render
- `updateNowLine()` измеряет `.cal-col-hdr.offsetHeight` вместо magic +40

- [ ] **Step 2:** Коммит

---

### Task 3: Интеграция — index.html + router.js + navigation.js

**Files:** `app/static/index.html`, `app/static/js/router.js`, `app/static/js/navigation.js`

- [ ] **Step 1:** В `index.html` добавить CSS (после vks-modal.css, строка 24):
```html
<link rel="stylesheet" href="/static/css/calendar.css?v=__VERSION__">
```

- [ ] **Step 2:** В `index.html` добавить JS (перед app.js, после updater.js):
```html
<script src="/static/js/calendar.js?v=__VERSION__"></script>
```

- [ ] **Step 3:** В `index.html` добавить sidebar nav item. Найти группу "ВКС" или добавить новую группу "Инструменты":
```html
<a class="nav-item" data-page="calendar" data-href="/calendar/">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    Календарь
</a>
```

- [ ] **Step 4:** В `index.html` добавить page div (перед закрывающим `</main>`):
```html
<!-- ─── Calendar ─────────────────────────────────────────────── -->
<div class="page" id="page-calendar">
    <div class="page-header">
        <h2>Календарь мероприятий</h2>
    </div>
    <div class="cal-container" id="cal-container"></div>
</div>
```

- [ ] **Step 5:** В `router.js` добавить route в `ROUTES` (после существующих записей):
```javascript
'/calendar/': { page: 'calendar', title: 'Календарь' },
```

- [ ] **Step 6:** В `navigation.js` в функции `switchPage()` добавить (после существующих if-блоков, примерно строка 68):
```javascript
if (page === 'calendar') initCalendar();
```

- [ ] **Step 7:** Коммит

---

### Task 4: Тестирование

- [ ] **Step 1:** Запустить сервер, открыть `/admin/calendar/`
- [ ] **Step 2:** Проверить отображение grid с событиями из store
- [ ] **Step 3:** Проверить навигацию по неделям (←/→/Сегодня)
- [ ] **Step 4:** Проверить вкладки дней
- [ ] **Step 5:** Проверить пересечения — события side by side
- [ ] **Step 6:** Проверить hover expand на карточках
- [ ] **Step 7:** Проверить now-line (отображается на сегодняшнем дне)
- [ ] **Step 8:** Проверить клик по событию → открывается VKS modal
- [ ] **Step 9:** Проверить мобильную версию (<768px)
- [ ] **Step 10:** Проверить переключение тем

---

## Зависимости

```
Task 1 (CSS) ──→ Task 3 (Integration) ──→ Task 4 (Test)
Task 2 (JS)  ──↗
```

Task 1 и Task 2 независимы — можно выполнять параллельно.
Task 3 зависит от обоих.
Task 4 — финальное тестирование.
