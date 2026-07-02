# app/auth.py

import secrets
import time
from functools import wraps
from collections import defaultdict

from aiohttp import web
from loguru import logger
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from database.requests import get_user_by_max_id, get_session_by_token, get_user_by_id
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
            cookie_token = request.cookies.get('csrf_token')
            header_token = request.headers.get('X-CSRF-Token')
            form_token = header_token
            if not form_token:
                try:
                    data = await request.json()
                    form_token = data.get('csrf_token')
                except Exception:
                    pass
            if not cookie_token or cookie_token != form_token:
                logger.warning('CSRF token invalid: cookie={}, form={}', cookie_token, form_token)
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
            secure=False,
            max_age=86400,
            samesite='Lax'
        )
        response.set_cookie(
            'csrf_token', csrf_token,
            httponly=False,
            secure=False,
            max_age=86400,
            samesite='Lax'
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
