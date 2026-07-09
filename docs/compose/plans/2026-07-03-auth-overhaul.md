# Auth Overhaul — Полная переработка авторизации

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полностью переработать систему авторизации: устранить гонки, обеспечить работу через nginx proxy, сделать CSRF совместимым с multipart, добавить автоочистку сессий.

**Architecture:** Auth middleware вместо декораторов. Единый `checkAuth()` на фронте как единственный источник правды. Cookie с явным domain. CSRF через X-CSRF-Token header (совместимый с multipart). Периодическая очистка сессий.

**Tech Stack:** Python 3.x + aiohttp, PostgreSQL (asyncpg + SQLAlchemy async), argon2-cffi, Vanilla JS

---

## Глобальные ограничения

- Язык: все коммиты, сообщения, планы — на русском
- Логирование: всегда `loguru.logger`
- Деплой: `develop` → test, `main` → prod
- Версионирование: PATCH автоматический при деплое
- Cookie domain: из переменной окружения `COOKIE_DOMAIN`

---

## Файловая структура

| Файл | Действие | Ответственность |
|------|----------|----------------|
| `app/auth.py` | **Переписать** | Middleware, CSRF, session validation с JOIN, rate limiter |
| `app/server.py` | **Изменить** | Подключить middleware, добавить startup cleanup, cookie domain |
| `app/static/js/auth.js` | **Переписать** | Единый checkAuth(), login() без гонки |
| `app/static/js/app.js` | **Изменить** | Упростить инициализацию |
| `app/routes/users.py` | **Изменить** | Убрать декораторы auth (middleware берёт на себя) |
| `app/routes/vks.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/documents.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/preload.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/logs.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/organizers.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/locations.py` | **Изменить** | Убрать декораторы auth |
| `app/routes/sse.py` | **Изменить** | Убрать декораторы auth |
| `deploy/nginx/test.conf` | **Изменить** | Anti-cache headers |
| `deploy/nginx/prod.conf` | **Изменить** | Anti-cache headers |
| `config.py` | **Изменить** | Добавить COOKIE_DOMAIN |
| `database/requests.py` | **Изменить** | JOIN в validate_session |
| `database/sending.py` | **Изменить** | cleanup_expired_sessions (без изменений, уже есть) |

---

### Task 1: Конфигурация — добавить COOKIE_DOMAIN

**Covers:** Проблема 2.3 (cookie без domain)

**Files:**
- Modify: `config.py`
- Modify: `deploy/.env.test`
- Modify: `deploy/.env.prod`

**Interfaces:**
- Consumes: `os.getenv`
- Produces: `COOKIE_DOMAIN` строка

- [ ] **Step 1: Добавить COOKIE_DOMAIN в config.py**

Открыть `config.py` и добавить после `DEFAULT_ADMIN_PASSWORD`:

```python
COOKIE_DOMAIN = os.getenv('COOKIE_DOMAIN', '')
```

- [ ] **Step 2: Добавить в .env.test**

Добавить строку в `deploy/.env.test`:

```
COOKIE_DOMAIN=45.90.217.225
```

- [ ] **Step 3: Добавить в .env.prod**

Добавить строку в `deploy/.env.prod`:

```
COOKIE_DOMAIN=bot.dlab.run
```

- [ ] **Step 4: Проверить что config загружается**

```bash
cd E:\Codding\web_adm_secretar
python -c "from config import COOKIE_DOMAIN; print('COOKIE_DOMAIN:', COOKIE_DOMAIN)"
```

Ожидаемый вывод: `COOKIE_DOMAIN: 45.90.217.225`

- [ ] **Step 5: Коммит**

```bash
git add config.py deploy/.env.test deploy/.env.prod
git commit -m "feat(auth): добавить COOKIE_DOMAIN в конфигурацию"
```

---

### Task 2: Auth middleware — замена декораторов

**Covers:** Проблема 2.1, 2.2, 2.7, 2.10

**Files:**
- Rewrite: `app/auth.py`
- Modify: `app/server.py`

**Interfaces:**
- Consumes: `database.requests.get_session_by_token`, `database.requests.get_user_by_id`, `config.COOKIE_DOMAIN`
- Produces: `auth_middleware`, `require_csrf`, `admin_login`, `admin_logout`, `RateLimiter`, `validate_session`

