# CLAUDE.md — Правила проекта web_adm_secretar

## ГЛАВНОЕ ПРАВИЛО
**Любое изменение кода требует планирования.**
- Сначала создаём план (spec/plan файл в `docs/compose/plans/`).
- Реализация начинается ТОЛЬКО после подтверждения плана пользователем.
- Исключение: явные баг-фиксы с одной строкой изменения.

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
├── event_logger.py      # Логирование изменений VKS (сравнение состояний, запись в event_history)
├── sse_listener.py      # SSE listener (PostgreSQL LISTEN/NOTIFY → broadcast)
├── routes/
│   ├── users.py         # CRUD пользователей + смена пароля + /me + /auth/check
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов (panel + bot)
│   ├── vks.py           # CRUD событий ВКС + batch документы + audit + lock/unlock + history + lock/unlock + history
│   ├── documents.py     # CRUD документов (download/upload/delete)
│   ├── preload.py       # Preload API (events + organizers + locations + lock data одним запросом)
│   └── sse.py           # SSE endpoint (/admin/api/events/stream, без auth)
└── static/
    ├── index.html       # SPA entry point (653 строк, ?v=__VERSION__)
    ├── favicon.svg      # Иконка
    ├── partials/
    │   ├── vks-modal.html       # VKS modal partial (Compact Flat)
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
    │   ├── logs.css          # Логи (elevated фон контейнера)
    │   ├── filters.css       # Filter-bar компонент, select фильтры
    │   ├── settings.css      # Страницы настроек/профиля
    │   ├── responsive.css    # Медиа-запросы для всех страниц (⚠️ ПОСЛЕДНИЙ БАЗОВЫЙ)
    │   └── vks-modal.css     # Compact Flat стили модалок + drawer overlay таймлайна (ПОСЛЕ responsive.css!)
    └── js/
        ├── utils.js          # Store, ConfirmManager, CRUD-абстракция, getCsrfToken(), localDateStr(), MONTHS_*
        ├── auth.js           # Логин/выход/checkAuth()
        ├── router.js         # SPA роутинг (handleAuthState)
        ├── navigation.js     # Навигация, мобильное меню, role restrictions
        ├── preloader.js      # preloadAllData()
        ├── sse.js            # SSE обработчики (4 канала: events/users/locations/organizers)
        ├── dashboard.js      # Дашборд (renderDashLocations — НЕ collides с locations.js)
        ├── vks-filters.js    # VKS: фильтры, загрузка данных, статистика
        ├── vks-board.js      # VKS: рендеринг карточек, иконки, документы
        ├── vks-modal.js      # VKS: модалка (открытие/сохранение/документы/history/lock)
        ├── vks-actions.js    # VKS: завершение, удаление, подтверждения
        ├── users.js          # CRUD пользователей (через createCrudModule)
        ├── organizers.js     # CRUD организаторов (через createCrudModule)
        ├── locations.js      # CRUD локаций (через createCrudModule)
        ├── logs.js           # Просмотр логов
        ├── settings.js       # Настройки (THEMES_META + renderThemeGrid)
        ├── profile.js        # Профиль пользователя
        ├── updater.js        # Обновление версии
        └── app.js            # Инициализация, загрузка partials, кнопка «Наверх»

database/
├── models.py            # User, Organizer, Location, Session, Event (audit+lock), EventHistory, Document
├── requests.py          # Запросы (чтение, batch, cleanup_stale_locks)
├── sending.py           # Операции (запись, lock_event, unlock_event)
├── migration_event_history.sql  # Таблица event_history
└── migration_lock_fix.sql       # locked_by: Integer → String

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
- Сессии в PostgreSQL, TTL 24ч, автоочистка при старте + каждые 6ч
- Session validation через JOIN (1 запрос вместо 2)
- `check_auth` / `users/me` — доступны всем ролям (admin + user)
- CRUD маршруты — через middleware (roles не проверяются на backend, только на frontend)

### Frontend auth flow
- `checkAuth()` — ЕДИНСТВЕННЫЙ источник правды для `isAuthenticated`
- `login()` вызывает `checkAuth()` после POST /admin/login (не ставит isAuthenticated сам)
- `checkAuth()` → `loadCurrentUser()` → `showMain()` → `applyRoleRestrictions()` → `navigateTo()`
- `applyRoleRestrictions()` показывает/скрывает "Администрирование" в зависимости от роли
- `logout()` сбрасывает раскрытие меню (`.nav-group.open`)

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
- SSE endpoint без авторизации (auth_required убран)
- Frontend: `sse.js` обновляет store и перерисовывает активные страницы

