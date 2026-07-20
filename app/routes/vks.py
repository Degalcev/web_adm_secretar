from aiohttp import web
from loguru import logger
from datetime import date, datetime, timedelta, time

from sqlalchemy import select, func, extract

from app.auth import require_csrf
from app.event_logger import capture_event_state, log_event_change, get_event_history, _compare_states
from app.event_types import validate_event_type
from database.models import async_session, Event
from database.requests import (
    get_events, count_events, get_event_counts_by_date, count_event_occurrences,
    get_event_by_id, get_documents_by_event_id, get_documents_by_event_ids,
    get_user_by_id, get_event_participants, get_event_series,
    get_series_exceptions,
)
from database.sending import (
    add_event, update_event, delete_event, lock_event, unlock_event,
    add_event_participants, remove_event_participant, replace_event_participants,
    create_event_series, delete_event_series, add_series_exception, delete_series_exception,
    add_document, delete_document,
)


def _parse_date(s: str):
    try:
        return datetime.strptime(s.strip(), '%Y-%m-%d').date() if s and s.strip() else None
    except ValueError:
        return None


def _parse_time(s: str):
    try:
        return datetime.strptime(s.strip(), '%H:%M').time() if s and s.strip() else None
    except ValueError:
        return None


async def get_events_handler(request: web.Request) -> web.Response:
    try:
        status = request.query.get('status', '').strip()
        completed = None
        if status == 'completed':
            completed = True
        elif status == 'active':
            completed = False

        limit = min(int(request.query.get('limit', '50')), 10000)

        events, has_more = await get_events(
            completed=completed,
            event_type=request.query.get('type', '').strip() or None,
            exclude_type=request.query.get('exclude_type', '').strip() or None,
            participant_id=request.query.get('participant_id', '').strip() or None,
            location_id=request.query.get('location_id', '').strip() or None,
            organizer_id=request.query.get('organizer_id', '').strip() or None,
            date_from=_parse_date(request.query.get('from', '')),
            date_to=_parse_date(request.query.get('to', '')),
            search=request.query.get('search', '').strip() or None,
            cursor_date=_parse_date(request.query.get('cursor_date', '')),
            cursor_time=_parse_time(request.query.get('cursor_time', '')),
            cursor_id=request.query.get('cursor_id', '').strip() or None,
            limit=limit,
        )

        event_ids = [e.id for e in events]
        docs_map = await get_documents_by_event_ids(event_ids) if event_ids else {}

        series_ids = set(e.series_id for e in events if e.series_id)
        series_map = {}
        series_exc_map = {}
        for sid in series_ids:
            s = await get_event_series(sid)
            if s:
                series_map[sid] = {
                    'freq': s.freq, 'interval_val': s.interval_val,
                    'by_day': s.by_day or [],
                    'until': s.until.isoformat() if s.until else None,
                }
                excs = await get_series_exceptions(sid)
                series_exc_map[sid] = [
                    {
                        'original_date': x.original_date.isoformat(),
                        'action': x.action,
                        'new_date': x.new_date.isoformat() if x.new_date else None,
                        'event_id': x.event_id,
                    }
                    for x in excs
                ]

        # Batch-resolve user names
        audit_user_ids = set()
        for e in events:
            if e.last_changed_by:
                audit_user_ids.add(e.last_changed_by)
            if e.locked_by:
                audit_user_ids.add(e.locked_by)
        audit_users = {}
        for uid in audit_user_ids:
            u = await get_user_by_id(uid)
            if u:
                name_parts = [u.last_name or '', u.first_name or '', u.patronymic or '']
                audit_users[uid] = ' '.join(p for p in name_parts if p).strip() or u.name or u.username or str(u.max_id)

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
                'url': e.url or '',
                'description': e.description or '',
                'completed': e.completed,
                'notification': e.notification,
                'documents': docs_map.get(e.id, []),
                'participants': participants,
                'series_id': e.series_id,
                'series': series_map.get(e.series_id),
                'series_exceptions': series_exc_map.get(e.series_id, []),
                'last_changed_by': audit_users.get(e.last_changed_by, '') if e.last_changed_by else '',
                'last_changed_at': e.last_changed_at.isoformat() if e.last_changed_at else None,
                'last_change_action': e.last_change_action or '',
                'locked_by': audit_users.get(e.locked_by) if e.locked_by else None,
                'locked_by_id': e.locked_by,
                'locked_at': e.locked_at.isoformat() if e.locked_at else None,
            })

        # Cursor для следующей страницы
        next_cursor_date = None
        next_cursor_time = None
        next_cursor_id = None
        if has_more and events:
            last = events[-1]
            next_cursor_date = last.date.isoformat() if last.date else None
            next_cursor_time = last.time.strftime('%H:%M') if last.time else None
            next_cursor_id = last.id

        logger.debug('Загружено {} событий (has_more: {})', len(data), has_more)

        return web.json_response({
            'events': data,
            'has_more': has_more,
            'next_cursor_date': next_cursor_date,
            'next_cursor_time': next_cursor_time,
            'next_cursor_id': next_cursor_id,
        })
    except Exception as e:
        logger.error('Ошибка получения событий: {}', repr(e))
        return web.json_response({'events': [], 'has_more': False}, status=500)


