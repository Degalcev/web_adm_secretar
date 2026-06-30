from aiohttp import web
from loguru import logger
from argon2 import PasswordHasher

from app.auth import admin_required, require_csrf
from database.requests import get_user, get_user_by_max_id
from database.sending import add_user, update_user, delete_user

ph = PasswordHasher()


@admin_required
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
