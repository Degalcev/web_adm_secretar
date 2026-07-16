# CLAUDE.md — Правила проекта web_adm_secretar

## ГЛАВНОЕ ПРАВИЛО
**Любое изменение кода требует планирования.**
- Сначала создаём план (spec/plan файл в `docs/compose/plans/`).
- Реализация начинается ТОЛЬКО после подтверждения плана пользователем.
- Исключение: явные баг-фиксы с одной строкой изменения.
- **Любой дебаг**: сначала анализ цепочки вызовов → план → только после согласования реализация. Не чинить вслепую.

---

## Идентификация проекта
**Название**: web_adm_secretar
**Назначение**: Панель администратора для бота VKS Secretar (@vks_secretar_bot)
**Выделен из**: bot_secretar_2.0_MAX (2026-06-29)

## Стек технологий
- **Backend**: Python 3.x + asyncio + aiohttp
- **База данных**: PostgreSQL (asyncpg) + SQLAlchemy async
- **Авторизация**: argon2-cffi, сессии в PostgreSQL (таблица sessions)
- **Логирование**: loguru (ротация ежедневно, хранение 7 дней)
- **Frontend**: Vanilla JS/CSS (SPA с клиентским роутингом)
- **Real-time**: SSE (Server-Sent Events) через PostgreSQL LISTEN/NOTIFY
- **Деплой**: paramiko SSH к VPS

## Архитектура
```
app/
├── auth.py              # Auth middleware, CSRF (multipart fallback), rate limiting, cookie domain
├── server.py            # Точка входа aiohttp (middleware + SPA + API + static + cleanup + version.json)
├── event_logger.py      # Логирование изменений VKS (сравнение состояний, запись в event_history)
├── event_types.py       # Конфиг типов мероприятий: ALLOWED_TYPES (ВКС/Совещание/Встреча/Заседание/Приём)
├── sse_listener.py      # SSE listener (PostgreSQL LISTEN/NOTIFY → broadcast)
├── routes/
│   ├── users.py         # CRUD пользователей + смена пароля + /me + /auth/check
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов (panel + bot)
│   ├── vks.py           # CRUD событий + batch документы + audit + lock/unlock + history + series + /single + /stats + /dashboard + /dashboard/chart
│   ├── documents.py     # CRUD документов (download/upload/delete)
│   ├── participants.py  # CRUD участников мероприятий + поиск пользователей
│   ├── print_events.py  # Печать мероприятий (GET /admin/api/events/print)
│   ├── preload.py       # Preload API (organizers + locations одним запросом)
│   └── sse.py           # SSE endpoint (/admin/api/events/stream)
└── static/
    ├── index.html       # SPA entry point (?v=__VERSION__)
    ├── favicon.svg      # Иконка
    ├── partials/
    │   ├── event-modal.html       # VKS modal partial (Compact Flat)
    │   ├── event-modal.html     # Мероприятия modal partial (VKS-style)
    │   ├── user-modal.html      # User modal partial
    │   ├── organizer-modal.html # Organizer modal partial
    │   └── location-modal.html  # Location modal partial
    ├── css/
    │   ├── base.css          # CSS переменные, темы, typography
    │   ├── layout.css        # Sidebar, content-area, навигация, independent page scroll
    │   ├── components.css    # Кнопки, бейджи, формы, тултипы
    │   ├── tables.css        # Таблицы CRUD (overflow: clip для углов)
    │   ├── modals.css        # Базовые стили модалок (section, header, body, footer, confirm)
    │   ├── dashboard.css     # Дашборд карточки, VKS панели
    │   ├── vks.css           # VKS страницы (цветная полоска статуса, компактные документы)
    │   ├── events.css        # Мероприятия: тип-бейджи, модалка, participants, weekday buttons
    │   ├── logs.css          # Логи (elevated фон контейнера)
    │   ├── filters.css       # Filter-bar компонент, select фильтры
    │   ├── settings.css      # Страницы настроек/профиля
    │   ├── responsive.css    # Медиа-запросы для всех страниц (⚠️ ПОСЛЕДНИЙ БАЗОВЫЙ)
    │   ├── event-modal.css     # Compact Flat стили модалок + pill-btn hover/done
    │   └── calendar.css      # Календарь: panel, SVG shadow, tabs, grid, events, now-line, mobile
    └── js/
        ├── utils.js          # Store, ConfirmManager, CRUD-абстракция, getCsrfToken(), localDateStr(), getOrganizerName(), getLocationName(), getDocCardMeta(), _findScrollParent()
        ├── cache.js          # Единый in-memory кэш: _dataCache, cacheGet/Set/Invalidate/IsValid
        ├── auth.js           # Логин/выход/checkAuth() + cacheInvalidateAll() при logout
        ├── router.js         # SPA роутинг (handleAuthState)
        ├── navigation.js     # Навигация, мобильное меню, role restrictions
        ├── preloader.js      # preloadAllData() — locations + organizers, restoreFromCache() из localStorage
        ├── sse.js            # SSE: sseRefreshPage() единая функция обновления + debounce + hash check
        ├── dashboard.js      # Дашборд — cacheGet('dashboard'), locName/orgName из cacheGet
        ├── calendar.js       # Календарь (initCalendar, renderCalendar, SVG shadow, hover, now-line, expandSeries)
        ├── events.js         # Мероприятия: cacheGet/set, Текущие полная загрузка, Завершённые пагинация
        ├── print.js          # Печать мероприятий (openPrintModal, generatePrintHTML)
        ├── vks-filters.js    # VKS: фильтры, stats из cacheGet, _vksRenderStats()
        ├── vks-board.js      # VKS: рендеринг карточек, _vksLoadAll (Текущие), _vksLoadMore (Завершённые)
        ├── event-modal.js    # Модалка (загрузка через /api/events/{id}/single, _currentEvent)
        ├── vks-actions.js    # VKS: завершение, удаление, подтверждения
        ├── users.js          # CRUD пользователей (через createCrudModule)
        ├── organizers.js     # CRUD организаторов (через createCrudModule)
        ├── locations.js      # CRUD локаций (через createCrudModule)
        ├── logs.js           # Просмотр логов
        ├── settings.js       # Настройки (THEMES_META + renderThemeGrid)
        ├── profile.js        # Профиль пользователя
        ├── updater.js        # Обновление версии (auto-reload при смене version.json)
        └── app.js            # Инициализация, загрузка partials (5 модалок), кнопка «Наверх»

database/
├── models.py            # User, Organizer, Location, Session, Event, EventHistory, EventSeries, EventSeriesException, EventParticipant, Document
├── requests.py          # Запросы (чтение, batch, cleanup_stale_locks, participants, series, organizers_with_usage)
├── sending.py           # Операции (запись, lock_event, unlock_event, participants, series)
├── migration_event_history.sql      # Таблица event_history
├── migration_lock_fix.sql           # locked_by: Integer → String
├── migration_event_participants.sql # Участники мероприятий
├── migration_event_series.sql       # Серии повторяющихся мероприятий + исключения
└── migration_events_extended.sql    # events: duration, organizer_type, series_id

deploy/
├── deploy.py            # Скрипт деплоя (test/prod), инкремент patch + rollback при ошибке
├── .env.test            # Конфиг тестовой среды (COOKIE_DOMAIN='45.90.217.225')
├── .env.prod            # Конфиг продакшена (COOKIE_DOMAIN='bot.dlab.run')
├── nginx/
│   ├── test.conf        # Anti-cache headers, SSE proxy
│   └── prod.conf        # SSL + anti-cache
└── systemd/             # web-admin.service (prod), web-admin-test.service (test)
```