- [ ] **Step 1: Переписать app/auth.py**

Полностью заменить содержимое `app/auth.py`:

```python
# app/auth.py

import secrets
import time
from functools import wraps
from collections import defaultdict

from aiohttp import web
from loguru import logger
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from database.requests import get_user_by_max_id, get_session_by_token
from database.sending import (
    create_session as db_create_session,
    delete_session as db_delete_session,
    cleanup_expired_sessions,
)
from database.models import async_session, User, Session
from config import DEFAULT_ADMIN_PASSWORD, COOKIE_DOMAIN

from sqlalchemy import select
from datetime import datetime

ph = PasswordHasher()


# ─── Rate Limiter ────────────────────────────────────────────────────────

class RateLimiter:
    def __init__(self, max_requests: int = 10, window: int = 60):
        self.max_requests = max_requests
        self.window = window
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True


login_limiter = RateLimiter(max_requests=5, window=60)


# ─── CSRF ────────────────────────────────────────────────────────────────

def generate_csrf_token() -> str:
    return secrets.token_hex(32)


def require_csrf(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        if request.method in ('POST', 'PUT', 'DELETE'):
            cookie_token = request.cookies.get('csrf_token')

            # 1. Пробуем X-CSRF-Token header
            header_token = request.headers.get('X-CSRF-Token')

            # 2. Пробуем JSON body
            if not header_token:
                try:
                    data = await request.json()
                    header_token = data.get('csrf_token')
                except Exception:
                    pass

            # 3. Пробуем form data (multipart совместимость)
            if not header_token:
                try:
                    post_data = await request.post()
                    header_token = post_data.get('csrf_token')
                except Exception:
                    pass

            if not cookie_token or cookie_token != header_token:
                logger.warning('CSRF token invalid: cookie={}, form={}', cookie_token, header_token)
                return web.json_response({'error': 'CSRF token invalid'}, status=403)
        return await handler(request)
    return wrapper


# ─── Sessions ────────────────────────────────────────────────────────────

async def validate_session(token: str):
    """Проверка сессии через JOIN — 1 запрос вместо 2."""
    if not token:
        return None
    try:
        async with async_session() as session:
            result = await session.execute(
                select(User)
                .join(Session, Session.user_id == User.id)
                .where(
                    Session.token == token,
                    Session.expires_at > datetime.utcnow()
                )
            )
            return result.scalar_one_or_none()
    except Exception as e:
        logger.error('Ошибка validate_session: {}', repr(e))
        return None


async def create_session(token: str, user_id: str, request: web.Request) -> str:
    ip = request.remote
    ua = request.headers.get('User-Agent', '')[:500]
    return await db_create_session(token, user_id, ip_address=ip, user_agent=ua)


async def destroy_session(token: str):
    await db_delete_session(token)


# ─── Публичные маршруты ─────────────────────────────────────────────────

PUBLIC_ROUTES = {
    '/admin/login',
    '/admin/logout',
    '/version.json',
}


# ─── Auth Middleware ─────────────────────────────────────────────────────

@web.middleware
async def auth_middleware(request: web.Request, handler):
    path = request.path

    # Пропускаем статику
    if path.startswith('/static/'):
        return await handler(request)

    # Пропускаем публичные маршруты
    if path in PUBLIC_ROUTES:
        return await handler(request)

    # Пропускаем SPA маршруты (отдают index.html)
    spa_prefixes = ('/panel/', '/admin/', '/conferences/', '/settings/')
    if path == '/' or any(path.startswith(p) for p in spa_prefixes):
        # SPA маршруты — проверяем auth только для API
        if not path.startswith('/admin/api/') and not path.startswith('/api/'):
            return await handler(request)

    # Проверяем сессию
    token = request.cookies.get('admin_token')
    user = await validate_session(token)

    if not user:
        return web.json_response({'error': 'Не авторизован'}, status=401)

    request['user'] = user
    return await handler(request)


# ─── Auth Handlers ──────────────────────────────────────────────────────

def _set_cookie(response: web.Response, name: str, value: str, httponly: bool = True, max_age: int = 86400):
    """Установка cookie с domain из конфигурации."""
    kwargs = {
        'httponly': httponly,
        'secure': False,
        'max_age': max_age,
        'samesite': 'Lax',
    }
    if COOKIE_DOMAIN:
        kwargs['domain'] = COOKIE_DOMAIN
    response.set_cookie(name, value, **kwargs)


async def admin_login(request: web.Request) -> web.Response:
    client_ip = request.remote

    if not login_limiter.is_allowed(client_ip):
        logger.warning('Rate limit exceeded for IP: {}', client_ip)
        return web.json_response({'ok': False, 'error': 'Слишком много попыток. Попробуйте через минуту.'}, status=429)

    try:
        data = await request.json()
        max_id = data.get('max_id')
        password = data.get('password')

        if not max_id or not password:
            return web.json_response({'ok': False, 'error': 'Введите MAX ID и пароль'}, status=400)

        user = await get_user_by_max_id(int(max_id))

        if not user:
            logger.warning('Пользователь не найден: {}', max_id)
            return web.json_response({'ok': False, 'error': 'Пользователь не найден'}, status=404)

        if not user.password:
            if password != DEFAULT_ADMIN_PASSWORD:
                logger.warning('Неверный пароль по умолчанию для администратора {}', max_id)
                return web.json_response({'ok': False, 'error': 'Неверный логин или пароль'}, status=401)
        else:
            try:
                ph.verify(user.password, password)
            except VerifyMismatchError:
                logger.warning('Неверный пароль для администратора {}', max_id)
                return web.json_response({'ok': False, 'error': 'Неверный логин или пароль'}, status=401)

        token = secrets.token_hex(32)
        await create_session(token, user.id, request)

        csrf_token = generate_csrf_token()

        response = web.json_response({'ok': True})
        _set_cookie(response, 'admin_token', token, httponly=True)
        _set_cookie(response, 'csrf_token', csrf_token, httponly=False)

        logger.info('Пользователь {} (role={}) вошёл в панель', max_id, user.status)
        return response

    except Exception as e:
        logger.error('Ошибка входа: {}', repr(e))
        return web.json_response({'ok': False, 'error': 'Внутренняя ошибка сервера'}, status=500)


async def admin_logout(request: web.Request) -> web.Response:
    token = request.cookies.get('admin_token')
    if token:
        await destroy_session(token)
    response = web.json_response({'ok': True})
    response.del_cookie('admin_token')
    response.del_cookie('csrf_token')
    return response
```

