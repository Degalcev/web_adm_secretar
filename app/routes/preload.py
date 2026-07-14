from aiohttp import web
from loguru import logger

from database.requests import get_events, get_organizers, get_locations, get_documents_by_event_ids, get_user_by_id


async def preload_data(request: web.Request) -> web.Response:
    try:
        events_result, orgs, locs = await get_events(limit=10000), await get_organizers(), await get_locations()
        events = events_result[0]
        event_ids = [e.id for e in events]
        docs_map = await get_documents_by_event_ids(event_ids) if event_ids else {}

        # Resolve lock users
        lock_user_ids = set()
        for e in events:
            if e.locked_by:
                lock_user_ids.add(e.locked_by)
        lock_users = {}
        for uid in lock_user_ids:
            u = await get_user_by_id(uid)
            if u:
                parts = [u.last_name or '', u.first_name or '', u.patronymic or '']
                lock_users[uid] = ' '.join(p for p in parts if p).strip() or u.name or str(u.max_id)

        return web.json_response({
            'events': [
                {
                    'id': e.id, 'type': e.type or 'ВКС',
                    'date': e.date.isoformat() if e.date else None,
                    'time': e.time.strftime('%H:%M') if e.time else None,
                    'duration': e.duration or 60,
                    'organizer_id': e.organizer_id, 'organizer_type': e.organizer_type or 'org',
                    'location_id': e.location_id,
                    'url': e.url or '', 'description': e.description or '',
                    'completed': e.completed, 'notification': e.notification,
                    'documents': docs_map.get(e.id, []),
                    'series_id': e.series_id,
                    'locked_by': lock_users.get(e.locked_by),
                    'locked_by_id': e.locked_by,
                    'locked_at': e.locked_at.isoformat() if e.locked_at else None,
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
