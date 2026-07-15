# Рефакторинг загрузки данных — План

> **For agentic workers:** Use compose:subagent or compose:execute to implement task-by-task.

**Goal:** Убрать `store.allEvents`, `limit=10000`, клиентскую фильтрацию. Все страницы работают через серверную пагинацию + серверные фильтры.

**Architecture:** Бэкенд фильтрует и отдаёт страницы. Клиент только отображает. Preload — только справочники.

**Tech Stack:** Python aiohttp, SQLAlchemy async, PostgreSQL, vanilla JS

---

## Файлы для замены (из `templates/preload/`)

| Файл | Источник | Описание |
|------|----------|----------|
| `database/requests.py` | `templates/preload/requests.py` | Серверные фильтры + cursor_id + count_events + get_event_counts_by_date |
| `app/routes/vks.py` | `templates/preload/vks.py` | Все фильтры передаются на сервер, stats через count_events |
| `app/routes/preload.py` | `templates/preload/preload.py` | Только справочники (orgs + locs) |
| `app/static/js/preloader.js` | `templates/preload/preloader.js` | Только справочники, store.allEvents убран |
| `app/static/js/vks-board.js` | `templates/preload/vks-board.js` | Серверные фильтры, cursor_id, _findScrollParent |
| `app/static/js/sse.js` | `templates/preload/sse.js` | Инвалидация без загрузки всего |

---

## Этап 1: Backend — requests.py

Заменить `database/requests.py` целиком из шаблона.

**Ключевые изменения:**
- `get_events()` — добавлены `search`, `cursor_id`, серверная фильтрация по location_id/organizer_id/date_from/date_to
- `count_events()` — отдельный COUNT запрос без загрузки строк
- `get_event_counts_by_date()` — агрегаты одним запросом (CASE WHEN)
- `get_events_by_date_range()` — для календаря

**Коммит:** `refactor: backend requests.py — серверные фильтры + cursor_id + count`

---

## Этап 2: Backend — vks.py

Заменить `app/routes/vks.py` целиком из шаблона.

**Ключевые изменения:**
- `get_events_handler` — передаёт ВСЕ фильтры (type, location_id, organizer_id, from, to, search, cursor_id) в `get_events()`
- `get_events_stats` — использует `count_events()` вместо загрузки всех строк
- `dashboard_stats` — маленькие целевые запросы (today: limit 8, soon: limit 8)
- Убрана клиентская фильтрация — сервер фильтрует

**Коммит:** `refactor: backend vks.py — серверная фильтрация + stats через count`

---

## Этап 3: Backend — preload.py

Заменить `app/routes/preload.py` целиком из шаблона.

**Ключевые изменения:**
- Возвращает ТОЛЬКО organizers + locations
- Убраны events, documents, lock users из ответа

**Коммит:** `refactor: preload — только справочники, без событий`

---

## Этап 4: Frontend — preloader.js

Заменить `app/static/js/preloader.js` целиком из шаблона.

**Ключевые изменения:**
- `preloadAllData()` — грузит ТОЛЬКО locations + organizers
- `restoreFromCache()` — восстанавливает только справочники
- localStorage кэш — только справочники (они маленькие)
- `store.allEvents` больше не заполняется

**Коммит:** `refactor: preloader — только справочники, store.allEvents убран`

---

## Этап 5: Frontend — vks-board.js

Заменить `app/static/js/vks-board.js` целиком из шаблона.

**Ключевые изменения:**
- `_vksLoadMore` — передаёт фильтры (org, loc, search, date) как query params на сервер
- `cursor_id` — детерминированная пагинация
- `_vksRenderBoard` — рендер без клиентской фильтрации (сервер уже отфильтровал)
- `_findScrollParent` — поиск реального scroll container
- `updateVksStats()` — async fetch из `/api/events/stats`

**Коммит:** `refactor: vks-board — серверные фильтры + cursor_id`

---

## Этап 6: Frontend — sse.js

Заменить `app/static/js/sse.js` целиком из шаблона.

**Ключевые изменения:**
- `_refreshEvents()` — инвалидация текущего вида (сброс пагинации + re-render)
- НЕ загружает `loadAllEvents()`
- Каждая страница сама перезапрашивает данные
- `_saveRefCache()` — кэш только справочников

**Коммит:** `refactor: sse — инвалидация без загрузки всего`

---

## Этап 7: Frontend — events.js

Адаптировать `app/static/js/events.js` под новую архитектуру.

**Ключевые изменения:**
- `_eventsLoadMore` — передаёт фильтры на сервер (type, status, search)
- `eventsUpdateStats` — async fetch из `/api/events/stats`
- Убрать клиентскую фильтрацию (type, org, loc, desc) — сервер фильтрует
- `eventsRenderBoard` — рендер из серверных данных

**Коммит:** `refactor: events — серверные фильтры + stats`

---

## Этап 8: Frontend — utils.js

Обновить `app/static/js/utils.js`.

**Ключевые изменения:**
- Убрать `EVENTS_LIMIT` (не нужен — пагинация через cursor)
- `_findScrollParent` — уже в шаблоне vks-board.js, перенести в utils.js если дублируется

**Коммит:** `refactor: utils — убрать EVENTS_LIMIT`

---

## Этап 9: Очистка store.allEvents

Проверить и удалить ВСЕ обращения к `store.allEvents`:

- `vks-filters.js` — `loadAllEvents()` удалить (или оставить только для dashboard fallback)
- `dashboard.js` — адаптировать под `/api/dashboard` (уже использует)
- `event-modal.js` — `loadAllEvents()` после save → заменить на `renderVksBoard()`/`eventsRenderBoard()`
- `vks-actions.js` — `loadAllEvents()` после complete/delete → заменить на re-render
- `calendar.js` — fallback `loadAllEvents()` → удалить (использует `_calLoadRange`)

**Коммит:** `refactor: удалить store.allEvents и loadAllEvents()`

---

## Этап 10: Деплой и тестирование

1. Проверить VKS active/completed — загрузка, скролл, фильтры, stats
2. Проверить Мероприятия — загрузка, скролл, фильтры, stats
3. Проверить Календарь — загрузка по неделям, навигация
4. Проверить Dashboard — агрегаты
5. Проверить SSE — обновление при создании/изменении события
6. Проверить модалку — сохранение, обновление, удаление

**Коммит:** `refactor: data loading — серверная фильтрация + пагинация`

---

## Нагрузка (до/после)

| | Было | Станет |
|---|---|---|
| Старт | preload × 10000 событий | preload × справочники (~KB) |
| VKS board | данные из store | 1 запрос × 50 событий |
| Скролл | ничего (всё в памяти) | +50 по запросу |
| SSE | перезагрузка 10000 | сброс кэша + 50 текущего |
| Фильтр/поиск | клиентский filter() | серверный WHERE + новая страница |
| 100K событий | падает | работает |