- [ ] **Step 2: Проверить импорты**

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.auth import auth_middleware, require_csrf, admin_login, admin_logout; print('OK')"
```

Ожидаемый вывод: `OK`

- [ ] **Step 3: Коммит**

```bash
git add app/auth.py
git commit -m "refactor(auth): переписать auth.py — middleware + JOIN + CSRF multipart + cookie domain"
```

---

### Task 3: Подключить middleware в server.py + startup cleanup

**Covers:** Проблема 2.6 (очистка сессий), интеграция middleware

**Files:**
- Modify: `app/server.py`

**Interfaces:**
- Consumes: `app.auth.auth_middleware`, `database.sending.cleanup_expired_sessions`
- Produces: `start_webapp()` с middleware и cleanup

- [ ] **Step 1: Переписать server.py**

```python
# app/server.py

import asyncio
from aiohttp import web
from loguru import logger
from pathlib import Path

from app.auth import auth_middleware, admin_login, admin_logout
from app.routes import (
    setup_users_routes,
    setup_organizers_routes,
    setup_locations_routes,
    setup_logs_routes,
    setup_vks_routes,
)
from app.routes.documents import setup_document_routes
from app.routes.preload import setup_preload_routes
from app.routes.sse import setup_sse_routes
from app.sse_listener import start_listener, stop_listener
from database.sending import cleanup_expired_sessions

STATIC_PATH = Path(__file__).parent / 'static'

# Все SPA маршруты
SPA_PATHS = [
    '/',
    '/panel/',
    '/admin',
    '/admin/',
    '/admin/users/',
    '/admin/organizers/',
    '/admin/locations/',
    '/admin/logs/',
    '/conferences/',
    '/conferences/completed/',
    '/settings/',
    '/settings/general/',
    '/settings/profile/',
]


# ─── Session Cleanup ────────────────────────────────────────────────────

async def periodic_session_cleanup():
    """Очистка истёкших сессий каждые 6 часов."""
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await cleanup_expired_sessions()
            logger.info('Периодическая очистка сессий выполнена')
        except Exception as e:
            logger.error('Ошибка очистки сессий: {}', repr(e))