## Паттерны проекта

### Авторизация
- Auth middleware проверяет сессию для ВСЕХ запросов (кроме публичных)
- Декораторы `@admin_required` / `@auth_required` **УДАЛЕНЫ** — middleware берёт на себя
- `@require_csrf` — декоратор CSRF проверки (POST/PUT/DELETE), совместимый с multipart
- Rate limiter: 5 запросов/минуту на вход
- Cookie: `admin_token` (httponly) + `csrf_token` (js-readable), domain из `COOKIE_DOMAIN`
- Сессии в PostgreSQL, **rolling session** (TTL обновляется при каждом запросе через `update_session_expiry()`)
- Session validation через JOIN (1 запрос вместо 2)
- `check_auth` / `users/me` — доступны всем ролям (admin + user)
- CRUD маршруты — через middleware (roles не проверяются на backend, только на frontend)
- **Login по логину или MAX ID**: `get_user_by_login()` ищет сначала по `max_id` (если число), потом по `username`, потом по `name`
- **"Запомнить меня"**: checkbox на форме логина, TTL сессии 30 дней (720ч) вместо 24ч

### Frontend auth flow
- `checkAuth()` — ЕДИНСТВЕННЫЙ источник правды для `isAuthenticated`
- `login()` вызывает `checkAuth()` после POST /admin/login (не ставит isAuthenticated сам)
- `login()` отправляет `{ login, password, remember_me }` (поле text, не number)
- `checkAuth()` → `loadCurrentUser()` → `showMain()` → `applyRoleRestrictions()` → `navigateTo()`
- `applyRoleRestrictions()` показывает/скрывает "Администрирование" в зависимости от роли
- `logout()` сбрасывает: SSE (`disconnectSSE()`), now-line таймер (`calStopNowLineTimer()`), `_preloaded`, `cacheInvalidateAll()`, `localStorage.dash_cache`, раскрытие меню, store

