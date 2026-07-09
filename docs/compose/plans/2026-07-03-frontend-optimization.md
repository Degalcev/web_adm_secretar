# План оптимизации frontend — 5 фаз

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оптимизировать frontend: убрать мёртвый код, абстрагировать CRUD, создать общие утилиты, разделить vks.js, вынести CSS.

**Architecture:** 5 фаз постепенной оптимизации. Каждая фаза — отдельный коммит, не ломает функциональность.

---

## Фаза 1: Очистка мёртвого кода

### Task 1.1: Удалить мёртвый JS-код
- `dashboard.js`: удалить `loadDashboardData()` (строки 43-66), `applyDashboardFilter()` (36-41), `_dashLastDay` (18), дубликат `updateLocControls()` (318-327)
- `vks.js:106`: исправить `dateInput` → `document.getElementById('f-vks-active-day')`
- Commit

### Task 1.2: Удалить мёртвый CSS
- `responsive.css`: удалить `.vks-doc-item*` (не используется), `.modal-section*` (удалены из HTML)
- `responsive.css`: удалить дубликат `.stats-row { grid-template-columns }` (строка 147)
- Commit

### Task 1.3: CSRF token → utils.js
- `utils.js`: добавить `getCsrfToken()` → `document.cookie.match(/csrf_token=([^;]+)/)?.[1] || ''`
- `users.js`, `organizers.js`, `locations.js`, `vks.js`, `dashboard.js`, `profile.js`: заменить inline-строку на `getCsrfToken()`
- Commit

### Task 1.4: Дату → utils.js
- `utils.js`: добавить `localDateStr(d)` (из app.js `_localDateStr`)
- `vks.js`: удалить `_getLocalDateStr()`, использовать `localDateStr()`
- `app.js`: удалить `_localDateStr()`, использовать `localDateStr()`
- Commit

---

## Фаза 2: Общие утилиты

### Task 2.1: Месяцы в utils.js
- `utils.js`: добавить `MONTHS_FULL`, `MONTHS_SHORT`, `MONTHS_GENITIVE`
- `vks.js`: удалить `MONTHS` (строка 10), `monthNames` (строка 405)
- `dashboard.js`: удалить `monthNames` (строки 357, 472, 486)
- Commit

### Task 2.2: ConfirmManager
- `utils.js`: добавить `ConfirmManager`:
  ```javascript
  const ConfirmManager = {
    _type: null, _id: null, _onConfirm: null,
    open(type, id, name, onConfirm) { ... },
    close() { ... },
    dispatch() { ... }
  };
  ```
- `users.js`: `openConfirm()` → `ConfirmManager.open('user', id, name, deleteUser)`
- `organizers.js`: `openConfirmOrg()` → `ConfirmManager.open('organizer', id, name, deleteOrganizer)`
- `locations.js`: `openConfirmLoc()` → `ConfirmManager.open('location', id, name, deleteLocation)`
- `vks.js`: `confirmDeleteEvent()` → `ConfirmManager.open('event', id, name, deleteEvent)`
- `users.js`: `confirmDelete()` → `ConfirmManager.dispatch()`
- Commit

### Task 2.3: CRUD-абстракция
- `utils.js`: добавить `createCrudModule(config)` — фабрика CRUD операций
- Каждый CRUD модуль генерирует: `openAdd()`, `openEdit()`, `save()`, `load()`, `confirmDelete()`
- `users.js`: рефакторинг через `createCrudModule` — убрать ~150 строк
- `organizers.js`: рефакторинг через `createCrudModule`
- `locations.js`: рефакторинг через `createCrudModule`
- Commit

### Task 2.4: Store — централизованное хранилище
- `utils.js`: добавить `window.store = { allLocations: [], allOrganizers: [], allEvents: [], allUsers: [] }`
- Все load-функции пишут в `store.xxx` вместо глобальных переменных
- SSE-рефреши обновляют `store.xxx`
- Dashboard читает из `store.xxx`
- Commit

---

## Фаза 3: Разбиение vks.js

### Task 3.1: vks-filters.js
- `vks-filters.js`: вынести `populateDateSelects`, `matchDateFilter`, `filterVksByQuick`, `filterVksListActive`, `filterVksListCompleted`, `loadVksActive`, `loadVksCompleted`
- Commit

### Task 3.2: vks-board.js
- `vks-board.js`: вынести `renderVksBoard`, `renderVksBlock`, `renderVksCard`, `renderDocChip`, `getDocIcon`, `getDocCardMeta`, `getOrganizerName`, `getLocationName`
- Commit

### Task 3.3: vks-modal.js
- `vks-modal.js`: вынести `openAddEventModal`, `openEditEventModal`, `closeEventModal`, `saveEvent`, `refreshEventDocs`, `addPendingFiles`, `removePendingFile`, `removeExistingDoc`, `downloadDoc`, `loadEventSelects`, `_updateDocScrollGradients`
- Commit

### Task 3.4: vks-actions.js
- `vks-actions.js`: вынести `toggleEventComplete`, `confirmCompleteEvent`, `completeEvent`, `confirmDeleteEvent`, `confirmDeleteFromModal`
- Commit

---

## Фаза 4: CSS оптимизация

### Task 4.1: Вынести vks-modal-flat
- `vks-modal.css`: создать файл со ВСЕМИ стилями `.vks-modal-flat` из `modals.css`
- `modals.css`: удалить секцию `.vks-modal-flat`
- `index.html`: добавить `<link>` для `vks-modal.css` ПОСЛЕ `responsive.css`
- `responsive.css`: мобильные стили `.vks-modal-flat` → удалить (перенесены в vks-modal.css)
- Commit

### Task 4.2: Добавить .form-section-label
- `vks-modal.css`: добавить `.form-section-label` вместо инлайн-стилей
- `partials/user-modal.html`: заменить инлайн-стили на класс
- Commit

### Task 4.3: Обновить порядок загрузки
- `index.html`: CSS порядок: base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → **vks-modal**
- JS порядок: utils → auth → router → navigation → users → organizers → locations → logs → vks-filters → vks-board → vks-modal → vks-actions → settings → dashboard → profile → preloader → sse → updater → app
- Commit

---

## Фаза 5: Тестирование и деплой

### Task 5.1: Проверка desktop + mobile
- Проверить все CRUD модалки (Users, Organizers, Locations, VKS)
- Проверить фильтры VKS, дашборд, логи
- Проверить SSE обновления
- Проверить мобильный вид

### Task 5.2: Деплой
- `git push origin develop`
- `python deploy/deploy.py test`
- Проверка на test сервере
