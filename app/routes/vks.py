from aiohttp import web
from loguru import logger
from datetime import date, datetime, timedelta, time

from sqlalchemy import select, func, extract, case

from app.auth import require_csrf
from app.event_logger import capture_event_state, log_event_change, get_event_history, _compare_states
from app.event_types import validate_event_type
from database.models import async_session, Event, EventSeries, EventSeriesException
from database.requests import (
    get_events, count_events, get_event_counts_by_date, count_event_occurrences,
    expand_series_dates,
    get_event_by_id, get_documents_by_event_id, get_documents_by_event_ids,
    get_user_by_id, get_event_participants, get_event_series,
    get_series_exceptions,
    get_participants_by_event_ids, get_series_by_ids, get_series_exceptions_by_ids,
    get_users_by_ids,
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

        limit = min(int(request.query.get('limit', '50')), 200)

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
            include_series_anchors=request.query.get('include_series_anchors', '') in ('1', 'true', 'True'),
            limit=limit,
        )

        event_ids = [e.id for e in events]
        docs_map = await get_documents_by_event_ids(event_ids) if event_ids else {}

        # Batch: series + exceptions (1+1 запрос вместо 2N)
        series_ids = list(set(e.series_id for e in events if e.series_id))
        series_map = await get_series_by_ids(series_ids) if series_ids else {}
        series_exc_map = await get_series_exceptions_by_ids(series_ids) if series_ids else {}

        # Batch: audit users (1 запрос вместо N)
        audit_user_ids = set()
        for e in events:
            if e.last_changed_by:
                audit_user_ids.add(e.last_changed_by)
            if e.locked_by:
                audit_user_ids.add(e.locked_by)
        audit_users = await get_users_by_ids(list(audit_user_ids)) if audit_user_ids else {}

        # Batch: participants (1 запрос вместо N)
        participants_map = await get_participants_by_event_ids(event_ids) if event_ids else {}

        data = []
        for e in events:
            participants = participants_map.get(e.id, [])
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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