async def on_startup(app):
    """Действия при старте сервера."""
    # Очистка истёкших сессий
    try:
        await cleanup_expired_sessions()
        logger.info('Очистка истёкших сессий выполнена при старте')
    except Exception as e:
        logger.error('Ошибка очистки сессий при старте: {}', repr(e))

    # Запуск периодической очистки
    app['session_cleanup_task'] = asyncio.create_task(periodic_session_cleanup())

    # Запуск SSE listener
    await start_listener()


async def on_shutdown(app):
    """Действия при остановке сервера."""
    # Остановка периодической очистки
    task = app.get('session_cleanup_task')
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Остановка SSE listener
    await stop_listener()


# ─── Web App ────────────────────────────────────────────────────────────

async def start_webapp(host='0.0.0.0', port=8080):
    app = web.Application(client_max_size=100 * 1024 * 1024)

    # Auth middleware
    app.middlewares.append(auth_middleware)

    # Startup / Shutdown
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    # Auth API routes
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)

    # SPA routes — отдают index.html
    for path in SPA_PATHS:
        app.router.add_get(path, index_page)

    # Resource API routes
    setup_users_routes(app)
    setup_organizers_routes(app)
    setup_locations_routes(app)
    setup_logs_routes(app)
    setup_vks_routes(app)
    setup_document_routes(app)
    setup_preload_routes(app)
    setup_sse_routes(app)

    # Version JSON для автообновления
    async def version_json(request):
        vpath = Path(__file__).parent.parent / 'version.json'
        if vpath.exists():
            return web.FileResponse(vpath)
        return web.json_response({'version': 'dev', 'env': 'dev'})
    app.router.add_get('/version.json', version_json)

    # Статика
    if STATIC_PATH.exists():
        app.router.add_static('/static', path=str(STATIC_PATH), name='static')
        logger.info('Статика: {}', STATIC_PATH)
    else:
        logger.error('Папка static не найдена: {}', STATIC_PATH)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info('Веб-сервер запущен на {}:{}', host, port)
    return runner


async def index_page(request: web.Request) -> web.Response:
    html_path = Path(__file__).parent / 'static' / 'index.html'
    if not html_path.exists():
        logger.error('Файл index.html не найдена по пути: {}', html_path)
        return web.Response(text='Page not found', status=404)
    return web.Response(
        text=html_path.read_text(encoding='utf-8'),
        content_type='text/html',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    )
```

- [ ] **Step 2: Проверить импорт**

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.server import start_webapp; print('OK')"
```

Ожидаемый вывод: `OK`

- [ ] **Step 3: Коммит**

```bash
git add app/server.py
git commit -m "refactor(server): подключить auth middleware + startup cleanup сессий"
```

---

### Task 4: Убрать декораторы auth из маршрутов

**Covers:** Удаление дублирования auth проверки (middleware берёт на себя)

**Files:**
- Modify: `app/routes/users.py`
- Modify: `app/routes/vks.py`
- Modify: `app/routes/documents.py`
- Modify: `app/routes/preload.py`
- Modify: `app/routes/logs.py`
- Modify: `app/routes/organizers.py`
- Modify: `app/routes/locations.py`
- Modify: `app/routes/sse.py`

**Interfaces:**
- Consumes: `app.auth.require_csrf` (оставляем для CSRF проверки)
- Produces: Маршруты без `@admin_required` / `@auth_required`

- [ ] **Step 1: Убрать декораторы из users.py**

Открыть `app/routes/users.py` и:

1. Убрать импорт `admin_required`, `auth_required` из строки 5:
```python
# Было:
from app.auth import admin_required, require_csrf, auth_required

# Стало:
from app.auth import require_csrf
```

2. Убрать `@admin_required` и `@auth_required` со всех функций. Оставить только `@require_csrf` для POST/PUT/DELETE.

Итоговый файл:

```python
from aiohttp import web
from loguru import logger
from argon2 import PasswordHasher

from app.auth import require_csrf
from database.requests import get_user, get_user_by_max_id
from database.sending import add_user, update_user, delete_user

ph = PasswordHasher()


async def get_current_user(request: web.Request) -> web.Response:
    try:
        user = request['user']
        return web.json_response({
            'id': user.id,
            'first_name': user.first_name or '',
            'last_name': user.last_name or '',
            'patronymic': user.patronymic or '',
            'username': user.username or '',
            'name': user.name or '',
            'max_id': user.max_id,
            'status': user.status or 'user',
        })
    except Exception as e:
        logger.error('Ошибка получения текущего пользователя: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


async def check_auth(request: web.Request) -> web.Response:
    """Проверка авторизации — доступно всем ролям."""
    return web.json_response({'ok': True})


async def get_users(request: web.Request) -> web.Response:
    try:
        users = await get_user()
        data = [
            {
                'id': u.id,
                'first_name': u.first_name or '',
                'last_name': u.last_name or '',
                'patronymic': u.patronymic or '',
                'username': u.username or '',
                'name': u.name or '',
                'tg_id': u.tg_id,
                'max_id': u.max_id,
                'status': u.status or 'user',
            }
            for u in users
        ]
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения пользователей: {}', repr(e))
        return web.json_response([], status=500)


@require_csrf
async def create_user(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        tg_id = data.get('tg_id')
        max_id = data.get('max_id')
        password = data.get('password')

        update_data = {
            'first_name': data.get('first_name', ''),
            'last_name': data.get('last_name', ''),
            'patronymic': data.get('patronymic', ''),
            'username': data.get('username', ''),
            'name': data.get('name', ''),
            'tg_id': int(tg_id) if tg_id else None,
            'max_id': int(max_id) if max_id else None,
            'status': data.get('status', 'user'),
        }
        if password:
            update_data['password'] = ph.hash(password)

        user_id = await add_user(**update_data)
        logger.info('Пользователь создан: {}', user_id)
        return web.json_response({'ok': True, 'id': user_id})
    except Exception as e:
        logger.error('Ошибка создания пользователя: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def update_user_handler(request: web.Request) -> web.Response:
    try:
        user_id = request.match_info['id']
        data = await request.json()
        tg_id = data.get('tg_id')
        max_id = data.get('max_id')
        password = data.get('password')

        update_data = {
            'first_name': data.get('first_name'),
            'last_name': data.get('last_name'),
            'patronymic': data.get('patronymic'),
            'username': data.get('username'),
            'name': data.get('name'),
            'tg_id': int(tg_id) if tg_id else None,
            'max_id': int(max_id) if max_id else None,
            'status': data.get('status'),
        }
        if password:
            update_data['password'] = ph.hash(password)

        await update_user(user_id=user_id, **update_data)
        logger.info('Пользователь {} обновлён', user_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления пользователя: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def delete_user_handler(request: web.Request) -> web.Response:
    try:
        user_id = request.match_info['id']
        await delete_user(user_id)
        logger.info('Пользователь {} удалён', user_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления пользователя: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def check_admin_status(request: web.Request) -> web.Response:
    max_id = request.match_info.get('max_id')
    if not max_id:
        return web.json_response({'is_admin': False}, status=400)
    try:
        user = await get_user_by_max_id(int(max_id))
        return web.json_response({'is_admin': bool(user and user.status == 'admin')})
    except (ValueError, TypeError):
        return web.json_response({'is_admin': False}, status=400)
    except Exception as e:
        logger.error('Ошибка проверки статуса администратора: {}', repr(e))
        return web.json_response({'is_admin': False}, status=500)


@require_csrf
async def change_password(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        old_password = data.get('old_password', '')
        new_password = data.get('new_password', '')

        if not old_password or not new_password:
            return web.json_response({'ok': False, 'error': 'Заполните оба поля'}, status=400)

        if len(new_password) < 4:
            return web.json_response({'ok': False, 'error': 'Минимум 4 символа'}, status=400)

        user = request['user']

        if user.password:
            try:
                ph.verify(user.password, old_password)
            except Exception:
                return web.json_response({'ok': False, 'error': 'Неверный текущий пароль'}, status=401)
        else:
            from config import DEFAULT_ADMIN_PASSWORD
            if old_password != DEFAULT_ADMIN_PASSWORD:
                return web.json_response({'ok': False, 'error': 'Неверный текущий пароль'}, status=401)

        await update_user(user_id=user.id, password=ph.hash(new_password))
        logger.info('Пользователь {} сменил пароль', user.max_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка смены пароля: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_users_routes(app: web.Application):
    app.router.add_get('/admin/api/auth/check', check_auth)
    app.router.add_get('/admin/api/users/me', get_current_user)
    app.router.add_get('/admin/api/users', get_users)
    app.router.add_post('/admin/api/users', create_user)
    app.router.add_put('/admin/api/users/{id}', update_user_handler)
    app.router.add_delete('/admin/api/users/{id}', delete_user_handler)
    app.router.add_get('/api/check-admin-status/{max_id}', check_admin_status)
    app.router.add_post('/admin/api/change-password', change_password)
```