### SPA routes (два списка!)
- `SPA_PATHS` в `server.py` (для serving index.html)
- `spa_prefixes` в `auth.py` (для пропуска auth)
- **ДОЛЖНЫ** содержать новый путь. Иначе: 404 или 401
- Текущие: `/`, `/panel/`, `/admin/`, `/admin/users/`, `/admin/organizers/`, `/admin/locations/`, `/admin/logs/`, `/conferences/`, `/conferences/completed/`, `/calendar/`, `/events/`, `/events/completed/`, `/settings/`, `/settings/general/`, `/settings/profile/`

### Роли пользователей
- Модель User: поле `status` = `'admin'` или `'user'`
- Auth middleware не различает roles — проверяет только авторизован/не авторизован
- CRUD маршруты доступны всем ролям — role-based restrictions ТОЛЬКО на frontend
- `applyRoleRestrictions()` скрывает "Администрирование" для role='user'
- Маршруты, требующие admin-only, проверяют `request['user'].status`自主но

### Аудит изменений VKS
- Модель Event: `last_changed_by`, `last_changed_at`, `last_change_action`
- Заполняется автоматически при create/update/delete/complete/uncomplete
- Frontend показывает "Кто/когда/что изменил" в модалке редактирования

### Batch загрузка документов
- `get_documents_by_event_ids(event_ids)` — 1 запрос вместо N (решает N+1)
- `WHERE event_id = ANY($1)` — PostgreSQL array parameter
- Используется в `get_events_handler` и `preload_data`
- Возвращает список dicts `[{id, name, size}]` (не ORM objects)

### SSE для всех таблиц
- 4 канала PostgreSQL LISTEN/NOTIFY: `update_event`, `update_users`, `update_locations`, `update_organizers`
- Триггеры: `trg_notify_events`, `trg_notify_users`, `trg_notify_locations`, `trg_notify_organizers`
- **SSE подключается ТОЛЬКО после успешного `checkAuth()`** (не при загрузке страницы)
- `disconnectSSE()` — закрывает EventSource при logout
- Frontend: `sse.js` обновляет store и перерисовывает активные страницы

### Типы мероприятий
- Конфиг `app/event_types.py`: `ALLOWED_TYPES` — словарь с label, color, css_class
- 5 типов: ВКС, Совещание, Встреча, Заседание, Приём
- Валидация при create/update через `validate_event_type()`
- CSS цвета: `.type-vks` (accent), `.type-meeting` (success), `.type-session` (warning), `.type-board` (danger), `.type-reception` (fg-muted)
- VKS доска фильтрует только `type === 'ВКС'` — остальные типы на странице Мероприятий

### Страница Мероприятий
- **SPA route**: `/events/` (текущие), `/events/completed/` (завершённые)
- **Sidebar**: группа «Мероприятия» → Текущие / Завершённые
- **Текущие**: groups по датам (Пропущенные/Сегодня/Завтра/Послезавтра/Скоро), quick-filter, stats карточки (с `exclude_type=ВКС`)
- **Завершённые**: единый список "Завершённые" без группировки, stats карточки скрыты, заголовок показывает total из stats
- **Filter-bar**: Тип (select), Дата (день/месяц/год), Организатор, Локация, Описание
- **API**: `GET /admin/api/events?status=active&exclude_type=ВКС&limit=10000` (Текущие) или `limit=50` (Завершённые)
- **Кэш**: `_dataCache.eventsActive` / `_dataCache.eventsCompleted` — in-memory, включая stats
- **Текущие**: полная загрузка одним запросом, фильтрация client-side
- **Завершённые**: пагинация по 50, фильтрация server-side, stats загружаются с сервера

### Модалка VKS/Мероприятий — загрузка данных
- `openEditEventModal(id)` загружает событие через `GET /api/events/{id}/single` (не из `store.allEvents`)
- `loadEventSelects()` загружает organizers/locations из `store` (preloader), с fallback на прямой fetch
- `_currentEvent` — текущее загруженное событие (используется в save, lock, series)