async def dashboard_stats(request: web.Request) -> web.Response:
    """
    Комбо-дашборд: раздельные агрегаты ВКС и Мероприятий,
    события на сегодня (оба типа, для группировки по залам),
    ближайшие, локации и двухсерийные графики.
    ВКС: type == 'ВКС'; Мероприятия: type != 'ВКС'.
    """
    try:
        today = date.today()
        tomorrow = today + timedelta(days=1)

        # Агрегаты по модулям (активные — occurrence-based; завершённые — по строкам)
        vks_active = await count_event_occurrences(completed=False, event_type='ВКС')
        evt_active = await count_event_occurrences(completed=False, exclude_type='ВКС')
        vks_completed = await count_events(completed=True, event_type='ВКС')
        evt_completed = await count_events(completed=True, exclude_type='ВКС')

        def _serialize(e, docs_map, occ_date=None):
            d = occ_date or e.date
            return {
                'id': e.id,
                'type': e.type or 'ВКС',
                'date': d.isoformat() if d else None,
                'time': e.time.strftime('%H:%M') if e.time else None,
                'duration': e.duration,
                'description': e.description or '',
                'organizer_id': e.organizer_id,
                'location_id': e.location_id,
                'url': e.url or '',
                'completed': e.completed,
                'series_id': e.series_id,
                'documents': docs_map.get(e.id, []),
            }

        # Разворачиваем occurrences в окне — включая серии,
        # базовая дата которых в прошлом (напр. серия из пропущенного).
        async def _collect_occurrences(session, win_start, win_end):
            occ = []  # [(event, occ_date), ...]
            ns_rows = list(await session.scalars(
                select(Event).where(
                    Event.series_id.is_(None),
                    Event.completed == False,
                    Event.date >= win_start,
                    Event.date <= win_end,
                )
            ))
            for e in ns_rows:
                occ.append((e, e.date))
            series_rows = list(await session.scalars(
                select(Event).where(Event.series_id.is_not(None), Event.completed == False)
            ))
            sids = list({e.series_id for e in series_rows})
            series_by_id, exc_by_series = {}, {}
            if sids:
                for srow in await session.scalars(select(EventSeries).where(EventSeries.id.in_(sids))):
                    series_by_id[srow.id] = srow
                for x in await session.scalars(
                    select(EventSeriesException).where(EventSeriesException.series_id.in_(sids))):
                    if x.action == 'skip':
                        exc_by_series.setdefault(x.series_id, set()).add(x.original_date)
            for e in series_rows:
                srow = series_by_id.get(e.series_id)
                if not srow:
                    if win_start <= e.date <= win_end:
                        occ.append((e, e.date))
                    continue
                for d in expand_series_dates(
                    srow.freq, srow.interval_val, srow.by_day, srow.until, e.date,
                    win_start, win_end, exc_by_series.get(e.series_id, set())):
                    occ.append((e, d))
            return occ

        def _occ_key(item):
            e, d = item
            return (d, e.time.strftime('%H:%M') if e.time else '99:99')

        soon_horizon = today + timedelta(days=60)
        async with async_session() as session:
            today_occ = await _collect_occurrences(session, today, today)
            soon_occ = await _collect_occurrences(session, tomorrow, soon_horizon)

        today_occ.sort(key=_occ_key)
        soon_occ.sort(key=_occ_key)
        soon_occ = soon_occ[:12]

        all_ids = list({e.id for e, _ in today_occ} | {e.id for e, _ in soon_occ})
        docs_map = await get_documents_by_event_ids(all_ids) if all_ids else {}

        today_events = [_serialize(e, docs_map, d) for e, d in today_occ[:100]]
        soon_events = [_serialize(e, docs_map, d) for e, d in soon_occ]

        # Залы на сегодня — из occurrences (включая серии)
        locations_today = {}
        for e, d in today_occ:
            if e.location_id:
                k = str(e.location_id)
                locations_today[k] = locations_today.get(k, 0) + 1

        async with async_session() as session:

            loc_total_q = await session.execute(
                select(Event.location_id, func.count(Event.id))
                .where(Event.completed == False)
                .group_by(Event.location_id)
            )
            locations_total = {str(row[0]): row[1] for row in loc_total_q if row[0]}

            vks_id = case((Event.type == 'ВКС', Event.id))
            evt_id = case((Event.type != 'ВКС', Event.id))

            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)
            week_q = await session.execute(
                select(Event.date, func.count(vks_id), func.count(evt_id))
                .where(Event.date >= monday, Event.date <= sunday)
                .group_by(Event.date)
            )
            wk = {row[0]: (row[1], row[2]) for row in week_q}
            chart_week_vks = [wk.get(monday + timedelta(days=i), (0, 0))[0] for i in range(7)]
            chart_week_events = [wk.get(monday + timedelta(days=i), (0, 0))[1] for i in range(7)]

            year_q = await session.execute(
                select(extract('month', Event.date).label('month'),
                       func.count(vks_id), func.count(evt_id))
                .where(extract('year', Event.date) == today.year)
                .group_by(extract('month', Event.date))
            )
            yr = {int(row[0]): (row[1], row[2]) for row in year_q}
            chart_year_vks = [yr.get(m, (0, 0))[0] for m in range(1, 13)]
            chart_year_events = [yr.get(m, (0, 0))[1] for m in range(1, 13)]

        active_total = (vks_active['today'] + vks_active['soon']
                        + evt_active['today'] + evt_active['soon'])
        missed_total = vks_active['missed'] + evt_active['missed']
        completed_total = vks_completed + evt_completed

        return web.json_response({
            'vks': {
                'total': vks_active['total'],
                'active': vks_active['today'] + vks_active['soon'],
                'missed': vks_active['missed'],
                'completed': vks_completed,
            },
            'events': {
                'total': evt_active['total'],
                'active': evt_active['today'] + evt_active['soon'],
                'missed': evt_active['missed'],
                'completed': evt_completed,
            },
            'summary': {
                'active': active_total,
                'missed': missed_total,
                'completed': completed_total,
                'total': active_total + completed_total,
            },
            'today': today_events,
            'soon': soon_events,
            'locations_today': locations_today,
            'locations_total': locations_total,
            'chart_week': {'vks': chart_week_vks, 'events': chart_week_events},
            'chart_year': {'vks': chart_year_vks, 'events': chart_year_events},
        })
    except Exception as e:
        logger.error('Dashboard stats error: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


async def dashboard_chart(request: web.Request) -> web.Response:
    """Двухсерийный график (ВКС и Мероприятия) за месяц / всё время."""
    period = request.query.get('period', 'month')
    year = int(request.query.get('year', date.today().year))
    month = int(request.query.get('month', date.today().month))

    vks_id = case((Event.type == 'ВКС', Event.id))
    evt_id = case((Event.type != 'ВКС', Event.id))

    async with async_session() as session:
        if period == 'month':
            import calendar as _cal
            q = await session.execute(
                select(Event.date, func.count(vks_id), func.count(evt_id))
                .where(extract('year', Event.date) == year,
                       extract('month', Event.date) == month)
                .group_by(Event.date)
            )
            by_date = {row[0].day: (row[1], row[2]) for row in q}
            days_in_month = _cal.monthrange(year, month)[1]
            labels = [str(d) for d in range(1, days_in_month + 1)]
            vks = [by_date.get(d, (0, 0))[0] for d in range(1, days_in_month + 1)]
            events = [by_date.get(d, (0, 0))[1] for d in range(1, days_in_month + 1)]
        elif period == 'all':
            q = await session.execute(
                select(extract('year', Event.date).label('y'),
                       func.count(vks_id), func.count(evt_id))
                .group_by(extract('year', Event.date))
                .order_by(extract('year', Event.date))
            )
            rows = list(q)
            labels = [str(int(r[0])) for r in rows]
            vks = [r[1] for r in rows]
            events = [r[2] for r in rows]
        else:
            return web.json_response({'labels': [], 'vks': [], 'events': []})

    return web.json_response({'labels': labels, 'vks': vks, 'events': events})


async def get_event_history_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['event_id']
        history = await get_event_history(event_id)
        return web.json_response({'ok': True, 'history': history})
    except Exception as e:
        logger.error('Ошибка получения истории: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


@require_csrf
async def unlock_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        await unlock_event(event_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка unlock: {}', repr(e))
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


@require_csrf
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
        return web.json_response(
            {'ok': False, 'code': 'INTERNAL_ERROR', 'message': 'Внутренняя ошибка сервера'},
            status=500,
        )


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
