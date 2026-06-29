from aiohttp import web
from loguru import logger
from database.requests import get_user, get_user_by_max_id
from database.sending import add_user, update_user, delete_user
from functools import wraps
from pathlib import Path
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import secrets
import os
from datetime import datetime
from config import DEFAULT_ADMIN_PASSWORD, PROJECT_ROOT

ph = PasswordHasher()

_sessions: dict[str, int] = {}


# ─── Middleware авторизации ───────────────────────────────────────────────────

async def get_user_from_token(request: web.Request):
    token = request.cookies.get('admin_token')
    if not token:
        return None
    max_id = _sessions.get(token)
    if not max_id:
        return None
    try:
        user = await get_user_by_max_id(max_id)
        if user and user.status == 'admin':
            return user
    except Exception:
        return None
    return None


def admin_required(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        user = await get_user_from_token(request)
        if not user:
            return web.json_response({'error': 'Доступ запрещён'}, status=401)
        return await handler(request)
    return wrapper


# ─── Маршруты ─────────────────────────────────────────────────────────────────

def setup_admin_routes(app: web.Application):
    app.router.add_get(  '/admin',                          admin_page)
    app.router.add_post( '/admin/login',                    admin_login)
    app.router.add_post( '/admin/logout',                   admin_logout)
    app.router.add_get(  '/admin/api/users',                get_users)
    app.router.add_post( '/admin/api/users',                create_user)
    app.router.add_put(  '/admin/api/users/{id}',           update_user_handler)
    app.router.add_delete('/admin/api/users/{id}',          delete_user_handler)
    app.router.add_get(  '/api/check-admin-status/{max_id}', check_admin_status)
    app.router.add_get(  '/admin/api/logs',                 get_log_files)
    app.router.add_get(  '/admin/api/logs/{filename}',      get_log_content)


# ─── Страница ─────────────────────────────────────────────────────────────────

async def admin_page(request: web.Request) -> web.Response:
    html_path = Path(__file__).parent / 'static' / 'admin.html'
    if not html_path.exists():
        logger.error('Файл admin.html не найден по пути: {}', html_path)
        return web.Response(text='Admin page not found', status=404)
    return web.Response(
        text=html_path.read_text(encoding='utf-8'),
        content_type='text/html'
    )


# ─── Авторизация ──────────────────────────────────────────────────────────────

async def admin_login(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        max_id   = data.get('max_id')
        password = data.get('password')

        if not max_id or not password:
            return web.json_response({'ok': False, 'error': 'Введите MAX ID и пароль'}, status=400)

        user = await get_user_by_max_id(max_id)

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
        _sessions[token] = user.max_id

        response = web.json_response({'ok': True})
        response.set_cookie(
            'admin_token', token,
            httponly=True,
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
        _sessions.pop(token, None)
    response = web.json_response({'ok': True})
    response.del_cookie('admin_token')
    return response


# ─── Проверка статуса ────────────────────────────────────────────────────────

@admin_required
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


# ─── CRUD пользователей ───────────────────────────────────────────────────────

@admin_required
async def get_users(request: web.Request) -> web.Response:
    try:
        users = await get_user()
        data = [
            {
                'id':     u.id,
                'name':   u.name   or '',
                'tg_id':  u.tg_id,
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
async def create_user(request: web.Request) -> web.Response:
    try:
        data     = await request.json()
        tg_id    = data.get('tg_id')
        max_id   = data.get('max_id')
        password = data.get('password')

        update_data = {
            'name':   data.get('name', ''),
            'tg_id':  int(tg_id)  if tg_id  else None,
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
async def update_user_handler(request: web.Request) -> web.Response:
    try:
        user_id  = request.match_info['id']
        data     = await request.json()
        tg_id    = data.get('tg_id')
        max_id   = data.get('max_id')
        password = data.get('password')

        update_data = {
            'name':   data.get('name'),
            'tg_id':  int(tg_id)  if tg_id  else None,
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
async def delete_user_handler(request: web.Request) -> web.Response:
    try:
        user_id = request.match_info['id']
        await delete_user(user_id)
        logger.info('Пользователь {} удалён', user_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления пользователя: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


# ─── Логи ────────────────────────────────────────────────────────────────────

LOGS_DIR = os.path.join(PROJECT_ROOT, 'logs')
_LOGS_DIR_REAL = None


def _get_logs_dir_real() -> str:
    global _LOGS_DIR_REAL
    if _LOGS_DIR_REAL is None:
        _LOGS_DIR_REAL = os.path.realpath(LOGS_DIR)
    return _LOGS_DIR_REAL


def _safe_log_path(filename: str) -> str | None:
    if '/' in filename or '\\' in filename or filename.startswith('.'):
        return None
    if not filename.endswith('.log'):
        return None

    filepath = os.path.join(LOGS_DIR, filename)

    if not os.path.realpath(filepath).startswith(_get_logs_dir_real() + os.sep):
        return None

    return filepath


@admin_required
async def get_log_files(request: web.Request) -> web.Response:
    try:
        if not os.path.exists(LOGS_DIR):
            return web.json_response([])

        files = []
        for f in sorted(os.listdir(LOGS_DIR), reverse=True):
            if f.endswith('.log'):
                stat = os.stat(os.path.join(LOGS_DIR, f))
                files.append({
                    'name':     f,
                    'size':     stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        return web.json_response(files)
    except Exception as e:
        logger.error('Ошибка получения списка логов: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
async def get_log_content(request: web.Request) -> web.Response:
    try:
        filename = request.match_info['filename']
        filepath = _safe_log_path(filename)

        if filepath is None:
            return web.json_response({'error': 'Недопустимое имя файла'}, status=400)

        if not os.path.exists(filepath):
            return web.json_response({'error': 'Файл не найден'}, status=404)

        try:
            n = max(1, int(request.query.get('lines', '500')))
        except ValueError:
            n = 500

        level_filter = request.query.get('level', '').strip()
        search       = request.query.get('search', '').strip()

        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()

        stats = {'total': len(all_lines), 'ERROR': 0, 'WARNING': 0, 'INFO': 0, 'DEBUG': 0}
        for line in all_lines:
            for level in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
                if f'| {level}' in line:
                    stats[level] += 1
                    break

        total_lines_in_file = len(all_lines)

        if level_filter and level_filter in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
            all_lines = [l for l in all_lines if f'| {level_filter}' in l]

        if search:
            search_lower = search.lower()
            all_lines = [l for l in all_lines if search_lower in l.lower()]

        recent_lines = all_lines[-n:]

        return web.json_response({
            'filename':       filename,
            'lines':          recent_lines,
            'total_lines':    total_lines_in_file,
            'filtered_lines': len(all_lines),
            'stats':          stats,
        })

    except Exception as e:
        logger.error('Ошибка чтения лога: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)