### Страница VKS (ВКС)
- **SPA route**: `/conferences/` (активные), `/conferences/completed/` (завершённые)
- **Sidebar**: группа «ВКС» → Текущие / Завершённые
- **Текущие**: groups по датам (Пропущенные/Сегодня/Завтра/Послезавтра/Скоро), quick-filter, stats карточки
- **Завершённые**: единый список "Завершённые" без группировки, заголовок показывает total из stats
- **Filter-bar**: Дата (день/месяц/год), Организатор, Локация, Описание
- **API**: `GET /admin/api/events?status=active&type=ВКС&limit=10000` (Текущие) или `limit=50` (Завершённые)
- **Кэш**: `_dataCache.vksActive` / `_dataCache.vksCompleted` — in-memory, включая stats
- **Текущие**: полная загрузка одним запросом, фильтрация client-side
- **Завершённые**: пагинация по 50, фильтрация server-side, stats загружаются с сервера
- **Переключение страниц**: рендер из кэша мгновенно, без fetch

### Архитектура загрузки данных
```
Страница              | Загрузка              | Фильтрация      | SSE update
──────────────────────┼───────────────────────┼─────────────────┼─────────────────────
VKS Текущие           | Полная (limit=10000)  | Client-side     | Полный re-fetch
VKS Завершённые       | Пагинация (limit=50)  | Server-side     | Fetch до количества
Мероприятия Текущие   | Полная (limit=10000)  | Client-side     | Полный re-fetch
Мероприятия Завершённые| Пагинация (limit=50)  | Server-side     | Invalidate + re-fetch
Dashboard             | Один endpoint         | Нет              | Fetch → cacheSet
Календарь             | Диапазон дат (±20д)   | Client-side      | Invalidate → re-fetch
Справочники           | Полная загрузка       | Нет              | Fetch → cacheSet
```

### Единый in-memory кэш (`cache.js`)
- **Объект**: `_dataCache` — хранит данные всех страниц
- **Ключи**: `vksActive`, `vksCompleted`, `eventsActive`, `eventsCompleted`, `dashboard`, `locations`, `organizers`, `users`, `calendar`
- **API**: `cacheGet(page)`, `cacheSet(page, data)`, `cacheInvalidate(page)`, `cacheIsValid(page, ttl)`, `cacheInvalidateAll()`
- **TTL**: 5 минут (`CACHE_TTL`)
- **Поток**: вход → `cacheIsValid()`? → render из кэша / fetch → `cacheSet()` → render
- **SSE**: fetch → `cacheSet()` → render (только если страница видима)
- **Logout**: `cacheInvalidateAll()` + `localStorage.removeItem('dash_cache')`
- **Preloader**: `restoreFromCache()` читает `localStorage.dash_cache` → `cacheSet('locations'/'organizers')` для быстрого старта

### Конфликт имён VKS vs Мероприятия
- VKS модалка: `openAddEventModal`, `openEditEventModal`, `closeEventModal`, `saveEvent`
- Мероприятия модалка: `evtOpenAddModal`, `evtOpenEditModal`, `evtCloseModal`, `evtSaveEvent`
- **Никогда не переименовывать** функции VKS — они вызываются из calendar.js, dashboard.js, vks-board.js
- script load order: event-modal.js (761) → events.js (770) → print.js (771)

### API events — серверная пагинация + кэш
- `GET /admin/api/events` возвращает `{events: [...], has_more, next_cursor_date, next_cursor_time, next_cursor_id}`
- **Cursor-based пагинация**: `?cursor_date=&cursor_time=&cursor_id=` для детерминированного порядка
- **Серверные фильтры**: `?status=active/completed`, `?type=ВКС`, `?exclude_type=ВКС`, `?organizer_id=`, `?location_id=`, `?search=`, `?from=&to=`
- **Одно событие**: `GET /admin/api/events/{id}/single` — для SSE и модалки
- **Stats**: `GET /admin/api/events/stats?status=active&type=ВКС&exclude_type=ВКС` — COUNT запросы (O(1)), поддерживает `exclude_type`
- **Dashboard**: `GET /admin/api/dashboard` — агрегаты + today/soon + locations + chart
- **Dashboard chart**: `GET /admin/api/dashboard/chart?period=month&year=&month=` — для month/all
- Backend лимит: `min(limit, 10000)` — макс 10000 событий за запрос

