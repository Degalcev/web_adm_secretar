from aiohttp import web
from loguru import logger

from app.auth import require_csrf, require_role
from database.requests import get_organizers
from database.sending import add_organizer, update_organizer, delete_organizer


@require_role('admin')
async def get_organizers_handler(request: web.Request) -> web.Response:
    try:
        items = await get_organizers()
        data = [{'id': o.id, 'name': o.name or '', 'short_name': o.short_name or '', 'base_url': o.base_url or ''} for o in items]
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения организаторов: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


@require_role('admin')
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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


@require_role('admin')
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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


@require_role('admin')
@require_csrf
async def delete_organizer_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        await delete_organizer(item_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления организатора: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


def setup_organizers_routes(app: web.Application):
    app.router.add_get('/admin/api/organizers', get_organizers_handler)
    app.router.add_post('/admin/api/organizers', create_organizer_handler)
    app.router.add_put('/admin/api/organizers/{id}', update_organizer_handler)
    app.router.add_delete('/admin/api/organizers/{id}', delete_organizer_handler)
