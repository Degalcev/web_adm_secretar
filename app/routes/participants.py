from aiohttp import web
from loguru import logger

from app.auth import require_csrf
from database.requests import get_event_participants, search_users_for_participants
from database.sending import add_event_participants, remove_event_participant


async def get_participants_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        participants = await get_event_participants(event_id)
        return web.json_response(participants)
    except Exception as e:
        logger.error('Ошибка получения участников: {}', repr(e))
        return web.json_response([], status=500)


@require_csrf
async def add_participants_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        data = await request.json()
        participants = data.get('participants', [])
        ids = await add_event_participants(event_id, participants)
        return web.json_response({'ok': True, 'ids': ids})
    except Exception as e:
        logger.error('Ошибка добавления участников: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def remove_participant_handler(request: web.Request) -> web.Response:
    try:
        participant_id = request.match_info['pid']
        await remove_event_participant(participant_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления участника: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def search_users_handler(request: web.Request) -> web.Response:
    try:
        query = request.query.get('q', '')
        users = await search_users_for_participants(query)
        return web.json_response(users)
    except Exception as e:
        logger.error('Ошибка поиска пользователей: {}', repr(e))
        return web.json_response([], status=500)


def setup_participants_routes(app: web.Application):
    app.router.add_get('/admin/api/events/{id}/participants', get_participants_handler)
    app.router.add_post('/admin/api/events/{id}/participants', add_participants_handler)
    app.router.add_delete('/admin/api/events/{id}/participants/{pid}', remove_participant_handler)
    app.router.add_get('/admin/api/participants/search', search_users_handler)
