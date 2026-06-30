from aiohttp import web
from loguru import logger
from datetime import date, datetime

from app.auth import admin_required, require_csrf
from database.requests import get_events, get_event_by_id, get_documents_by_event_id
from database.sending import add_event, update_event, delete_event


@admin_required
async def get_events_handler(request: web.Request) -> web.Response:
    try:
        status = request.query.get('status', '').strip()
        if status == 'completed':
            events = await get_events(completed=True)
        elif status == 'active':
            events = await get_events(completed=False)
        else:
            events = await get_events()

        data = []
        for e in events:
            docs = await get_documents_by_event_id(e.id)
            data.append({
                'id': e.id,
                'type': e.type or 'ВКС',
                'date': e.date.isoformat() if e.date else None,
                'time': e.time.strftime('%H:%M') if e.time else None,
                'organizer_id': e.organizer_id,
                'location_id': e.location_id,
                'url': e.url or '',
                'description': e.description or '',
                'completed': e.completed,
                'notification': e.notification,
                'documents': docs,
            })
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения событий: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
@require_csrf
async def create_event_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        event_id = await add_event(
            type=data.get('type', 'ВКС'),
            date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else None,
            time=datetime.strptime(data['time'], '%H:%M').time() if data.get('time') else None,
            organizer_id=data.get('organizer_id'),
            location_id=data.get('location_id'),
            url=data.get('url', ''),
            description=data.get('description', ''),
            completed=data.get('completed', False),
            notification=data.get('notification', True),
        )
        return web.json_response({'ok': True, 'id': event_id})
    except Exception as e:
        logger.error('Ошибка создания события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def update_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        data = await request.json()
        update_data = {}
        if 'date' in data:
            update_data['date'] = datetime.strptime(data['date'], '%Y-%m-%d').date() if data['date'] else None
        if 'time' in data:
            update_data['time'] = datetime.strptime(data['time'], '%H:%M').time() if data['time'] else None
        for field in ['type', 'organizer_id', 'location_id', 'url', 'description', 'completed', 'notification']:
            if field in data:
                update_data[field] = data[field]
        await update_event(event_id=event_id, **update_data)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@admin_required
@require_csrf
async def delete_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        await delete_event(event_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_vks_routes(app: web.Application):
    app.router.add_get('/admin/api/events', get_events_handler)
    app.router.add_post('/admin/api/events', create_event_handler)
    app.router.add_put('/admin/api/events/{id}', update_event_handler)
    app.router.add_delete('/admin/api/events/{id}', delete_event_handler)
