from aiohttp import web
from loguru import logger
from datetime import datetime

from database.requests import get_events, get_event_participants


async def print_events_handler(request: web.Request) -> web.Response:
    try:
        participant_id = request.query.get('participant_id', '').strip() or None
        event_type = request.query.get('type', '').strip() or None
        date_from_str = request.query.get('from', '').strip()
        date_to_str = request.query.get('to', '').strip()

        date_from = datetime.strptime(date_from_str, '%Y-%m-%d').date() if date_from_str else None
        date_to = datetime.strptime(date_to_str, '%Y-%m-%d').date() if date_to_str else None

        events, total, _ = await get_events(
            participant_id=participant_id,
            event_type=event_type,
            date_from=date_from,
            date_to=date_to,
            limit=10000,
        )

        data = []
        for e in events:
            participants = await get_event_participants(e.id)
            data.append({
                'id': e.id,
                'type': e.type or 'ВКС',
                'date': e.date.isoformat() if e.date else None,
                'time': e.time.strftime('%H:%M') if e.time else None,
                'duration': e.duration or 60,
                'organizer_id': e.organizer_id,
                'organizer_type': e.organizer_type or 'org',
                'location_id': e.location_id,
                'description': e.description or '',
                'completed': e.completed,
                'participants': participants,
            })

        return web.json_response({
            'events': data,
            'total': total,
        })
    except Exception as e:
        logger.error('Ошибка печати: {}', repr(e))
        return web.json_response({'events': [], 'total': 0}, status=500)


def setup_print_routes(app: web.Application):
    app.router.add_get('/admin/api/events/print', print_events_handler)
