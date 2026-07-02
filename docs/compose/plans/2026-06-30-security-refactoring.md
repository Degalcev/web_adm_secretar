# Безопасность и Рефакторинг Бэкенда — План Реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Усилить безопасность админ-панели и разделить монолитный `admin_routes.py` на модули.

**Architecture:** Разделение `admin_routes.py` (448 строк) на 5 модулей по ответственности. Добавление CSRF защиты, rate limiting, secure cookies. Перенос сессий из памяти в БД.

**Tech Stack:** Python 3.x, aiohttp, SQLAlchemy async, argon2-cffi, secrets

## Global Constraints

- Python 3.10+, asyncio, aiohttp
- PostgreSQL через asyncpg + SQLAlchemy async
- Существующий структурированный логирование loguru
- Не нарушать текущий API фронтенду (`/admin/api/*`)
- Все изменения обратно совместимы

---

## Файловая структура

```
app/
├── __init__.py
├── server.py                    # Существующий (без изменений)
├── auth.py                      #НОВЫЙ: авторизация, сессии, middleware
├── routes/
│   ├── __init__.py              # НОВЫЙ
│   ├── users.py                 # НОВЫЙ: CRUD пользователей
│   ├── organizers.py            # НОВЫЙ: CRUD организаторов
│   ├── locations.py             # НОВЫЙ: CRUD локаций
│   └── logs.py                  # НОВЫЙ: просмотр логов
├── static/                      # Существующий (без изменений)
│   ├── admin.html
│   ├── css/admin.css
│   └── js/admin.js
database/
├── models.py                    # ИЗМЕНЁН: добавлена модель Session
├── requests.py                  # ИЗМЕНЁН: добавлены запросы сессий
├── sending.py                   # ИЗМЕНЁН: добавлены операции с сессиями
config.py                        # ИЗМЕНЁН: добавлены настройки безопасности
```

---

### Task 1: Модель сессий в БД

**Covers:** Безопасность сессий, перенос из памяти в БД

**Files:**
- Modify: `database/models.py`
- Modify: `database/requests.py`
- Modify: `database/sending.py`

**Interfaces:**
- Consumes: `async_session` из `database/models.py`
- Produces: `Session` модель, `create_session()`, `get_session()`, `delete_session()`, `cleanup_sessions()`

- [ ] **Step 1: Добавить модель Session в models.py**

```python
# database/models.py - добавить после класса Location

class Session(Base):
    __tablename__ = 'sessions'

    id         = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    token      = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id    = mapped_column(String(), ForeignKey('users.id'), nullable=False)
    ip_address = mapped_column(String(45), nullable=True)
    user_agent = mapped_column(String(500), nullable=True)
    created_at = mapped_column(DateTime, default=datetime.utcnow)
    expires_at = mapped_column(DateTime, nullable=False)

    __table_args__ = (
        Index('idx_session_token', 'token'),
        Index('idx_session_expires', 'expires_at'),
    )
```

- [ ] **Step 2: Добавить запросы сессий в requests.py**

```python
# database/requests.py - добавить

from datetime import datetime
from database.models import Session

async def get_session_by_token(token: str):
    async with async_session() as session:
        result = await session.scalar(
            select(Session).where(
                Session.token == token,
                Session.expires_at > datetime.utcnow()
            )
        )
        return result

async def get_sessions_by_user_id(user_id: str):
    async with async_session() as session:
        result = await session.scalars(
            select(Session).where(Session.user_id == user_id)
        )
        return list(result)
```

- [ ] **Step 3: Добавить операции сессий в sending.py**