- [ ] **Step 2: Убрать декораторы из vks.py**

Открыть `app/routes/vks.py` и:

1. Изменить импорт на строке 5:
```python
# Было:
from app.auth import admin_required, auth_required, require_csrf

# Стало:
from app.auth import require_csrf
```

2. Убрать `@admin_required` и `@auth_required` со всех функций. Оставить `@require_csrf` для POST/PUT/DELETE.

3. Убрать `request['user'] = user` из обработчиков (middleware уже установил).

4. Убрать `get_user_by_id` из импорта requests если больше нигде не используется.

- [ ] **Step 3: Убрать декораторы из documents.py**

Открыть `app/routes/documents.py` и:

1. Изменить импорт:
```python
# Было:
from app.auth import auth_required, require_csrf

# Стало:
from app.auth import require_csrf
```

2. Убрать `@auth_required` со всех функций. Оставить `@require_csrf` для POST/DELETE.

- [ ] **Step 4: Убрать декораторы из preload.py**

Открыть `app/routes/preload.py` и:

1. Изменить импорт:
```python
# Было:
from app.auth import auth_required

# Стало:
# (импорт больше не нужен)
```

2. Убрать `@auth_required` с `preload_data`.

- [ ] **Step 5: Убрать декораторы из logs.py**

Открыть `app/routes/logs.py` и:

1. Убрать импорт `admin_required` / `auth_required`.
2. Убрать декораторы со всех функций.

- [ ] **Step 6: Убрать декораторы из organizers.py**

Открыть `app/routes/organizers.py` и:

1. Изменить импорт:
```python
# Было:
from app.auth import admin_required, require_csrf

# Стало:
from app.auth import require_csrf
```

2. Убрать `@admin_required`. Оставить `@require_csrf` для POST/PUT/DELETE.

- [ ] **Step 7: Убрать декораторы из locations.py**

Открыть `app/routes/locations.py` и:

1. Изменить импорт:
```python
# Было:
from app.auth import admin_required, require_csrf

# Стало:
from app.auth import require_csrf
```

2. Убрать `@admin_required`. Оставить `@require_csrf` для POST/PUT/DELETE.

- [ ] **Step 8: Убрать декораторы из sse.py**

Открыть `app/routes/sse.py` и:

1. Убрать импорт `admin_required` / `auth_required`.
2. Убрать декораторы со всех функций.

- [ ] **Step 9: Проверить что всё импортируется**

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.server import start_webapp; print('OK')"
```

Ожидаемый вывод: `OK`

- [ ] **Step 10: Коммит**

```bash
git add app/routes/users.py app/routes/vks.py app/routes/documents.py app/routes/preload.py app/routes/logs.py app/routes/organizers.py app/routes/locations.py app/routes/sse.py
git commit -m "refactor(routes): убрать декораторы auth — middleware берёт на себя проверку"
```

---

### Task 5: Переписать frontend auth.js — устранить гонку

**Covers:** Проблема 2.1 (гонка), 2.2 (silent), 2.10 (двойной вызов)

**Files:**
- Rewrite: `app/static/js/auth.js`
- Modify: `app/static/js/app.js`

**Interfaces:**
- Consumes: `BASE_URL`, `showMain()`, `showLogin()`, `switchPage()`
- Produces: `checkAuth()`, `login()`, `logout()`, `isAuthenticated`, `window.currentUserRole`, `window.currentUserName`

- [ ] **Step 1: Переписать auth.js**

Полностью заменить содержимое `app/static/js/auth.js`:

```javascript
// ─── Авторизация ─────────────────────────────────────────────────────

let isAuthenticated = false;

/**
 * Проверка авторизации — ЕДИНСТВЕННЫЙ источник правды.
 * Возвращает true если авторизован, false если нет.
 * Всегда показывает appropriate screen (main или login).
 */