### VKS Modal — Compact Flat дизайн
- Модалка вынесена в partial: `app/static/partials/vks-modal.html`
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
- Все стили Compact Flat в `vks-modal.css` — отдельный файл после `responsive.css`
- Причина: `responsive.css` содержит базовые `.form-row { flex-direction: column }` которые перезаписывают `.vks-modal-flat .form-row { flex-direction: row }`
- `.vks-modal-flat` полностью переопределяет: `.modal-header`, `.modal-body`, `.modal-footer`, `.form-group`, `.form-group label/input/select/textarea`, `.form-separator`, `.form-row`
- Header/footer: `background: var(--bg-elevated)` — не прозрачные
- `border: none` на `.vks-modal-flat` — убрана рамка контейнера
- `overflow: hidden` на `.vks-modal-flat` — accent bar обрезается по border-radius

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
- `window.store = { allEvents, allLocations, allOrganizers, allUsers }` в `utils.js`
- Все load/SSE/preload функции пишут в `store.xxx`
- CRUD модули используют `storeKey` для автоматической записи в store
- Нет рассинхронизации между данными (ранее: `let allXxx` + `window.allXxx` — два хранилища)

### Утилиты (utils.js)
- `store` — централизованное хранилище данных
- `getCsrfToken()` — CSRF из cookie
- `localDateStr(d)` — формат `YYYY-MM-DD`
- `MONTHS_FULL/SHORT/GENITIVE` — массивы месяцев
- `ConfirmManager` — управление confirm-overlay
- `createCrudModule(config)` — CRUD-абстракция

### Mobile оптимизация
- Гамбургер-меню для навигации (<768px)
- Компактные карточки статистики (4 колонки → 2 на мобильном)
- Сворачиваемые фильтры (filter-bar)
- Компактные модалки, таблицы, формы
- Независимый per-page скролл (`.content-area` flex + `.page.active` overflow-y)

### CSS архитектура — порядок загрузки
- `responsive.css` загружается ПОСЛЕДНИМ базовым CSS
- `vks-modal.css` загружается ПОСЛЕ responsive.css — Compact Flat стили выигрывают по specificity
- Текущий порядок: base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → **vks-modal**

### Frontend паттерны
- `esc()` — экранирование HTML-сущностей для onclick-строк
- `showToast()` — уведомления (success/error/warning)
- Spinner на все CRUD-операции (submit buttons disabled + "Выполняю...")
- Порядок операций: `await load*()` → `close*Modal()` → `showToast()`
- `event.stopPropagation()` — кнопки delete НЕ должны открывать edit modal
- `overflow: clip` на таблицах — красивые углы без создания nested scroll context
- Hidden form inputs при замене UI (checkbox→button): `<input>`必须 сохраняться для FormData

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
- Поля: type, date, time, organizer_id, location_id, url, description, completed, notification
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
- `overflow: hidden` на `.vks-modal-flat` clip accent bar — drawer вынесен на уровень `.modal-overlay`
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

## Правила разработки
1. **Деплой по веткам**: `develop` → test, `main` → prod
2. **Логирование**: всегда `loguru.logger` (никогда `print` или `logging`)
3. **Разработка**: использовать test_db
4. **Кодировка**: UTF-8
5. **Любое изменение кода** — сначала план, потом реализация после подтверждения
6. **Язык**: все коммиты, сообщения, планы и пояснения — на русском языке

## Ссылки
- Тест: `http://45.90.217.225/admin` (nginx → порт 8082)
- Продакшен: `https://bot.dlab.run/admin` (nginx → порт 8080)
- GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Конфигурация (config.py)
- SSH_SERVER, SSH_USER_NAME, SSH_USER_PASSWORD — SSH туннель (опционально)
- DB_USER, DB_USER_PASSWORD, DB_NAME, DB_HOST, DB_PORT — PostgreSQL
- WEBAPP_HOST, WEBAPP_PORT — веб-сервер
- DEFAULT_ADMIN_PASSWORD — пароль admin по умолчанию
- COOKIE_DOMAIN — домен для cookie (nginx proxy: IP или домен)
- BOT_LOGS_DIR — директория логов бота
- PROJECT_ROOT — корень проекта (авто)
