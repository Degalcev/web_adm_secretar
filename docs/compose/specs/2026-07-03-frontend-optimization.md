# Аудит и план оптимизации frontend

## [S1] Текущее состояние

### Статистика
| Компонент | Файлов | Строк |
|---|---|---|
| HTML (index.html) | 1 | 741 |
| Partials | 4 | ~350 |
| CSS | 11 | ~4 200 |
| JS | 16 | ~3 480 |
| **Итого** | **32** | **~8 770** |

### Ключевые проблемы
- **JS**: 132 глобальные функции, 47 глобальных переменных, дублированный CRUD-код
- **CSS**: конфликты specificity между responsive.css и modals.css, мёртвые правила
- **HTML**: index.html на 741 строку — содержит подтверждение удаления + все страницы

---

## [S2] JS — проблемы и решения

### 2.1. Дублированный CRUD-код (критично)
**Проблема**: save/load/confirm-delete паттерн скопирован в 3-4 файла (users, organizers, locations). Каждая функция ~30-40 строк идентичного кода.

**Решение**: Абстракция `crudModule(name, api, loadFn, renderFn)` — единый объект с `openAdd()`, `openEdit()`, `save()`, `load()`, `confirmDelete()`. Каждый CRUD модуль — вызов `createCrudModule('organizers', '/admin/api/organizers', renderOrganizers)`.

**Экономия**: ~150 строк (3 файла × 50 строк дублированного кода).

### 2.2. CSRF токен — 10 копий строки
**Проблема**: `document.cookie.match(/csrf_token=([^;]+)/)?.[1] || ''` повторяется 10 раз в 7 файлах.

**Решение**: `getCsrfToken()` в `utils.js`. Все fetch-вызовы используют её.

### 2.3. Форматирование даты — 2 дубликата
**Проблема**: `_localDateStr()` в app.js и `_getLocalDateStr()` в vks.js — идентичны.

**Решение**: Оставить одну функцию в `utils.js`.

### 2.4. Массивы месяцев — 5 объявлений
**Проблема**: `MONTHS`, `monthNames` объявлены 5 раз в vks.js и dashboard.js в разных формах.

**Решение**: Вынести `MONTHS_FULL`, `MONTHS_SHORT`, `MONTHS_GENITIVE` в `utils.js`.

### 2.5. Мёртвый код
| Что | Где |
|---|---|
| `loadDashboardData()` | dashboard.js:43 (не вызывается) |
| `applyDashboardFilter()` | dashboard.js:36 (не вызывается) |
| `_dashLastDay` | dashboard.js:18 (не читается) |
| Дубликат `updateLocControls()` | dashboard.js:318 (перезаписан строкой 341) |
| `dateInput` | vks.js:106 (не определена, всегда undefined) |

### 2.6. Централизованный dispatch удаления
**Проблема**: `confirmDelete()` в users.js — маршрутизатор удаления всех сущностей через 4 глобальные переменные. При добавлении новой сущности нужно менять 5+ мест.

**Решение**: Единый `deletingState = { type: null, id: null }` вместо 4 переменных.

### 2.7. vks.js — 1031 строка, 4 области
**Решение**: Разделить на:
- `vks-filters.js` — фильтры и загрузка (~280 строк)
- `vks-board.js` — рендеринг карточек (~280 строк)
- `vks-modal.js` — модалка и документы (~275 строк)
- `vks-actions.js` — выполнение операций (~200 строк)

### 2.8. SSE-рефреши дублируют load
**Проблема**: `_refreshLocations()` копирует логику `loadLocations()` + обновление дашборда.

**Решение**: SSE-рефреши вызывают `loadXxx()` + отдельное обновление дашборда.

---

## [S3] CSS — проблемы и решения

### 3.1. responsive.css: мёртвые правила
- `.vks-doc-item` — класс не используется в HTML
- `.modal-section*` — элементы удалены из всех модалок

**Решение**: Удалить ~30 строк мёртвого CSS.

### 3.2. responsive.css: дубли stats-row
- Строка 102 и 147 — два объявления `grid-template-columns: repeat(4, 1fr)`

**Решение**: Удалить дубликат.

### 3.3. modals.css: базовые стили конфликтуют с vks-modal-flat
**Проблема**: `.form-row { flex-direction: column }` в responsive.css перезаписывает `.vks-modal-flat .form-row { flex-direction: row }` — resolved через `@media` в конце modals.css, но проблема архитектурная.

**Решение**: Вынести стили `.vks-modal-flat` в отдельный CSS файл `vks-modal.css`. Загружать ПОСЛЕ responsive.css.

### 3.4. Инлайн-стили в partials
User modal содержит `style="display:block;font-size:0.625rem;..."` на лейблах секций.

**Решение**: CSS-класс `.form-section-label`.

---

## [S4] Архитектурные рекомендации

### 4.1. Вынести vks-modal-flat в отдельный CSS
`app/static/css/vks-modal.css` — все стили Compact Flat модалок (desktop + mobile @media). Загружается последней в `index.html`.

**Порядок загрузки CSS**: base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → **vks-modal** (новый)

### 4.2. CRUD-абстракция
```
utils/crud.js — createCrudModule(config) → { openAdd, openEdit, save, load, confirmDelete }
```
Каждый CRUD-модуль (users, organizers, locations) — конфигурация + render-функция.

### 4.3. Единое хранилище данных
```
utils/store.js — window.store = { allLocations, allOrganizers, allEvents, allUsers }
```
SSE, load-функции и dashboard пишут в одно место. Нет рассинхронизации.

### 4.4. Общий dispatch удаления
```
utils/confirm.js — ConfirmManager
  .open(type, id, name, onConfirm)
  .close()
  .dispatch() — вызывает onConfirm
```
Заменяет 4 глобальные переменные + централизованную `confirmDelete()`.

### 4.5. Глобальные переменные
47 глобальных `let`/`const` — можно сократить до ~15 через модули (store + CRUD).

---

## [S5] Порядок реализации

### Фаза 1: Очистка (не ломает функциональность)
1. Удалить мёртвый JS-код (5 функций)
2. Удалить мёртвый CSS (30+ строк)
3. Убрать дубликат `updateLocControls`
4. Исправить `dateInput` → правильная переменная
5. Вынести CSRF token в `getCsrfToken()`

### Фаза 2: Утилиты (создание общей базы)
6. `utils.js` — добавить `getCsrfToken()`, `_localDateStr()`, `MONTHS_*`
7. `utils/store.js` — централизованное хранилище данных
8. `utils/confirm.js` — ConfirmManager вместо 4 переменных
9. `utils/crud.js` — CRUD-абстракция

### Фаза 3: Рефакторинг модулей
10. `vks.js` → 4 файла (filters, board, modal, actions)
11. Users/Organizers/Locations → CRUD-модули на базе crud.js
12. Dashboard → обновление через store
13. SSE → вызовы load + store

### Фаза 4: CSS
14. Вынести `.vks-modal-flat` в `vks-modal.css`
15. Очистить responsive.css от мёртвых правил
16. Добавить `.form-section-label` вместо инлайн-стилей

### Фаза 5: Порядок загрузки
17. Обновить `index.html` — новый порядок CSS и JS файлов
18. Проверить mobile/desktop
19. Деплой на test
