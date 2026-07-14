# Расширенная система мероприятий — План реализации

> **For agentic workers:** Use compose:subagent or compose:execute to implement task-by-task.

**Goal:** Расширить систему мероприятий: новые типы с цветами, продолжительность, участники, организатор-сотрудник, повторяющиеся серии, фильтры, печать. Оптимизация загрузки: пагинация, range-based календарь, preload, SSE debounce.

**Architecture:** PostgreSQL миграции → Backend API (aiohttp routes + SQLAlchemy) → Frontend (vanilla JS, SPA). Минимальные изменения в существующем коде, новые файлы для новых модулей.

**Tech Stack:** Python aiohttp, SQLAlchemy async, PostgreSQL, vanilla JS/CSS

---

## Файлы для изменений

| Файл | Изменения |
|------|-----------|
| `database/models.py` | EventHistory, EventSeries, EventSeriesException, EventParticipant модели |
| `database/migrations/` | SQL миграции (4 файла) |
| `database/requests.py` | Новые запросы: participants, series, organizers с usage_count |
| `database/sending.py` | CRUD участников, серий |
| `app/routes/events.py` | Расширение create/update events (участники, duration, organizer_type) |
| `app/event_types.py` | Конфиг типов: ALLOWED_TYPES словарь + валидация |
| `app/routes/participants.py` | Новый файл: CRUD участников, поиск |
| `app/static/js/events.js` | Новый файл: список мероприятий (не-VKS) с фильтрами |
| `app/static/js/event-modal.js` | Модалка создания/редактирования мероприятия |
| `app/static/js/calendar.js` | Цвета по типам, расширение series, фильтр участников |
| `app/static/css/events.css` | Стили страницы мероприятий |
| `app/static/index.html` | Подключение JS/CSS, новые page div |
| `app/static/partials/event-modal.html` | Partial модалки |
| `app/static/js/sse.js` | Batch debounce для SSE событий |

---

## Этап 1: Модель данных (миграции)

### Task 1.1: Миграция — event_participants

**Files:** `database/migrations/001_event_participants.sql`

- [ ] Создать таблицу `event_participants`
- [ ] Добавить индексы
- [ ] Коммит

### Task 1.2: Миграция — event_series + exceptions

**Files:** `database/migrations/002_event_series.sql`

- [ ] Создать `event_series`
- [ ] Создать `event_series_exceptions`
- [ ] Коммит

### Task 1.3: Миграция — новые поля events

**Files:** `database/migrations/003_events_extended.sql`

- [ ] `events.duration INTEGER DEFAULT 60`
- [ ] `events.organizer_type VARCHAR(10) DEFAULT 'org'`
- [ ] `events.series_id UUID FK→event_series`
- [ ] Коммит

### Task 1.4: Обновление моделей SQLAlchemy

**Files:** `database/models.py`

- [ ] EventParticipant
- [ ] EventSeries
- [ ] EventSeriesException
- [ ] Расширение Event (duration, organizer_type, series_id)
- [ ] Коммит

### Task 1.5: Конфиг типов мероприятий

**Files:** `app/event_types.py` (новый)

- [ ] Словарь `ALLOWED_TYPES`:
  ```python
  ALLOWED_TYPES = {
      'ВКС':        {'label': 'ВКС',        'color': 'var(--accent)', 'css_class': 'type-vks'},
      'Совещание':  {'label': 'Совещание',  'color': 'var(--success)', 'css_class': 'type-meeting'},
      'Встреча':    {'label': 'Встреча',    'color': 'var(--warning)', 'css_class': 'type-session'},
      'Заседание':  {'label': 'Заседание',  'color': 'var(--danger)',  'css_class': 'type-board'},
      'Приём':      {'label': 'Личный приём','color': 'var(--fg-muted)', 'css_class': 'type-reception'},
  }
  ```
- [ ] Функция `validate_event_type(type_name)` → bool
- [ ] Функция `get_type_info(type_name)` → dict
- [ ] Импорт в vks.py для валидации при create/update
- [ ] Коммит

---

## Этап 2: Backend — участники и расширение events

### Task 2.1: CRUD участников (database layer)

**Files:** `database/requests.py`, `database/sending.py`

- [ ] `get_event_participants(event_id)` → [{id, user_id, name, role}]
- [ ] `add_event_participants(event_id, participants)` → batch insert
- [ ] `remove_event_participant(participant_id)`
- [ ] `search_users_for_participants(query)` → автодополнение
- [ ] Коммит

### Task 2.2: API участников

**Files:** `app/routes/participants.py` (новый), `app/server.py`

- [ ] GET /admin/api/events/{id}/participants
- [ ] POST /admin/api/events/{id}/participants
- [ ] DELETE /admin/api/events/{id}/participants/{pid}
- [ ] GET /admin/api/participants/search?q=
- [ ] Подключение роутов в server.py
- [ ] Коммит

### Task 2.3: Расширение create/update event

