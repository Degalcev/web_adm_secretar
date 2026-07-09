from aiohttp import web
from loguru import logger
from datetime import date, datetime, timedelta, time

from app.auth import require_csrf
from app.event_logger import capture_event_state, log_event_change, get_event_history, _compare_states
from database.requests import get_events, get_event_by_id, get_documents_by_event_id, get_documents_by_event_ids, get_user_by_id, cleanup_stale_locks
from database.sending import add_event, update_event, delete_event, add_document, delete_document, lock_event, unlock_event


async def get_events_handler(request: web.Request) -> web.Response:
    try:
        await cleanup_stale_locks()
        status = request.query.get('status', '').strip()
        if status == 'completed':
            events = await get_events(completed=True)
        elif status == 'active':
            events = await get_events(completed=False)
        else:
            events = await get_events()

        data = []
        event_ids = [e.id for e in events]
        docs_map = await get_documents_by_event_ids(event_ids)

        # Resolve audit user names
        audit_user_ids = set()
        for e in events:
            if e.last_changed_by:
                audit_user_ids.add(e.last_changed_by)
        audit_users = {}
        for uid in audit_user_ids:
            u = await get_user_by_id(uid)
            if u:
                name_parts = [u.last_name or '', u.first_name or '', u.patronymic or '']
                audit_users[uid] = ' '.join(p for p in name_parts if p).strip() or u.name or u.username or str(u.max_id)

        for e in events:
            changed_by_name = audit_users.get(e.last_changed_by, '') if e.last_changed_by else ''

            # Resolve lock user
            locked_by_name = None
            locked_by_id = e.locked_by
            if e.locked_by:
                lu = await get_user_by_id(e.locked_by)
                if lu:
                    parts = [lu.last_name or '', lu.first_name or '', lu.patronymic or '']
                    locked_by_name = ' '.join(p for p in parts if p).strip() or lu.name or str(lu.max_id)

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
                'documents': docs_map.get(e.id, []),
                'last_changed_by': changed_by_name,
                'last_changed_at': e.last_changed_at.isoformat() if e.last_changed_at else None,
                'last_change_action': e.last_change_action or '',
                'locked_by': locked_by_name,
                'locked_by_id': locked_by_id,
                'locked_at': e.locked_at.isoformat() if e.locked_at else None,
            })
        logger.debug('Загружено {} событий', len(data))
        return web.json_response(data)
    except Exception as e:
        logger.error('Ошибка получения событий: {}', repr(e))
        return web.json_response([], status=500)


async def _parse_event_from_multipart(request: web.Request) -> dict:
    """Парсит multipart форму: поля события + файлы."""
    reader = await request.multipart()
    fields = {}
    files = []

    while True:
        part = await reader.next()
        if part is None:
            break

        if part.name == 'files':
            filename = part.filename
            content = await part.read()
            files.append({'name': filename, 'size': len(content), 'content': content})
            logger.debug('Получен файл: {} ({} байт)', filename, len(content))
        else:
            value = (await part.read()).decode('utf-8')
            fields[part.name] = value

    return {'fields': fields, 'files': files}