### Кэширование (единый in-memory кэш)
- **Единый объект**: `_dataCache` в `cache.js` — все страницы читают/пишут через `cacheGet`/`cacheSet`
- **VKS Текущие/Мероприятия Текущие**: полная загрузка, кэш = все события + stats, фильтрация client-side
- **VKS Завершённые/Мероприятия Завершённые**: пагинация, кэш накапливает страницы + stats (total count), фильтрация server-side
- **Dashboard**: один endpoint `/api/dashboard`, кэш = агрегаты + events
- **Справочники**: `localStorage['dash_cache']` — locations + organizers (быстрый старт)
- **After save**: инвалидация всех кэшей → `renderVksBoard()` загружает свежие данные
- **Logout**: `cacheInvalidateAll()` + `localStorage.removeItem('dash_cache')`
- **SSE**: fetch → `cacheSet()` → render (только если страница видима)

### SSE — обновление страниц
- **`sseRefreshPage()`** — единая функция для всех страниц (VKS, Events, Dashboard, Calendar)
- **Hash check**: `_sseRerenderFromCache()` сравнивает hash по `id + completed + locked_by + date + time + description`. `force=true` пропускает проверку (SSE обновление всегда с `force=true`)
- **VKS / Events**: один fetch `events + stats` параллельно → `cacheSet()` → render
- **Dashboard**: fetch `/api/dashboard` → `cacheSet()` → `renderDashboard()`
- **Calendar**: `cacheInvalidate('calendar')` → `renderCalendar(false)`
- **Справочники**: `_refreshLocations/Organizers/Users` → `cacheSet()` + обновление `store`
- **Modal guard**: SSE пропускается при открытой модалке (`event-modal.show`). Закрытие модалки → unlock PUT → SSE event → `sseRefreshPage()`
- **After save**: `saveEvent()` → `closeEventModal()` → unlock → SSE → `sseRefreshPage()`. Без ручной инвалидации кэша

### Печать мероприятий
- `GET /admin/api/events/print?type=&from=&to=` — JSON с событиями + участниками
- Frontend: `openPrintModal()` → fetch → `window.open()` + `print()`
- Формат: таблица с #, дата, время, длит., тип, описание, участники

### VKS Modal — Compact Flat дизайн
- Модалка вынесена в partial: `app/static/partials/event-modal.html`
- Загружается async через `app.js` → `_modalsLoaded` promise
- Структура: accent-bar (4px градиент) → header (статус-бейдж + заголовок + icon-btn info/delete/close) → body (form-separators) → footer (btn-ghost + pill complete + btn-primary)
- Accent bar цвет по статусу: default (accent gradient), completed (green), missed (red)
- Кнопка «Перейти» (url-go-btn) рядом с полем ссылки — появляется если есть URL
- Кнопка удаления: standalone кнопка `.doc-card-delete` справа от карточки документа
- Кнопка «Добавить документ» — 100% ширины под списком документов

### VKS Modal — документы (scroll)
- Список документов `.doc-card-list` — `overflow-y: auto` + `scrollbar-width: none`
- Desktop: `max-height: 310px` (~4.5 документа), Mobile: `max-height: 140px` (~2 документа)
- Gradient fade: `.doc-scroll-fade-top` / `.doc-scroll-fade-bottom` — реальные DOM-элементы
- JS `_updateDocScrollGradients()`: проверяет `scrollHeight > clientHeight`, toggle `.is-visible`
- Градиент top исчезает при `scrollTop <= 1`, bottom при прокрутке до конца
- **Мобильный**: `.doc-card-info` flex-row (icon + name + size), name обрезается через `text-overflow: ellipsis`

### VKS Modal — CSS архитектура
- Все стили Compact Flat в `event-modal.css` — отдельный файл после `responsive.css`
- Причина: `responsive.css` содержит базовые `.form-row { flex-direction: column }` которые перезаписывают `.event-modal-flat .form-row { flex-direction: row }`
- `.event-modal-flat` полностью переопределяет: `.modal-header`, `.modal-body`, `.modal-footer`, `.form-group`, `.form-group label/input/select/textarea`, `.form-separator`, `.form-row`
- Header/footer: `background: var(--bg-elevated)` — не прозрачные
- `border: none` на `.event-modal-flat` — убрана рамка контейнера
- `overflow: hidden` на `.event-modal-flat` — accent bar обрезается по border-radius

### Partial загрузка модалок
- Все модалки (VKS, User, Organizer, Location) вынесены в `app/static/partials/*.html`
- `app.js` загружает их последовательно через `_modalsLoaded` promise
- JS функции открытия модалок (`openAdd*`, `openEdit*`) — async, ждут `await _modalsLoaded`
- Confirm overlay (удаление) остался в `index.html` — он общий для всех CRUD