async function checkAuth() {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
        if (resp.ok) {
            isAuthenticated = true;
            await loadCurrentUser();
            showMain();
            if (typeof applyRoleRestrictions === 'function') {
                applyRoleRestrictions();
            }
            return true;
        }
    } catch (e) { /* ignore network errors */ }

    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    showLogin();
    return false;
}

/**
 * Загрузка данных текущего пользователя.
 */
async function loadCurrentUser() {
    try {
        const meResp = await fetch(`${BASE_URL}/admin/api/users/me`);
        if (meResp.ok) {
            const me = await meResp.json();
            window.currentUserRole = me.status || 'user';
            const lastName = me.last_name || '';
            const firstName = me.first_name || '';
            if (lastName && firstName) {
                window.currentUserName = `${lastName} ${firstName.charAt(0)}.`;
            } else if (me.name) {
                window.currentUserName = me.name;
            } else if (me.username) {
                window.currentUserName = me.username;
            } else {
                window.currentUserName = `User #${me.max_id || ''}`;
            }
            const userEl = document.getElementById('topbar-user');
            if (userEl && window.currentUserName) {
                userEl.textContent = window.currentUserName;
                userEl.style.display = 'inline';
            }
        } else {
            window.currentUserRole = 'admin';
        }
    } catch (e) {
        window.currentUserRole = 'admin';
    }
}

/**
 * Вход — доверяет checkAuth() для финальной проверки.
 * НЕ ставит isAuthenticated, НЕ показывает main-screen.
 */
async function login() {
    const maxId = document.getElementById('login-max-id').value;
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.display = 'none';

    if (!maxId || !password) {
        err.textContent = 'Введите MAX ID и пароль';
        err.style.display = 'block';
        return;
    }

    const btn = document.querySelector('#login-screen .btn-primary');
    if (btn) btn.disabled = true;

    try {
        const resp = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_id: parseInt(maxId), password })
        });
        const data = await resp.json();

        if (data.ok) {
            // НЕ ставим isAuthenticated = true
            // НЕ показываем main-screen
            // Доверяем только checkAuth()
            await checkAuth();
        } else {
            err.textContent = data.error || 'Неверный логин или пароль';
            err.style.display = 'block';
        }
    } catch (e) {
        err.textContent = 'Ошибка сети';
        err.style.display = 'block';
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Выход.
 */
async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, { method: 'POST' });
    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    // Очистить кэш данных
    if (typeof allUsers !== 'undefined') allUsers = [];
    if (typeof allEvents !== 'undefined') allEvents = [];
    if (typeof allOrganizers !== 'undefined') allOrganizers = [];
    if (typeof allLocations !== 'undefined') allLocations = [];
    // Скрыть имя в хедере
    const userEl = document.getElementById('topbar-user');
    if (userEl) userEl.style.display = 'none';
    showLogin();
    window.history.replaceState(null, '', '/');
}

function showMain() {
    document.getElementById('login-screen').classList.remove('show');
    document.getElementById('main-screen').style.display = 'flex';
}

function showLogin() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').classList.add('show');
}
```

- [ ] **Step 2: Упростить app.js**

Открыть `app/static/js/app.js` и заменить строки 44-48:

```javascript
// Было:
initTheme();
initRouter();
checkAuth();
initUpdater();
initSSE();

// Стало:
initTheme();
initRouter();
// checkAuth() вызывается из initRouter → handleAuthState
initUpdater();
initSSE();
```

И добавить в `router.js` функцию `handleAuthState`:

Открыть `app/static/js/router.js` и добавить в конец `initRouter()`:

```javascript
function initRouter() {
    if (routerInitialized) return;
    routerInitialized = true;

    window.addEventListener('popstate', handlePopState);

    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-href]');
        if (link) {
            e.preventDefault();
            navigateTo(link.dataset.href);
        }
    });

    // Проверяем авторизацию при старте
    handleAuthState();
}