```python
# database/sending.py - добавить

from datetime import datetime, timedelta
from database.models import Session

async def create_session(token: str, user_id: str, ip_address: str = None, user_agent: str = None, expires_hours: int = 24) -> str:
    new_id = str(uuid.uuid4())
    new_session = Session(
        id=new_id,
        token=token,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=datetime.utcnow() + timedelta(hours=expires_hours)
    )
    async with async_session() as session:
        try:
            session.add(new_session)
            await session.commit()
            logger.info('Сессия создана для пользователя {}', user_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка создания сессии: {}', repr(e))
            raise

async def delete_session(token: str):
    async with async_session() as session:
        try:
            from sqlalchemy import delete as sql_delete
            await session.execute(
                sql_delete(Session).where(Session.token == token)
            )
            await session.commit()
            logger.info('Сессия удалена')
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления сессии: {}', repr(e))
            raise

async def cleanup_expired_sessions():
    async with async_session() as session:
        try:
            from sqlalchemy import delete as sql_delete
            await session.execute(
                sql_delete(Session).where(Session.expires_at < datetime.utcnow())
            )
            await session.commit()
            logger.info('Просроченные сессии удалены')
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка очистки сессий: {}', repr(e))
            raise
```

- [ ] **Step 4: Commit**

```bash
git add database/models.py database/requests.py database/sending.py
git commit -m "feat: add Session model for persistent sessions in database"
```

---

### Task 2: Модуль авторизации

**Covers:** Безопасность, CSRF, rate limiting, secure cookies

**Files:**
- Create: `app/auth.py`

**Interfaces:**
- Consumes: `get_session_by_token`, `create_session`, `delete_session` из Task 1
- Produces: `admin_required`, `require_csrf`, `RateLimiter`, `setup_auth()`

- [ ] **Step 1: Создать app/auth.py**

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
from database.sending import create_session as db_create_session, delete_session as db_delete_session
from config import DEFAULT_ADMIN_PASSWORD

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
            token = request.cookies.get('csrf_token')
            try:
                data = await request.json()
                form_token = data.get('csrf_token')
            except Exception:
                form_token = None
            if not token or token != form_token:
                return web.json_response({'error': 'CSRF token invalid'}, status=403)
        return await handler(request)
    return wrapper


# ─── Sessions ────────────────────────────────────────────────────────────

async def create_session(token: str, user_id: str, request: web.Request) -> str:
    ip = request.remote
    ua = request.headers.get('User-Agent', '')[:500]
    return await db_create_session(token, user_id, ip_address=ip, user_agent=ua)


async def validate_session(token: str):
    if not token:
        return None
    session = await get_session_by_token(token)
    if not session:
        return None
    from database.requests import get_user_by_id
    user = await get_user_by_id(session.user_id)
    return user


async def destroy_session(token: str):
    await db_delete_session(token)


# ─── Auth Middleware ─────────────────────────────────────────────────────

