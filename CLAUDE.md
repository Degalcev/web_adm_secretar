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
├── auth.py              # Auth middleware, CSRF (multipart), rate limiting, cookie domain
├── server.py            # Точка входа aiohttp (middleware + SPA + API + static + cleanup)
├── sse_listener.py      # SSE listener (PostgreSQL LISTEN/NOTIFY → broadcast)
├── routes/
│   ├── users.py         # CRUD пользователей + смена пароля
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов (panel + bot)
│   ├── vks.py           # CRUD событий ВКС + dashboard stats
│   ├── documents.py     # CRUD документов (download/upload/delete)
│   ├── preload.py       # Preload API (events + organizers + locations)
│   └── sse.py           # SSE endpoint (/admin/api/events/stream)
└── static/
    ├── index.html       # SPA entry point (?v=__VERSION__ → подставляется из version.json)
    ├── css/             # base, layout, components, tables, modals, logs, vks, settings, filters, responsive
    └── js/              # utils, auth, router, navigation, users, organizers, locations, logs, vks, settings, dashboard, profile, preloader, sse, updater, app

database/
├── models.py            # User, Organizer, Location, Session, Event, Document
├── requests.py          # Запросы (чтение)
└── sending.py           # Операции (запись)

deploy/
├── deploy.py            # Скрипт деплоя (test/prod), инкремент patch автоматический
├── .env.test            # Конфиг тестовой среды (включая COOKIE_DOMAIN)
├── .env.prod            # Конфиг продакшена (включая COOKIE_DOMAIN)
├── nginx/               # test.conf (anti-cache headers), prod.conf
└── systemd/             # web-admin.service, web-admin-test.service
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
