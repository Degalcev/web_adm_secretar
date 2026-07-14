# Расширенная система мероприятий — План реализации

> **For agentic workers:** Use compose:subagent or compose:execute to implement task-by-task.

**Goal:** Расширить систему мероприятий: новые типы с цветами, продолжительность, участники, организатор-сотрудник, повторяющиеся серии, фильтры, печать.

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
| `app/routes/participants.py` | Новый файл: CRUD участников, поиск |
| `app/static/js/events.js` | Новый файл: список мероприятий (не-VKS) с фильтрами |
| `app/static/js/event-modal.js` | Модалка создания/редактирования мероприятия |
| `app/static/js/calendar.js` | Цвета по типам, расширение series, фильтр участников |
| `app/static/css/events.css` | Стили страницы мероприятий |
| `app/static/index.html` | Подключение JS/CSS, новые page div |
| `app/static/partials/event-modal.html` | Partial модалки |

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

- [ ] Группа «Мероприятия» с подпунктами: Все, Совещания, Встречи, Заседания, Личные приёмы
- [ ] Коммит

### Task 4.2: SPA роутинг

**Files:** `app/static/js/router.js`, `app/static/js/navigation.js`

- [ ] Новые роуты: /events/, /events/meetings/, /events/appointments/
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

**Files:** `app/static/css/calendar.css`

- [ ] `.cal-ev[data-type="ВКС"]` → accent
- [ ] `.cal-ev[data-type="Совещание"]` → success
- [ ] `.cal-ev[data-type="Встреча"]` → warning
- [ ] `.cal-ev[data-type="Заседание"]` → danger
- [ ] `.cal-ev[data-type="Приём"]` → fg-muted
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

## Этап 8: Деплой и тестирование

### Task 8.1: Деплой

- [ ] python deploy/deploy.py test
- [ ] Проверка миграций
- [ ] Проверка CRUD участников
- [ ] Проверка фильтров
- [ ] Проверка печати
- [ ] Проверка календаря с цветами
- [ ] Коммит