### CRUD-абстракция
- `createCrudModule(config)` в `utils.js` — фабрика CRUD-операций
- Генерирует: `load()`, `openAdd()`, `openEdit()`, `save()`, `delete()`, `openConfirm()`, `filter()`, `resetFilters()`
- Принимает конфиг: `name`, `api`, `storeKey`, `fields[]`, `buildPayload()`, `render()`, `stats()`, `filters[]`, `messages`
- Используется: `users.js`, `organizers.js`, `locations.js`
- Обратная совместимость — глобальные функции как алиасы (onclick в HTML)

### ConfirmManager
- Единый объект `ConfirmManager` в `utils.js` — управляет модалкой подтверждения
- `open(type, id, name, onConfirm)` / `close()` / `dispatch()`
- Заменяет 4 глобальные переменные (`deletingId/OrgId/LocId/EventId`)
- `closeConfirm()` / `confirmDelete()` — алиасы для обратной совместимости

### Store — централизованное хранилище
- `window.store` (НЕ `window.store`!) = `{ allEvents, allLocations, allOrganizers, allUsers }` в `utils.js`
- Все load/SSE/preload функции пишут в `store.xxx`
- CRUD модули используют `storeKey` для автоматической записи в store
- Нет рассинхронизации между данными (ранее: `let allXxx` + `window.allXxx` — два хранилища)
- **Важно**: `store` — глобальная переменная, доступная как `store.xxx` (не `window.store`)

### Утилиты (utils.js)
- `store` — централизованное хранилище данных (allLocations, allOrganizers, allUsers)
- `getCsrfToken()` — CSRF из cookie
- `localDateStr(d)` — формат `YYYY-MM-DD`
- `MONTHS_FULL/SHORT/GENITIVE` — массивы месяцев
- `ConfirmManager` — управление confirm-overlay
- `createCrudModule(config)` — CRUD-абстракция
- `getOrganizerName(id)` / `getLocationName(id)` — поиск по store
- `getDocCardMeta(ext)` — `{cls, label}` для иконок документов
- `_findScrollParent(el)` — поиск scroll-контейнера через CSS overflow

### Mobile оптимизация
- Гамбургер-меню для навигации (<768px)
- Компактные карточки статистики (4 колонки → 2 на мобильном)
- Сворачиваемые фильтры (filter-bar)
- Компактные модалки, таблицы, формы
- Независимый per-page скролл (`.content-area` flex + `.page.active` overflow-y)

### CSS архитектура — порядок загрузки
- `responsive.css` загружается ПОСЛЕДНИМ базовым CSS
- `event-modal.css` загружается ПОСЛЕ responsive.css — Compact Flat стили выигрывают по specificity
- `calendar.css` загружается ПОСЛЕ responsive.css — стили календаря не конфликтуют с другими
- Текущий порядок: base → layout → components → tables → modals → logs → vks → **events** → settings → filters → dashboard → responsive → **event-modal** → **calendar**

### Preloader
- `initPreloader()` вызывается в `app.js` перед `checkAuth()` — восстанавливает справочники из `localStorage.dash_cache` → `cacheSet()`
- `preloadAllData()` — загружает ТОЛЬКО locations + organizers (`/admin/api/preload`), кэширует в `cacheSet()` + localStorage
- `_preloaded` флаг предотвращает повторную загрузку. Сбрасывается при logout
- **`store.allEvents` УБРАН** — каждая страница сама запрашивает данные

### Store — централизованное хранилище
- `store` — глобальная переменная = `{ allLocations, allOrganizers, allUsers }` в `utils.js`
- **`store.allEvents` удалён** — данные загружаются постранично через `/api/events`
- CRUD модули используют `storeKey` для автоматической записи в store
- События хранятся в `_dataCache` (единый in-memory кэш), НЕ в store

### Frontend паттерны
- `esc()` — экранирование HTML-сущностей для onclick-строк
- `showToast()` — уведомления (success/error/warning)
- Spinner на все CRUD-операции (submit buttons disabled + "Выполняю...")
- Порядок операций: `await load*()` → `close*Modal()` → `showToast()`
- `event.stopPropagation()` — кнопки delete НЕ должны открывать edit modal
- `overflow: clip` на таблицах — красивые углы без создания nested scroll context
- Hidden form inputs при замене UI (checkbox→button): `<input>`必须 сохраняться для FormData
- `getDocCardMeta(ext)` — возвращает `{cls, label}` для иконок документов (в utils.js)
- `getOrganizerName(id)`, `getLocationName(id)` — в utils.js (НЕ в vks-board.js)