async def get_event_handler(request: web.Request) -> web.Response:
    """Получить одно событие по ID."""
    try:
        event_id = request.match_info['id']
        e = await get_event_by_id(event_id)
        if not e:
            return web.json_response({'ok': False, 'error': 'Not found'}, status=404)

        docs = await get_documents_by_event_id(event_id)
        participants = await get_event_participants(event_id)

        # Resolve lock user name
        locked_by_name = None
        if e.locked_by:
            lock_user = await get_user_by_id(e.locked_by)
            if lock_user:
                name_parts = [lock_user.last_name or '', lock_user.first_name or '', lock_user.patronymic or '']
                locked_by_name = ' '.join(p for p in name_parts if p).strip() or lock_user.name or lock_user.username or str(lock_user.max_id)

        series = None
        series_exceptions = []
        if e.series_id:
            s = await get_event_series(e.series_id)
            if s:
                series = {
                    'freq': s.freq, 'interval_val': s.interval_val,
                    'by_day': s.by_day or [],
                    'until': s.until.isoformat() if s.until else None,
                }
                excs = await get_series_exceptions(e.series_id)
                series_exceptions = [
                    {
                        'original_date': x.original_date.isoformat(),
                        'action': x.action,
                        'new_date': x.new_date.isoformat() if x.new_date else None,
                        'event_id': x.event_id,
                    }
                    for x in excs
                ]

        return web.json_response({
            'ok': True,
            'event': {
                'id': e.id,
                'type': e.type or 'ВКС',
                'date': e.date.isoformat() if e.date else None,
                'time': e.time.strftime('%H:%M') if e.time else None,
                'duration': e.duration or 60,
                'organizer_id': e.organizer_id,
                'organizer_type': e.organizer_type or 'org',
                'location_id': e.location_id,
                'url': e.url or '',
                'description': e.description or '',
                'completed': e.completed,
                'notification': e.notification,
                'documents': docs,
                'participants': participants,
                'series_id': e.series_id,
                'series': series,
                'series_exceptions': series_exceptions,
                'locked_by': locked_by_name,
                'locked_by_id': e.locked_by,
            }
        })
    except Exception as e:
        logger.error('Ошибка получения события: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def _parse_event_from_multipart(request: web.Request) -> dict:
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

        event_type = fields.get('type', 'ВКС')
        if not validate_event_type(event_type):
            return web.json_response({'ok': False, 'error': f'Неизвестный тип мероприятия: {event_type}'}, status=400)

        event_id = await add_event(
            type=event_type,
            date=datetime.strptime(fields['date'], '%Y-%m-%d').date() if fields.get('date') else None,
            time=datetime.strptime(fields['time'], '%H:%M').time() if fields.get('time') else None,
            organizer_id=fields.get('organizer_id'),
            location_id=fields.get('location_id'),
            url=fields.get('url', ''),
            description=fields.get('description', ''),
            completed=fields.get('completed', 'false') == 'true',
            notification=fields.get('notification', 'true') == 'true',
            duration=int(fields.get('duration', 60)),
            organizer_type=fields.get('organizer_type', 'org'),
            series_id=fields.get('series_id'),
            **audit_data,
        )
        logger.info('Событие создано: {}', event_id)

        participants_json = fields.get('participants')
        if participants_json:
            try:
                import json
                participants = json.loads(participants_json)
                if participants:
                    await add_event_participants(event_id, participants)
            except Exception as ex:
                logger.error('Ошибка добавления участников: {}', repr(ex))

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
        if 'type' in update_data and not validate_event_type(update_data['type']):
            return web.json_response({'ok': False, 'error': f'Неизвестный тип мероприятия: {update_data["type"]}'}, status=400)
        if 'duration' in fields:
            update_data['duration'] = int(fields['duration'])
        if 'organizer_type' in fields:
            update_data['organizer_type'] = fields['organizer_type']
        if 'series_id' in fields:
            update_data['series_id'] = fields['series_id'] or None

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

        participants_json = fields.get('participants')
        if participants_json is not None:
            try:
                import json
                participants = json.loads(participants_json)
                await replace_event_participants(event_id, participants)
            except Exception as ex:
                logger.error('Ошибка замены участников: {}', repr(ex))

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
    """
    Dashboard: агрегаты + up to 8 событий на сегодня и скоро.
    Не загружает весь массив событий — использует get_event_counts_by_date
    и отдельные маленькие выборки.
    """
    try:
        today = date.today()
        counts = await get_event_counts_by_date(completed=False)

        # Today events (лимит 8)
        today_events_raw, _ = await get_events(
            completed=False, date_from=today, date_to=today, limit=8
        )
        today_event_ids = [e.id for e in today_events_raw]
        today_docs = await get_documents_by_event_ids(today_event_ids) if today_event_ids else {}
        today_events = [
            {
                'id': e.id, 'date': e.date.isoformat(),
                'time': e.time.strftime('%H:%M') if e.time else None,
                'description': e.description or '',
                'organizer_id': e.organizer_id, 'location_id': e.location_id,
                'url': e.url or '', 'completed': e.completed,
                'documents': today_docs.get(e.id, []),
            }
            for e in today_events_raw
        ]

        # Soon events (лимит 8, начиная с завтра)
        tomorrow = today + timedelta(days=1)
        soon_events_raw, _ = await get_events(
            completed=False, date_from=tomorrow, limit=8
        )
        soon_event_ids = [e.id for e in soon_events_raw]
        soon_docs = await get_documents_by_event_ids(soon_event_ids) if soon_event_ids else {}
        soon_events = [
            {
                'id': e.id, 'date': e.date.isoformat(),
                'time': e.time.strftime('%H:%M') if e.time else None,
                'description': e.description or '',
                'organizer_id': e.organizer_id, 'location_id': e.location_id,
                'url': e.url or '', 'completed': e.completed,
                'documents': soon_docs.get(e.id, []),
            }
            for e in soon_events_raw
        ]

        # Локации и графики
        async with async_session() as session:
            # Локации сегодня
            loc_today_q = await session.execute(
                select(Event.location_id, func.count(Event.id))
                .where(Event.date == today, Event.completed == False)
                .group_by(Event.location_id)
            )
            locations_today = {str(row[0]): row[1] for row in loc_today_q if row[0]}

            # Локации все active
            loc_total_q = await session.execute(
                select(Event.location_id, func.count(Event.id))
                .where(Event.completed == False)
                .group_by(Event.location_id)
            )
            locations_total = {str(row[0]): row[1] for row in loc_total_q if row[0]}

            # График — неделя
            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)
            week_q = await session.execute(
                select(Event.date, func.count(Event.id))
                .where(Event.date >= monday, Event.date <= sunday)
                .group_by(Event.date)
            )
            week_by_date = {row[0]: row[1] for row in week_q}
            chart_week = [week_by_date.get(monday + timedelta(days=i), 0) for i in range(7)]

            # График — год по месяцам
            year_q = await session.execute(
                select(
                    extract('month', Event.date).label('month'),
                    func.count(Event.id)
                )
                .where(extract('year', Event.date) == today.year)
                .group_by(extract('month', Event.date))
            )
            year_by_month = {int(row[0]): row[1] for row in year_q}
            chart_year = [year_by_month.get(m, 0) for m in range(1, 13)]

        return web.json_response({
            'total': counts['total'],
            'completed': await count_events(completed=True),
            'active': counts['total'] - counts['missed'],
            'missed': counts['missed'],
            'today': today_events,
            'soon': soon_events,
            'locations_today': locations_today,
            'locations_total': locations_total,
            'chart_week': chart_week,
            'chart_year': chart_year,
        })
    except Exception as e:
        logger.error('Dashboard stats error: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


async def dashboard_chart(request: web.Request) -> web.Response:
    period = request.query.get('period', 'month')
    year = int(request.query.get('year', date.today().year))
    month = int(request.query.get('month', date.today().month))
    today = date.today()

    async with async_session() as session:
        if period == 'month':
            import calendar as cal
            q = await session.execute(
                select(Event.date, func.count(Event.id))
                .where(extract('year', Event.date) == year, extract('month', Event.date) == month)
                .group_by(Event.date)
            )
            by_date = {row[0].day: row[1] for row in q}
            days_in_month = cal.monthrange(year, month)[1]
            counts = [by_date.get(d, 0) for d in range(1, days_in_month + 1)]
            labels = [str(d) for d in range(1, days_in_month + 1)]
        elif period == 'all':
            q = await session.execute(
                select(extract('year', Event.date).label('y'), func.count(Event.id))
                .group_by(extract('year', Event.date))
                .order_by(extract('year', Event.date))
            )
            rows = list(q)
            labels = [str(int(r[0])) for r in rows]
            counts = [r[1] for r in rows]
        else:
            return web.json_response({'labels': [], 'counts': []})

    return web.json_response({'labels': labels, 'counts': counts})


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


# ─── Event Series ────────────────────────────────────────────────────

async def get_series_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        event = await get_event_by_id(event_id)
        if not event or not event.series_id:
            return web.json_response({'series': None, 'exceptions': []})
        series = await get_event_series(event.series_id)
        if not series:
            return web.json_response({'series': None, 'exceptions': []})
        exceptions = await get_series_exceptions(series.id)
        return web.json_response({
            'series': {
                'id': series.id, 'freq': series.freq, 'interval_val': series.interval_val,
                'by_day': series.by_day or [],
                'until': series.until.isoformat() if series.until else None,
            },
            'exceptions': [
                {
                    'id': exc.id, 'original_date': exc.original_date.isoformat(),
                    'event_id': exc.event_id, 'action': exc.action,
                    'new_date': exc.new_date.isoformat() if exc.new_date else None,
                }
                for exc in exceptions
            ],
        })
    except Exception as e:
        logger.error('Ошибка получения серии: {}', repr(e))
        return web.json_response({'series': None, 'exceptions': []}, status=500)


@require_csrf
async def create_series_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        data = await request.json()
        prev_event = await get_event_by_id(event_id)
        old_series_id = prev_event.series_id if prev_event else None
        series_id = await create_event_series(
            freq=data.get('freq', 'weekly'),
            interval_val=data.get('interval_val', 1),
            by_day=data.get('by_day', []),
            until=datetime.strptime(data['until'], '%Y-%m-%d').date() if data.get('until') else None,
        )
        await update_event(event_id=event_id, series_id=series_id)
        if old_series_id and old_series_id != series_id:
            await delete_event_series(old_series_id)
        return web.json_response({'ok': True, 'series_id': series_id})
    except Exception as e:
        logger.error('Ошибка создания серии: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def delete_series_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        event = await get_event_by_id(event_id)
        if not event or not event.series_id:
            return web.json_response({'ok': False, 'error': 'Серия не найдена'}, status=404)
        await update_event(event_id=event_id, series_id=None)
        await delete_event_series(event.series_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления серии: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


@require_csrf
async def add_exception_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        data = await request.json()
        event = await get_event_by_id(event_id)
        if not event or not event.series_id:
            return web.json_response({'ok': False, 'error': 'Серия не найдена'}, status=404)
        exc_id = await add_series_exception(
            series_id=event.series_id,
            original_date=datetime.strptime(data['original_date'], '%Y-%m-%d').date(),
            event_id=data.get('event_id'),
            action=data.get('action', 'skip'),
            new_date=datetime.strptime(data['new_date'], '%Y-%m-%d').date() if data.get('new_date') else None,
        )
        return web.json_response({'ok': True, 'exception_id': exc_id})
    except Exception as e:
        logger.error('Ошибка добавления исключения: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def delete_exception_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        data = await request.json()
        event = await get_event_by_id(event_id)
        if not event or not event.series_id:
            return web.json_response({'ok': False, 'error': 'Серия не найдена'}, status=404)
        await delete_series_exception(
            series_id=event.series_id,
            original_date=datetime.strptime(data['original_date'], '%Y-%m-%d').date(),
        )
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка удаления исключения: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def get_events_stats(request: web.Request) -> web.Response:
    """Счётчики из БД агрегатными запросами — без загрузки строк событий."""
    try:
        status = request.query.get('status', 'active')
        event_type = request.query.get('type', '').strip() or None
        exclude_type = request.query.get('exclude_type', '').strip() or None
        organizer_id = request.query.get('organizer_id', '').strip() or None
        location_id = request.query.get('location_id', '').strip() or None
        search = request.query.get('search', '').strip() or None
        date_from = _parse_date(request.query.get('from', ''))
        date_to = _parse_date(request.query.get('to', ''))
        today = date.today()

        # Симметрия: и ВКС, и Мероприятия — это одна таблица с фильтром по типу.
        # Активные списки разворачивают серии (общее ядро) — считаем по occurrences одной функцией.
        # Завершённые не разворачиваются — считаем по строкам (base-row).
        if status == 'completed':
            completed = (status == 'completed')
            common = dict(completed=completed, event_type=event_type, exclude_type=exclude_type,
                          location_id=location_id, organizer_id=organizer_id, search=search)

            def _clip(lo, hi):
                # Пересечение [lo, hi] с фильтром [date_from, date_to]; None — без границы
                if date_from and (lo is None or date_from > lo):
                    lo = date_from
                if date_to and (hi is None or date_to < hi):
                    hi = date_to
                return lo, hi

            async def _cnt(lo, hi):
                if lo is not None and hi is not None and lo > hi:
                    return 0
                return await count_events(date_from=lo, date_to=hi, **common)

            total = await _cnt(*_clip(None, None))
            today_count = await _cnt(*_clip(today, today))
            soon_count = await _cnt(*_clip(today + timedelta(days=1), None))
            missed_count = await _cnt(*_clip(None, today - timedelta(days=1)))
            return web.json_response({
                'total': total, 'today': today_count,
                'soon': soon_count, 'missed': missed_count,
            })

        # «Мероприятия» (активные, не-ВКС) — occurrence-based с учётом повторов
        stats = await count_event_occurrences(
            completed=False, event_type=event_type, exclude_type=exclude_type,
            location_id=location_id, organizer_id=organizer_id, search=search,
            date_from=date_from, date_to=date_to,
        )
        return web.json_response(stats)
    except Exception as e:
        logger.error('Ошибка stats: {}', repr(e))
        return web.json_response({'total': 0, 'today': 0, 'soon': 0, 'missed': 0})


def setup_vks_routes(app: web.Application):
    app.router.add_get('/admin/api/events', get_events_handler)
    app.router.add_get('/admin/api/events/stats', get_events_stats)
    app.router.add_get('/admin/api/events/{id}/single', get_event_handler)
    app.router.add_get('/admin/api/dashboard', dashboard_stats)
    app.router.add_get('/admin/api/dashboard/chart', dashboard_chart)
    app.router.add_post('/admin/api/events', create_event_handler)
    app.router.add_put('/admin/api/events/{id}', update_event_handler)
    app.router.add_delete('/admin/api/events/{id}', delete_event_handler)
    app.router.add_get('/admin/api/events/{event_id}/history', get_event_history_handler)
    app.router.add_put('/admin/api/events/{id}/lock', lock_event_handler)
    app.router.add_put('/admin/api/events/{id}/unlock', unlock_event_handler)
    app.router.add_get('/admin/api/events/{id}/series', get_series_handler)
    app.router.add_post('/admin/api/events/{id}/series', create_series_handler)
    app.router.add_delete('/admin/api/events/{id}/series', delete_series_handler)
    app.router.add_post('/admin/api/events/{id}/series/exception', add_exception_handler)
    app.router.add_delete('/admin/api/events/{id}/series/exception', delete_exception_handler)
