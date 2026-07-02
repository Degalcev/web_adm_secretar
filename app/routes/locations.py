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
