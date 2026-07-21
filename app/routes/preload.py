from aiohttp import web
from loguru import logger

from database.requests import get_organizers, get_locations


async def preload_data(request: web.Request) -> web.Response:
    """
    Возвращает только справочники — локации и организаторов.
    События больше не грузятся при старте: их много, они меняются,
    и каждая страница сама запрашивает нужный срез через /api/events.
    """
    try:
        orgs = await get_organizers()
        locs = await get_locations()
        return web.json_response({
            'organizers': [
                {'id': o.id, 'name': o.name or '', 'base_url': o.base_url or '', 'short_name': o.short_name or ''}
                for o in orgs
            ],
            'locations': [
                {'id': l.id, 'name': l.name or ''}
                for l in locs
            ],
        })
    except Exception as e:
        logger.error('Preload error: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


def setup_preload_routes(app: web.Application):
    app.router.add_get('/admin/api/preload', preload_data)