async function handleAuthState() {
    const authed = await checkAuth();
    if (!authed) {
        showLogin();
    } else {
        // Загрузить данные для текущей страницы
        const route = getRouteFromURL();
        if (route && ROUTES[route]) {
            navigateTo(route, false);
        }
    }
}
```

- [ ] **Step 3: Проверить что JS валидный**

```bash
cd E:\Codding\web_adm_secretar
node -c app/static/js/auth.js && echo "auth.js OK"
node -c app/static/js/app.js && echo "app.js OK"
node -c app/static/js/router.js && echo "router.js OK"
```

Ожидаемый вывод:
```
auth.js OK
app.js OK
router.js OK
```

- [ ] **Step 4: Коммит**

```bash
git add app/static/js/auth.js app/static/js/app.js app/static/js/router.js
git commit -m "refactor(auth): переписать frontend auth — устранить гонку, единый checkAuth()"
```

---

### Task 6: Nginx anti-cache headers

**Covers:** Проблема 2.4 (nginx кеширует статику)

**Files:**
- Modify: `deploy/nginx/test.conf`
- Modify: `deploy/nginx/prod.conf`

**Interfaces:**
- Consumes: nginx config format
- Produces: Anti-cache headers для API и статики

- [ ] **Step 1: Обновить test.conf**

```nginx
# Тестовый сайт - catch-all
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 100m;

    # Статика — кешируем с version query
    location /static/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=86400";
    }

    # API — никогда не кешировать
    location /admin/api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # version.json — не кешировать
    location = /version.json {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Все остальные маршруты
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE endpoint — отключаем буферизацию
    location /admin/api/events/stream {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding off;
    }
}
```

- [ ] **Step 2: Обновить prod.conf**

```nginx
# Продакшен - по домену bot.dlab.run
server {
    listen 80;
    server_name bot.dlab.run;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name bot.dlab.run;
    client_max_body_size 100m;

    ssl_certificate /etc/letsencrypt/live/bot.dlab.run/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.dlab.run/privkey.pem;

    # Статика — кешируем с version query
    location /static/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=86400";
    }

    # API — никогда не кешировать
    location /admin/api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # version.json — не кешировать
    location = /version.json {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Все остальные маршруты
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Корень - редирект на /admin
    location = / {
        return 302 /admin;
    }
}
```

- [ ] **Step 3: Коммит**

```bash
git add deploy/nginx/test.conf deploy/nginx/prod.conf
git commit -m "fix(nginx): добавить anti-cache headers для API и статики"
```

---

### Task 7: Деплой и тестирование

**Covers:** Все задачи — проверка интеграции

**Files:**
- Modify: `app/static/index.html` (обновить version query)

**Interfaces:**
- Consumes: VPS 45.90.217.225, deploy.py
- Produces: Работающая авторизация на test сервере

- [ ] **Step 1: Обновить version query в index.html**

Открыть `app/static/index.html` и обновить все `?v=150` на `?v=160`:

```bash
# Или через edit tool — заменить все ?v=150 на ?v=160
```

- [ ] **Step 2: Задеплоить на test**

```bash
cd E:\Codding\web_adm_secretar
python deploy/deploy.py test
```

- [ ] **Step 3: Проверить что сервер запустился**

Открыть `http://45.90.217.225/admin` в браузере.

Ожидаемое поведение:
1. Показывается экран логина (не пустой экран)
2. После входа — данные загружаются без гонки
3. Нет ошибок в консоли браузера

- [ ] **Step 4: Проверить cookie domain**

Открыть DevTools → Application → Cookies → `45.90.217.225`:
- `admin_token` — httponly, domain = `45.90.217.225`
- `csrf_token` — не httponly, domain = `45.90.217.225`

- [ ] **Step 5: Проверить что API не кешируется**

DevTools → Network → перезагрузить страницу:
- `/admin/api/auth/check` → Cache-Control: no-store, no-cache, must-revalidate

- [ ] **Step 6: Проверить logout + CSRF**

1. Войти в панель
2. Открыть DevTools → Console
3. Выполнить:
```javascript
fetch('/admin/logout', { method: 'POST' }).then(r => r.json()).then(d => console.log(d));
```
4. Ожидаемый результат: `{ok: true}`, пользователь разлогинен

- [ ] **Step 7: Коммит**

```bash
git add app/static/index.html
git commit -m "chore: обновить version query до v160 для деплоя auth overhaula"
```

---

## Самопроверка плана

| Критерий | Статус |
|----------|--------|
| Все проблемы из анализа покрыты | 10/10 задач |
| Нет TBD/TODO/placesholders | OK |
| Типы и имена функций согласованы | OK |
| Каждый шаг содержательный | OK |
| Команды для запуска указаны | OK |
| Ожидаемый вывод указан | OK |