**Files:** `app/routes/vks.py`

- [ ] При create: duration, organizer_type, participants[]
- [ ] При update: перезапись participants
- [ ] Валидация organizer_type ('org'/'user')
- [ ] Валидация type через `validate_event_type()` — отклонить если не в ALLOWED_TYPES
- [ ] Коммит

### Task 2.4: Расширение GET events + фильтры

**Files:** `app/routes/vks.py`, `database/requests.py`

- [ ] Фильтр по type (?type=ВКС)
- [ ] Фильтр по participant_id (?participant_id=uuid)
- [ ] Фильтр по периоду (?from=&to=)
- [ ] Возврат participants[] в ответе
- [ ] Возврат organizer_type + organizer_name
- [ ] Коммит

### Task 2.5: Organizers usage_count

**Files:** `database/requests.py`

- [ ] `get_organizers_with_usage()` → [{...org, usage_count}]
- [ ] Параметр sort=usage в API
- [ ] Коммит

### Task 2.6: Печать API

**Files:** `app/routes/vks.py`

- [ ] GET /admin/api/events/print?participant_id=&from=&to=
- [ ] Формат: [{date, time_start, time_end, type, location, organizer, participants}]
- [ ] Коммит

---

## Этап 3: Backend — повторяющиеся серии

### Task 3.1: CRUD серий (database layer)

**Files:** `database/requests.py`, `database/sending.py`

- [ ] `create_event_series(freq, interval_val, by_day, until)`
- [ ] `get_event_series(series_id)`
- [ ] `delete_event_series(series_id)`
- [ ] `add_series_exception(series_id, date, event_id)`
- [ ] `expand_series(series, date_from, date_to)` → list of dates
- [ ] Коммит

### Task 3.2: API серий

**Files:** `app/routes/vks.py`

- [ ] POST /admin/api/events/{id}/series — создать серию
- [ ] DELETE /admin/api/events/{id}/series — удалить серию
- [ ] POST /admin/api/events/{id}/series/exception — добавить исключение
- [ ] Коммит

### Task 3.3: Генерация экземпляров в календаре

**Files:** `app/static/js/calendar.js`

- [ ] `expandSeries()` — генерация дат по серии
- [ ] Исключение дат из series_exceptions
- [ ] Объединение с одиночными событиями
- [ ] Коммит

---

## Этап 4: Frontend — навигация и страница мероприятий

### Task 4.1: Обновление sidebar

**Files:** `app/static/index.html`

- [ ] Группа «Мероприятия» с подпунктами из ALLOWED_TYPES (динамически через JS)
- [ ] Каждый пункт фильтрует по типу: `/events/?type=ВКС`
- [ ] Пункт «Все мероприятия» — без фильтра
- [ ] Коммит

### Task 4.2: SPA роутинг

**Files:** `app/static/js/router.js`, `app/static/js/navigation.js`

- [ ] Роут: `/events/` — страница мероприятий
- [ ] Query-параметр `?type=` для фильтрации (не отдельные роуты на каждый тип)
- [ ] switchPage для events
- [ ] SPA_PATHS в server.py, spa_prefixes в auth.py
- [ ] Коммит

### Task 4.3: Страница мероприятий — список

**Files:** `app/static/js/events.js`, `app/static/css/events.css`

- [ ] Загрузка events с фильтрами
- [ ] Таблица: дата, время, тип (цвет), название, зал, организатор, участники
- [ ] Кнопки: Создать, Печать, Экспорт
- [ ] Коммит

### Task 4.4: Фильтры на странице мероприятий

**Files:** `app/static/js/events.js`

- [ ] Фильтр по типу (multi-select)
- [ ] Фильтр по участнику (multi-select с автодополнением)
- [ ] Фильтр по периоду (date range)
- [ ] Фильтр по организатору (select с сортировкой по usage)
- [ ] Коммит

---

## Этап 5: Frontend — модалка мероприятия

### Task 5.1: HTML partial модалки

**Files:** `app/static/partials/event-modal.html`

- [ ] Поля: тип (select), дата, время, продолжительность (select), зал
- [ ] Организатор: radio (организация/сотрудник) + select
- [ ] Участники: список + автодополнение + роль
- [ ] Серия: checkbox «Повторять» + freq/interval/days/until
- [ ] Коммит

### Task 5.2: JS модалки

**Files:** `app/static/js/event-modal.js`

- [ ] openAddEvent(), openEditEvent()
- [ ] saveEvent() — multipart (поля + participants JSON)
- [ ] loadParticipants() — автодополнение
- [ ] toggleSeries() — показ/скрытие настроек серии
- [ ] Коммит

### Task 5.3: CSS модалки

**Files:** `app/static/css/events.css`

- [ ] Стили модалки
- [ ] Стили автодополнения участников
- [ ] Стили настроек серии
- [ ] Коммит

---

## Этап 6: Frontend — календарь

### Task 6.1: Цвета по типам