@require_csrf
async def create_event_handler(request: web.Request) -> web.Response:
    try:
        parsed = await _parse_event_from_multipart(request)
        fields = parsed['fields']
        files = parsed['files']

        user = request.get('user')
        audit_data = {}
        if user:
            audit_data = {
                'last_changed_by': user.id,
                'last_changed_at': datetime.utcnow(),
                'last_change_action': 'create',
            }

        event_id = await add_event(
            type=fields.get('type', 'ВКС'),
            date=datetime.strptime(fields['date'], '%Y-%m-%d').date() if fields.get('date') else None,
            time=datetime.strptime(fields['time'], '%H:%M').time() if fields.get('time') else None,
            organizer_id=fields.get('organizer_id'),
            location_id=fields.get('location_id'),
            url=fields.get('url', ''),
            description=fields.get('description', ''),
            completed=fields.get('completed', 'false') == 'true',
            notification=fields.get('notification', 'true') == 'true',
            **audit_data,
        )
        logger.info('Событие создано: {}', event_id)

        for f in files:
            await add_document(event_id=event_id, name=f['name'], size=f['size'], content=f['content'])
            logger.info('Документ {} привязан к событию {}', f['name'], event_id)

        await log_event_change(event_id, str(user.id) if user else None, 'create')

        return web.json_response({'ok': True, 'id': event_id})
    except Exception as e:
        logger.error('Ошибка создания события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def update_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        parsed = await _parse_event_from_multipart(request)
        fields = parsed['fields']
        files = parsed['files']

        update_data = {}
        if 'date' in fields:
            update_data['date'] = datetime.strptime(fields['date'], '%Y-%m-%d').date() if fields['date'] else None
        if 'time' in fields:
            update_data['time'] = datetime.strptime(fields['time'], '%H:%M').time() if fields['time'] else None
        for field in ['type', 'organizer_id', 'location_id', 'url', 'description', 'completed', 'notification']:
            if field in fields:
                if field in ('completed', 'notification'):
                    update_data[field] = fields[field] == 'true'
                else:
                    update_data[field] = fields[field]

        user = request.get('user')
        if user:
            update_data['last_changed_by'] = user.id
            update_data['last_changed_at'] = datetime.utcnow()
            update_data['last_change_action'] = 'update'

        old_state = await capture_event_state(event_id)
        existing_docs_before = await get_documents_by_event_id(event_id)
        await update_event(event_id=event_id, **update_data)
        logger.info('Событие обновлено: {}', event_id)

        keep_ids = fields.get('keep_doc_ids')
        keep_list = [x.strip() for x in keep_ids.split(',') if x.strip()] if keep_ids else []
        if keep_ids is not None:
            for doc in existing_docs_before:
                if doc['id'] not in keep_list:
                    await delete_document(doc['id'])
                    logger.info('Документ {} удалён из события {}', doc['id'], event_id)

        for f in files:
            await add_document(event_id=event_id, name=f['name'], size=f['size'], content=f['content'])
            logger.info('Документ {} добавлен в событие {}', f['name'], event_id)

        new_state = await capture_event_state(event_id)
        action = 'update'
        if old_state and new_state and 'completed' in old_state and 'completed' in new_state:
            if old_state['completed'] != new_state['completed']:
                action = 'complete' if new_state['completed'] else 'uncomplete'

        removed_docs = [{'name': d['name'], 'id': d['id']} for d in existing_docs_before if d['id'] not in keep_list]
        added_docs = [{'name': f['name'], 'size': f['size']} for f in files]
        doc_changes = {'added': added_docs, 'removed': removed_docs} if (removed_docs or added_docs) else None

        changes = _compare_states(old_state, new_state)
        if action == 'update' and doc_changes and doc_changes.get('removed') and not changes:
            action = 'doc_remove'

        await log_event_change(event_id, str(user.id) if user else None, action, old_state, new_state, doc_changes)

        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def delete_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        user = request.get('user')
        old_state = await capture_event_state(event_id)
        if user:
            logger.info('Event {} deleted by user {} ({})', event_id, user.id, user.max_id)
        await log_event_change(event_id, str(user.id) if user else None, 'delete', old_state)
        # Сначала удаляем документы события
        docs = await get_documents_by_event_id(event_id)
        for doc in docs:
            await delete_document(doc['id'])
        await delete_event(event_id)
        logger.info('Событие и {} документ(ов) удалены: {}', len(docs), event_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def dashboard_stats(request: web.Request) -> web.Response:
    try:
        events = await get_events()
        today = date.today()
        tomorrow = today + timedelta(days=1)

        total = len(events)
        completed = sum(1 for e in events if e.completed)
        active = sum(1 for e in events if not e.completed and e.date and e.date >= today)
        missed = sum(1 for e in events if not e.completed and e.date and e.date < today)

        # Today events (up to 8)
        today_events = []
        for e in events:
            if e.completed or not e.date:
                continue
            ev_date = e.date
            ev_time = e.time or time(23, 59)
            dt = datetime.combine(ev_date, ev_time)
            if ev_date == today:
                today_events.append({
                    'id': e.id, 'date': e.date.isoformat(),
                    'time': e.time.strftime('%H:%M') if e.time else None,
                    'description': e.description or '',
                    'organizer_id': e.organizer_id, 'location_id': e.location_id,
                    'url': e.url or '', 'completed': e.completed,
                    'documents': await get_documents_by_event_id(e.id)
                })
        today_events.sort(key=lambda x: x['time'] or '23:59')
        today_events = today_events[:8]

        # Soon events (up to 8)
        soon_events = []
        for e in events:
            if e.completed or not e.date:
                continue
            if e.date > today:
                soon_events.append({
                    'id': e.id, 'date': e.date.isoformat(),
                    'time': e.time.strftime('%H:%M') if e.time else None,
                    'description': e.description or '',
                    'organizer_id': e.organizer_id, 'location_id': e.location_id,
                    'url': e.url or '', 'completed': e.completed,
                    'documents': await get_documents_by_event_id(e.id)
                })
        soon_events.sort(key=lambda x: (x['date'], x['time'] or '23:59'))
        soon_events = soon_events[:8]

        return web.json_response({
            'total': total, 'completed': completed, 'active': active, 'missed': missed,
            'today': today_events, 'soon': soon_events
        })
    except Exception as e:
        logger.error('Dashboard stats error: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


async def get_event_history_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['event_id']
        history = await get_event_history(event_id)
        return web.json_response({'ok': True, 'history': history})
    except Exception as e:
        logger.error('Ошибка получения истории: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def lock_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        user = request.get('user')
        if not user:
            return web.json_response({'ok': False, 'error': 'Не авторизован'}, status=401)
        result = await lock_event(event_id, user.id)
        return web.json_response(result)
    except Exception as e:
        logger.error('Ошибка lock: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def unlock_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        await unlock_event(event_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка unlock: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


def setup_vks_routes(app: web.Application):
    app.router.add_get('/admin/api/events', get_events_handler)
    app.router.add_get('/admin/api/dashboard', dashboard_stats)
    app.router.add_post('/admin/api/events', create_event_handler)
    app.router.add_put('/admin/api/events/{id}', update_event_handler)
    app.router.add_delete('/admin/api/events/{id}', delete_event_handler)
    app.router.add_get('/admin/api/events/{event_id}/history', get_event_history_handler)
    app.router.add_put('/admin/api/events/{id}/lock', lock_event_handler)
    app.router.add_put('/admin/api/events/{id}/unlock', unlock_event_handler)