def admin_required(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        token = request.cookies.get('admin_token')
        user = await validate_session(token)
        if not user or user.status != 'admin':
            return web.json_response({'error': 'Доступ запрещён'}, status=401)
        request['user'] = user
        return await handler(request)
    return wrapper


# ─── Auth Handlers ──────────────────────────────────────────────────────

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

        if not user or user.status != 'admin':
            logger.warning('Попытка входа не-администратора с max_id: {}', max_id)
            return web.json_response({'ok': False, 'error': 'Доступ только для администраторов'}, status=403)

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
        response.set_cookie(
            'admin_token', token,
            httponly=True,
            secure=True,
            max_age=86400,
            samesite='Strict'
        )
        response.set_cookie(
            'csrf_token', csrf_token,
            httponly=False,
            secure=True,
            max_age=86400,
            samesite='Strict'
        )
        logger.info('Администратор {} вошёл в панель', max_id)
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

- [ ] **Step 2: Commit**

```bash
git add app/auth.py
git commit -m "feat: add auth module with CSRF, rate limiting, secure sessions"
```

---

### Task 3: Разделение routes на модули

**Covers:** Рефакторинг бэкенда, разделение ответственности

**Files:**
- Create: `app/routes/__init__.py`
- Create: `app/routes/users.py`
- Create: `app/routes/organizers.py`
- Create: `app/routes/locations.py`
- Create: `app/routes/logs.py`

**Interfaces:**
- Consumes: `admin_required`, `require_csrf` из Task 2
- Produces: `setup_users_routes()`, `setup_organizers_routes()`, `setup_locations_routes()`, `setup_logs_routes()`

- [ ] **Step 1: Создать app/routes/__init__.py**

```python
# app/routes/__init__.py

from app.routes.users import setup_users_routes
from app.routes.organizers import setup_organizers_routes
from app.routes.locations import setup_locations_routes
from app.routes.logs import setup_logs_routes

__all__ = [
    'setup_users_routes',
    'setup_organizers_routes',
    'setup_locations_routes',
    'setup_logs_routes',
]
```

- [ ] **Step 2: Создать app/routes/users.py**

```python
# app/routes/users.py

from aiohttp import web
from loguru import logger
from argon2 import PasswordHasher

from app.auth import admin_required, require_csrf
from database.requests import get_user, get_user_by_max_id
from database.sending import add_user, update_user, delete_user

ph = PasswordHasher()


async def get_users(request: web.Request) -> web.Response:
    try:
        users = await get_user()
        data = [
            {
                'id': u.id,
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


@admin_required
@require_csrf
async def create_user(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        tg_id = data.get('tg_id')
        max_id = data.get('max_id')
        password = data.get('password')

        update_data = {
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


@admin_required
@require_csrf
async def update_user_handler(request: web.Request) -> web.Response:
    try:
        user_id = request.match_info['id']
        data = await request.json()
        tg_id = data.get('tg_id')
        max_id = data.get('max_id')
        password = data.get('password')

        update_data = {
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


@admin_required
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


def setup_users_routes(app: web.Application):
    app.router.add_get('/admin/api/users', get_users)
    app.router.add_post('/admin/api/users', create_user)
    app.router.add_put('/admin/api/users/{id}', update_user_handler)
    app.router.add_delete('/admin/api/users/{id}', delete_user_handler)
    app.router.add_get('/api/check-admin-status/{max_id}', check_admin_status)
```

- [ ] **Step 3: Создать app/routes/organizers.py**

```python
# app/routes/organizers.py

from aiohttp import web
from loguru import logger

from app.auth import admin_required, require_csrf
from database.requests import get_organizers
from database.sending import add_organizer, update_organizer, delete_organizer


@admin_required
async def get_organizers_handler(request: web.Request) -> web.Response:
    try:
        items = await get_organizers()
        data = [{'id': o.id, 'name': o.name or '', 'short_name': o.short_name or '', 'base_url': o.base_url or ''} for o in items]
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения организаторов: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
@require_csrf
async def create_organizer_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        new_id = await add_organizer(
            name=data.get('name', ''),
            short_name=data.get('short_name', ''),
            base_url=data.get('base_url', ''),
        )
        return web.json_response({'ok': True, 'id': new_id})
    except Exception as e:
        logger.error('Ошибка создания организатора: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def update_organizer_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        data = await request.json()
        await update_organizer(
            organizer_id=item_id,
            name=data.get('name'),
            short_name=data.get('short_name'),
            base_url=data.get('base_url'),
        )
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления организатора: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def delete_organizer_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        await delete_organizer(item_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления организатора: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_organizers_routes(app: web.Application):
    app.router.add_get('/admin/api/organizers', get_organizers_handler)
    app.router.add_post('/admin/api/organizers', create_organizer_handler)
    app.router.add_put('/admin/api/organizers/{id}', update_organizer_handler)
    app.router.add_delete('/admin/api/organizers/{id}', delete_organizer_handler)
```

- [ ] **Step 4: Создать app/routes/locations.py**

```python
# app/routes/locations.py

from aiohttp import web
from loguru import logger

from app.auth import admin_required, require_csrf
from database.requests import get_locations
from database.sending import add_location, update_location, delete_location


@admin_required
async def get_locations_handler(request: web.Request) -> web.Response:
    try:
        items = await get_locations()
        data = [{'id': l.id, 'name': l.name or ''} for l in items]
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения локаций: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
@require_csrf
async def create_location_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        new_id = await add_location(name=data.get('name', ''))
        return web.json_response({'ok': True, 'id': new_id})
    except Exception as e:
        logger.error('Ошибка создания локации: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def update_location_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        data = await request.json()
        await update_location(location_id=item_id, name=data.get('name'))
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления локации: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def delete_location_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        await delete_location(item_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления локации: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_locations_routes(app: web.Application):
    app.router.add_get('/admin/api/locations', get_locations_handler)
    app.router.add_post('/admin/api/locations', create_location_handler)
    app.router.add_put('/admin/api/locations/{id}', update_location_handler)
    app.router.add_delete('/admin/api/locations/{id}', delete_location_handler)
```

- [ ] **Step 5: Создать app/routes/logs.py**

```python
# app/routes/logs.py

import os
import re

from aiohttp import web
from loguru import logger

from app.auth import admin_required
from config import PROJECT_ROOT, BOT_LOGS_DIR

LOGS_DIR = os.path.join(PROJECT_ROOT, 'logs')

LOG_SOURCES = {
    'panel': LOGS_DIR,
    'bot': BOT_LOGS_DIR,
}

_LOGS_DIR_REALS: dict[str, str] = {}


def _get_logs_dir_real(source: str) -> str:
    if source not in _LOGS_DIR_REALS:
        _LOGS_DIR_REALS[source] = os.path.realpath(LOG_SOURCES[source])
    return _LOGS_DIR_REALS[source]


def _scan_dates() -> list[dict]:
    dates: dict[str, dict] = {}
    for source, logs_dir in LOG_SOURCES.items():
        if not os.path.exists(logs_dir):
            continue
        for f in os.listdir(logs_dir):
            if not f.endswith('.log'):
                continue
            match = re.match(r'bot_(\d{4}-\d{2}-\d{2})\.log', f)
            if not match:
                continue
            date_str = match.group(1)
            filepath = os.path.join(logs_dir, f)
            stat = os.stat(filepath)
            if date_str not in dates:
                dates[date_str] = {'date': date_str, 'size': 0, 'sources': []}
            dates[date_str]['size'] += stat.st_size
            if source not in dates[date_str]['sources']:
                dates[date_str]['sources'].append(source)
    return sorted(dates.values(), key=lambda x: x['date'], reverse=True)


@admin_required
async def get_log_dates(request: web.Request) -> web.Response:
    try:
        return web.json_response(_scan_dates())
    except Exception as e:
        logger.error('Ошибка получения списка дат: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
async def get_log_by_date(request: web.Request) -> web.Response:
    try:
        date_str = request.match_info['date']
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return web.json_response({'error': 'Неверный формат даты'}, status=400)

        try:
            n = max(1, int(request.query.get('lines', '500')))
        except ValueError:
            n = 500

        level_filter = request.query.get('level', '').strip()
        search = request.query.get('search', '').strip()
        source_filter = request.query.get('source', '').strip()

        all_lines: list[dict] = []
        stats = {'total': 0, 'ERROR': 0, 'WARNING': 0, 'INFO': 0, 'DEBUG': 0}

        sources = [source_filter] if source_filter in LOG_SOURCES else list(LOG_SOURCES)
        for source in sources:
            filepath = os.path.join(LOG_SOURCES[source], f'bot_{date_str}.log')
            if not os.path.exists(filepath):
                continue
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    stats['total'] += 1
                    for level in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
                        if f'| {level}' in line:
                            stats[level] += 1
                            break
                    all_lines.append({'text': line, 'source': source})

        all_lines.sort(key=lambda x: x['text'][:19])

        filtered = all_lines
        if level_filter and level_filter in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
            filtered = [l for l in filtered if f'| {level_filter}' in l['text']]
        if search:
            search_lower = search.lower()
            filtered = [l for l in filtered if search_lower in l['text'].lower()]

        recent = filtered[-n:]

        return web.json_response({
            'date': date_str,
            'lines': [{'text': l['text'], 'source': l['source']} for l in recent],
            'total_lines': stats['total'],
            'filtered_lines': len(filtered),
            'stats': stats,
        })

    except Exception as e:
        logger.error('Ошибка чтения лога: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


def setup_logs_routes(app: web.Application):
    app.router.add_get('/admin/api/logs/dates', get_log_dates)
    app.router.add_get('/admin/api/logs/{date}', get_log_by_date)
```

- [ ] **Step 6: Commit**

```bash
git add app/routes/
git commit -m "refactor: split admin_routes into separate route modules"
```

---

### Task 4: Обновить server.py и admin_routes.py

**Covers:** Интеграция новых модулей

**Files:**
- Modify: `app/server.py`
- Delete: `app/admin_routes.py` (заменяется на новые модули)

**Interfaces:**
- Consumes: `setup_users_routes`, `setup_organizers_routes`, `setup_locations_routes`, `setup_logs_routes` из Task 3
- Consumes: `admin_login`, `admin_logout` из Task 2
- Produces: Обновлённый `app/server.py`

- [ ] **Step 1: Обновить app/server.py**

```python
# app/server.py

from aiohttp import web
from loguru import logger
from pathlib import Path

from app.auth import admin_login, admin_logout
from app.routes import (
    setup_users_routes,
    setup_organizers_routes,
    setup_locations_routes,
    setup_logs_routes,
)

STATIC_PATH = Path(__file__).parent / 'static'


async def start_webapp(host='0.0.0.0', port=8080):
    app = web.Application()

    # Auth routes
    app.router.add_get('/admin', admin_page)
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)

    # Resource routes
    setup_users_routes(app)
    setup_organizers_routes(app)
    setup_locations_routes(app)
    setup_logs_routes(app)

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


async def admin_page(request: web.Request) -> web.Response:
    html_path = Path(__file__).parent / 'static' / 'admin.html'
    if not html_path.exists():
        logger.error('Файл admin.html не найден по пути: {}', html_path)
        return web.Response(text='Admin page not found', status=404)
    return web.Response(
        text=html_path.read_text(encoding='utf-8'),
        content_type='text/html'
    )
```

- [ ] **Step 2: Удалить app/admin_routes.py**

```bash
git rm app/admin_routes.py
```

- [ ] **Step 3: Commit**

```bash
git add app/server.py app/admin_routes.py
git commit -m "refactor: update server.py to use new route modules, remove monolithic admin_routes"
```

---

### Task 5: Обновить requirements.txt

**Covers:** Зависимости

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Добавить зависимости**

```txt
aiohttp>=3.9.0
loguru>=0.7.0
SQLAlchemy>=2.0.0
asyncpg>=0.29.0
argon2-cffi>=23.1.0
python-dotenv>=1.0.0
sshtunnel>=0.4.0
```

- [ ] **Step 2: Commit**

```bash
git add requirements.txt
git commit -m "chore: update requirements.txt"
```

---

### Task 6: Обновить .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Добавить**

```
.env
.venv/
__pycache__/
*.pyc
logs/
.idea/
*.db
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update .gitignore"
```

---

### Task 7: Финальная проверка

**Files:** Все изменённые файлы

- [ ] **Step 1: Проверить импорты**

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.server import start_webapp; print('OK')"
```

Expected: OK

- [ ] **Step 2: Проверить структуру**

```bash
dir app\routes
```

Expected: `__init__.py`, `users.py`, `organizers.py`, `locations.py`, `logs.py`

- [ ] **Step 3: Финальный commit**

```bash
git add -A
git commit -m "feat: security improvements and backend refactoring

- Add CSRF protection on all state-changing endpoints
- Add rate limiting on login (5 attempts/minute)
- Add secure cookie flags (httponly, secure, samesite=Strict)
- Move sessions from in-memory dict to PostgreSQL
- Split admin_routes.py (448 lines) into 5 focused modules
- Add Session model for persistent sessions
- Add cleanup for expired sessions"
```
