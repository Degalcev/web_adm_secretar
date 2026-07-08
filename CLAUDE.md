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
├── sse_listener.py      # SSE listener (PostgreSQL LISTEN/NOTIFY → broadcast)
├── routes/
│   ├── users.py         # CRUD пользователей + смена пароля + /me + /auth/check
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов (panel + bot)
│   ├── vks.py           # CRUD событий ВКС + batch документы + audit
│   ├── documents.py     # CRUD документов (download/upload/delete)
│   ├── preload.py       # Preload API (events + organizers + locations одним запросом)
│   └── sse.py           # SSE endpoint (/admin/api/events/stream, без auth)
└── static/
    ├── index.html       # SPA entry point (?v=__VERSION__ → подставляется из version.json)
    ├── favicon.svg      # Иконка
    ├── css/
    │   ├── base.css          # CSS переменные, темы, typography
    │   ├── layout.css        # Sidebar, content-area, навигация, independent page scroll
    │   ├── components.css    # Кнопки, бейджи, формы, тултипы
    │   ├── tables.css        # Таблицы CRUD (overflow: clip для углов)
    │   ├── modals.css        # Модалки (единая структура: .modal → .modal-header + .modal-body + .modal-footer)
    │   ├── dashboard.css     # Дашборд карточки, VKS панели
    │   ├── vks.css           # VKS страницы (цветная полоска статуса, компактные документы)
    │   ├── logs.css          # Логи (elevated фон контейнера)
    │   ├── filters.css       # Filter-bar компонент, select фильтры
    │   ├── settings.css      # Страницы настроек/профиля
    │   └── responsive.css    # ⚠️ ПОСЛЕДНИЙ CSS — медиа-запросы для всех страниц
    └── js/
        ├── utils.js          # Утилиты: esc(), debounce(), showToast(), markSSESkipped()
        ├── auth.js           # Логин/выход/checkAuth()
        ├── router.js         # SPA роутинг (handleAuthState)
        ├── navigation.js     # Навигация, мобильное меню, role restrictions
        ├── preloader.js      # preloadAllData()
        ├── sse.js            # SSE обработчики (4 канала: events/users/locations/organizers)
        ├── dashboard.js      # Дашборд (renderDashLocations — НЕ collides с locations.js)
        ├── vks.js            # VKS страницы (board, фильтры, модалки, документы)
        ├── users.js          # CRUD пользователей
        ├── organizers.js     # CRUD организаторов
        ├── locations.js      # CRUD локаций
        ├── logs.js           # Просмотр логов
        ├── settings.js       # Настройки
        ├── profile.js        # Профиль пользователя
        ├── updater.js        # Обновление версии
        └── app.js            # Инициализация, кнопка «Наверх»

database/
├── models.py            # User (ФИО+username+role), Organizer, Location, Session, Event (audit), Document
├── requests.py          # Запросы (чтение, batch: get_documents_by_event_ids)
└── sending.py           # Операции (запись, cleanup_expired_sessions)

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
- Frontend: `sse.js` обновляет кэш и перерисовывает активные страницы

### VKS виджет — дизайн карточек
- Цветная полоска слева вместо бейджа статуса (completed/in-progress/missed)
- Компактные документы: иконки по расширению + "ещё N" кнопка-разворот
- Ссылка на встречу: иконка-кнопка рядом с документами
- Документы свёрнуты по умолчанию (макс. 4 видимых)
- Аудит: "Кто изменил" в footer модалки

### Мобильная оптимизация
- Гамбургер-меню для навигации (<768px)
- Компактные карточки статистики (4 колонки → 2 на мобильном)
- Сворачиваемые фильтры (filter-bar)
- Компактные модалки, таблицы, формы
- Независимый per-page скролл (`.content-area` flex + `.page.active` overflow-y)

### CSS архитектура — порядок загрузки
- `responsive.css` ОБЯЗАН быть ПОСЛЕДНИМ CSS файлом в `index.html`
- Иначе dashboard.css перезаписывает media queries
- Текущий порядок: base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive

### Frontend паттерны
- `esc()` — экранирование HTML-сущностей для onclick-строк
- `showToast()` — уведомления (success/error/warning)
- Spinner на все CRUD-операции (submit buttons disabled + "Выполняю...")
- Порядок операций: `await load*()` → `close*Modal()` → `showToast()`
- `event.stopPropagation()` — кнопки delete НЕ должны открывать edit modal
- `overflow: clip` на таблицах — красивые углы без создания nested scroll context
- Hidden form inputs при замене UI (checkbox→button): `<input>`必须 сохраняться для FormData
- Button IDs: `vks-complete-btn` (не `<input checkbox>`)

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