### Версионирование
- `index.html` содержит `?v=__VERSION__` (плейсхолдер)
- `server.py` читает `version.json` при старте, подставляет в HTML
- `deploy.py` инкрементирует patch в VERSION файле автоматически
- nginx: `/static/` — `Cache-Control: public, max-age=86400`, `/admin/api/` — `no-store, no-cache`

### Ошибки в маршрутах
```python
# Маршруты БЕЗ декораторов auth (middleware проверяет)
async def handler(request: web.Request) -> web.Response:
    try:
        user = request['user']  # ← устанавливается middleware
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)
```

### CRUD паттерн (database)
```python
# reading → database/requests.py
async def get_items():
    async with async_session() as session:
        result = await session.scalars(select(Model))
        return list(result)

# writing → database/sending.py
async def add_item(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    new_obj = Model(id=new_id, **kwargs)
    async with async_session() as session:
        session.add(new_obj)
        await session.commit()
        return new_id
```

### Multipart (события с файлами)
Events принимают `multipart/form-data`:
- Поля: type, date, time, duration, organizer_id, organizer_type, location_id, url, description, completed, notification, participants (JSON)
- Валидация: type (ALLOWED_TYPES), date (обязательно), time (обязательно), location_id (обязательно), organizer_id (обязательно)
- Файлы: field name = 'files' (множественные)
- `keep_doc_ids` — запятые ID документов для сохранения при обновлении

### История изменений VKS (таймлайн)
- Таблица `event_history` — append-only лог всех изменений (id, event_id, user_id, timestamp, action, changes JSONB)
- Модуль `app/event_logger.py`: `capture_event_state()`, `log_event_change()`, `get_event_history()`
- Действия: create, update, complete, uncomplete, delete, doc_remove
- `doc_remove` — отдельное действие при удалении документов без изменения полей формы
- Changes JSONB: `{field: {old, new}, documents: {added: [...], removed: [...]}}`
- API: `GET /admin/api/events/{event_id}/history`
- Frontend: drawer overlay таймлайн (раскрывается от правого края модалки, 3/4 ширины)
- Drawer: `position: fixed`, JS вычисляет позицию по `getBoundingClientRect()` modal-body
- Цвета точек по action: create (accent), update (muted), complete (success), uncomplete (warning), delete/doc_remove (danger)
- `overflow: hidden` на `.event-modal-flat` clip accent bar — drawer вынесен на уровень `.modal-overlay`
- Dim body: `::after` pseudo-element с `backdrop-filter: blur(2px)` (затрагивает все элементы формы)
- `padding-bottom` на scroll-контейнере не работает — используем `::after` pseudo-element

### Блокировка VKS при редактировании
- Поля Event: `locked_by` (String/UUID), `locked_at` (DateTime) — хранят кто блокирует
- API: `PUT /admin/api/events/{id}/lock` / `PUT /admin/api/events/{id}/unlock`
- Auto-timeout: lock'ы старше 10 минут снимаются при GET /events + при старте сервера (`cleanup_stale_locks`)
- Lock при открытии модалки: `openEditEventModal()` → PUT /lock → если занято: read-only + toast + banner
- Unlock при закрытии: `closeEventModal()` → PUT /unlock (только если текущий пользователь владеет lock)
- Иконка замка 🔒 на карточках VKS и дашборде (реалтайм через SSE)
- Banner "Редактирует: ..." в модалке (динамическое создание если partial не загружен)
- Disabled CSS: `.pill-btn:disabled`, `.icon-btn:disabled`, `.doc-card-delete:disabled` — opacity 0.4, pointer-events none
- Lock/unlock — отдельные эндпоинты, НЕ проходят через update_handler → в историю не попадают
- Preload endpoint возвращает `locked_by`, `locked_by_id`, `locked_at`
- SSE: lock/unlock обновляет events → триггер → все клиенты видят замок на карточках

### Календарь VKS
- **Файлы**: `calendar.js` (~800 строк) + `calendar.css` (~500 строк)
- **Маршрут**: `/calendar/` (SPA route в `router.js`, nav-item в sidebar, page div `#page-calendar`)
- **Структура DOM**: `cal-container` → `cal-toolbar` + `cal-week-label` + `cal-panel` (flex-column)
  - `cal-panel` содержит: SVG shadow + SVG stroke → `cal-day-tabs` (flex, z-index:2) → `cal-grid-area`
  - `cal-grid-area`: `cal-rooms-header` (заголовки колонок) + `cal-wrap` (прокручиваемая сетка)
