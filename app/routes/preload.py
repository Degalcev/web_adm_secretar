from aiohttp import web
from loguru import logger

from app.auth import admin_required
from database.requests import get_events, get_organizers, get_locations, get_documents_by_event_id


@admin_required
async def preload_data(request: web.Request) -> web.Response:
    try:
        events, orgs, locs = await get_events(), await get_organizers(), await get_locations()
        return web.json_response({
            'events': [
                {
                    'id': e.id, 'type': e.type or 'ВКС',
                    'date': e.date.isoformat() if e.date else None,
                    'time': e.time.strftime('%H:%M') if e.time else None,
                    'organizer_id': e.organizer_id, 'location_id': e.location_id,
                    'url': e.url or '', 'description': e.description or '',
                    'completed': e.completed, 'notification': e.notification,
                    'documents': await get_documents_by_event_id(e.id),
                }
                for e in events
            ],
            'organizers': [{'id': o.id, 'name': o.name or '', 'base_url': o.base_url or '', 'short_name': o.short_name or ''} for o in orgs],
            'locations': [{'id': l.id, 'name': l.name or ''} for l in locs],
        })
    except Exception as e:
        logger.error('Preload error: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


def setup_preload_routes(app: web.Application):
    app.router.add_get('/admin/api/preload', preload_data)