**Files:** `app/static/css/calendar.css`, `app/static/css/events.css`

- [ ] CSS классы из конфига `ALLOWED_TYPES`:
  - `.cal-ev.type-vks` → accent
  - `.cal-ev.type-meeting` → success
  - `.cal-ev.type-session` → warning
  - `.cal-ev.type-board` → danger
  - `.cal-ev.type-reception` → fg-muted
- [ ] Тот же набор классов для `.event-row.type-*` на странице мероприятий
- [ ] Badge/чип для типа в таблице и модалке
- [ ] Коммит

### Task 6.2: Данные в календаре

**Files:** `app/static/js/calendar.js`

- [ ] Загрузка участников для каждого события
- [ ] Добавление data-type на карточки
- [ ] Фильтр по участникам в тулбаре
- [ ] Высота карточки по duration
- [ ] Коммит

---

## Этап 7: Frontend — печать

### Task 7.1: Страница печати

**Files:** `app/static/js/print.js`, `app/static/css/print.css`

- [ ] generatePrintHTML(data) — генерация HTML
- [ ] Формат: заголовок + список мероприятий + итого
- [ ] @media print стили
- [ ] Кнопка «Печать» на странице мероприятий
- [ ] Коммит

---

## Этап 8: Пагинация и оптимизация загрузки

> **Цель:** при большом количестве мероприятий сайт не тормозит. Загружаем только то, что видно.

### Task 8.1: Пагинация на backend (API events)

**Files:** `app/routes/vks.py`, `database/requests.py`

- [ ] GET /admin/api/events принимает: `?cursor=DATE_TIME&limit=20&status=current|completed`
- [ ] Cursor-based пагинация: курсор = `(date, time)` последнего элемента
- [ ] Window function: `SELECT *, COUNT(*) OVER() as total` — количество в одном запросе
- [ ] Ответ: `{events: [...], total: 156, next_cursor: "2026-07-15T14:00:00", has_more: true}`
- [ ] Фильтры: `?type=&participant_id=&location_id=&organizer_id=&from=&to=`
- [ ] При смене фильтра — курсор сбрасывается (новый запрос с offset 0)
- [ ] Коммит

### Task 8.2: Пагинация на frontend (VKS доска + infinite scroll)

**Files:** `app/static/js/vks-board.js`

- [ ] IntersectionObserver на "заглушке" внизу списка (`.vks-load-more`)
- [ ] При срабатывании: `fetch('/api/events?cursor=X&limit=20')`
- [ ] Append результатов в `store.allEvents`
- [ ] Сброс при смене фильтра/статуса
- [ ] Лоадер-индикатор во время загрузки
- [ ] Коммит

### Task 8.3: Range-based загрузка для календаря

**Files:** `app/static/js/calendar.js`, `app/routes/vks.py`

- [ ] GET /admin/api/events принимает `?from=2026-07-07&to=2026-07-13`
- [ ] Preload загружает ±2 недели от текущей даты (а не всё)
- [ ] При переключении недели — запрос нового диапазона если нет в кэше
- [ ] Кэш в `store` по диапазонам: `store._eventsCache[rangeKey]`
- [ ] Коммит

### Task 8.4: Preload оптимизация

**Files:** `app/routes/preload.py`, `app/static/js/preloader.js`

- [ ] Preload: locations + organizers + users (без events — они пагинируются)
- [ ] Preload кэш "навсегда" — обновляется через SSE
- [ ] При reconnect SSE → принудительный `preloadAllData()` (актуализация кэша)
- [ ] При logout: сброс `store.allEvents`, `dash_cache`, курсоров, фильтров
- [ ] При logout: НЕ сбрасывать locations/organizers/users (перезагрузятся при входе)
- [ ] Коммит

### Task 8.5: SSE batch debounce

**Files:** `app/static/js/sse.js`

- [ ] Группировка SSE событий в 200ms окно (debounce)
- [ ] Batch обработка: `{type: "events", ids: [id1, id2]}` вместо по одному
- [ ] При batch events: обновить только затронутые карточки/дни
- [ ] Коммит

### Task 8.6: Performance лимиты

**Files:** `app/routes/vks.py`, `app/static/js/calendar.js`

- [ ] Максимум 50 событий на день в календаре (остальные — "ещё N")
- [ ] Лимит 20 элементов на страницу доски
- [ ] Overflow индикатор: "Показать ещё" кнопка при превышении лимита
- [ ] Коммит

---

## Этап 9: Деплой и тестирование

### Task 9.1: Деплой

- [ ] python deploy/deploy.py test
- [ ] Проверка миграций
- [ ] Проверка CRUD участников
- [ ] Проверка фильтров
- [ ] Проверка печати
- [ ] Проверка календаря с цветами
- [ ] Проверка пагинации (50+ событий)
- [ ] Проверка infinite scroll
- [ ] Проверка кэша при reconnect SSE
- [ ] Коммит