- **Flex chain**: `cal-container` → `cal-panel` (flex:1 + min-height:0) → `cal-wrap` (overflow-y:auto + flex:1). Без min-height:0 прокрутка не работает
- **Overflow chain (критично)**: `body { overflow: hidden }` (base.css:311) → `.content-area { overflow: hidden }` (layout.css) → `.page#page-calendar.active { overflow: hidden; padding: 0 }` (calendar.css:2-4). **БЕЗ overflow:hidden на `.page` календарь «разваливается»** — `.cal-wrap`失去 constrained height
- **renderCalendar(full)**: флаг `full=true` пересоздаёт весь DOM (toolbar+tabs+grid), `full=false` только обновляет вкладки и сетку. Вызывается при переключении дня, `full=true` при навигации (prev/next week, goToday)
- **initCalendar()**: preloadAllData() с fallback на loadAllEvents() → renderCalendar(true) → calStartNowLineTimer() → addEventListener('transitionend') на `cal-day-tabs`. Динамические элементы создаются внутри renderCalendar
- **Toolbar**: стрелки навигации + кликабельный label «Месяц Год» (picker с select'ами) + «Сегодня» + «+ Добавить». На мобайле: `+` справа, spacer скрыт
- **Тень (SVG feDropShadow)**: CSS `filter: drop-shadow()` **ЗАБРОШЕН** — `body { overflow: hidden }` обрезает. SVG `feDropShadow` с `overflow: visible`
  - SVG shadow path: `fill` (цвет активной вкладки) + filter (feGaussianBlur, stdDeviation=5, dy=3, alpha=0.3)
  - **SVG stroke path**: отдельный `<path id="cal-stroke-path">` в `<svg class="cal-stroke-svg">` (z-index:10). Обводка `border-strong` вокруг всего контура. Outset координаты (+1px наружу) чтобы stroke не попадал под DOM
  - A-дуги: `rt=10` (скругление вкладки), `rp=12` (скругление панели), `rl` (левый угол шапки)
  - `_calUpdateShadow()` строит оба path, `_calUpdateShadowFill()` обновляет fill + stroke
  - `transitionend` listener на `cal-day-tabs` (свойство `padding`) — пересчёт после анимации
- **Вкладки (tabs)**: `align-items: flex-end` на `.cal-day-tabs` — неактивные вкладки короче (padding:6px/8px), активная выше (padding:10px/12px). Без `flex-end` браузер растягивает все вкладки по высоте (`stretch` default)
- **Hover**: JS `position: fixed` через `getBoundingClientRect()` — CSS-only hover expansion невозможен из-за overflow цепочки. Split-события расширяются влево. Clamp inside cal-wrap boundaries
- **Now-line**: `setTimeout` вместо `setInterval`, DOM кэшируется (`_calNowLines[]`, `_calNowTimeLabel`), обновляется только `style.top`
- **События**: absolute позиционение внутри relative `.cal-col`, `findOverlapGroups()` для side-by-side overlap, цвет по типу (type-vks, type-meeting, type-session, type-board, type-reception)
- **Заголовки колонок**: `.cal-rooms-header` — отдельный статический flex-элемент над `.cal-wrap` (не sticky)
- **Mobile** (`_calIsMobile()`): компактные pill-вкладки (день недели + число), фильтр залов (чипы), одноколоночная сетка, свайп для переключения дней, `+` в тулбаре справа
- **Навигация**: `_calSetActiveForWeek()` — при переходе на текущую неделю выбирается текущий день (не понедельник)

## Правила разработки
1. **Деплой по веткам**: `develop` → test, `main` → prod
2. **Логирование**: всегда `loguru.logger` (никогда `print` или `logging`)
3. **Разработка**: использовать test_db
4. **Кодировка**: UTF-8
5. **Любое изменение кода** — сначала план, потом реализация после подтверждения
6. **Язык**: все коммиты, сообщения, планы и пояснения — на русском языке

## Ссылки
- Тест: `http://45.90.217.225:8082/admin` (nginx → порт 8082)
- Продакшен: `https://bot.dlab.run/admin` (nginx → порт 8081)
- GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Конфигурация (config.py)
- SSH_SERVER, SSH_USER_NAME, SSH_USER_PASSWORD — SSH туннель (опционально)
- DB_USER, DB_USER_PASSWORD, DB_NAME, DB_HOST, DB_PORT — PostgreSQL
- WEBAPP_HOST, WEBAPP_PORT — веб-сервер
- DEFAULT_ADMIN_PASSWORD — пароль admin по умолчанию
- COOKIE_DOMAIN — домен для cookie (nginx proxy: IP или домен)
- BOT_LOGS_DIR — директория логов бота
- PROJECT_ROOT — корень проекта (авто)
