from datetime import datetime, date, time
from loguru import logger
from sqlalchemy import select, update, and_, or_, func

from database.models import async_session, User, Organizer, Location, Session, Event, Document, EventHistory, EventParticipant, EventSeries, EventSeriesException


async def get_user(user_max_id=None):
    async with async_session() as session:
        if not user_max_id:
            result = await session.scalars(select(User))
        else:
            result = await session.scalar(select(User).where(User.max_id == int(user_max_id)))
        return result


async def get_user_by_max_id(max_id: int):
    async with async_session() as session:
        result = await session.scalar(select(User).where(User.max_id == max_id))
        return result


async def get_user_by_login(login: str):
    async with async_session() as session:
        if login.isdigit():
            result = await session.scalar(select(User).where(User.max_id == int(login)))
            if result:
                return result
        result = await session.scalar(select(User).where(User.username == login))
        if result:
            return result
        result = await session.scalar(select(User).where(User.name == login))
        return result


async def get_organizers():
    async with async_session() as session:
        result = await session.scalars(select(Organizer))
        return list(result)


async def get_organizer_by_id(organizer_id: str):
    async with async_session() as session:
        return await session.scalar(select(Organizer).where(Organizer.id == organizer_id))


async def get_organizers_with_usage():
    async with async_session() as session:
        result = await session.execute(
            select(
                Organizer.id, Organizer.name, Organizer.base_url, Organizer.short_name,
                func.count(Event.id).label('usage_count'),
            )
            .outerjoin(Event, Organizer.id == Event.organizer_id)
            .group_by(Organizer.id)
            .order_by(func.count(Event.id).desc())
        )
        rows = result.all()
        return [
            {'id': row.id, 'name': row.name or '', 'base_url': row.base_url or '',
             'short_name': row.short_name or '', 'usage_count': row.usage_count}
            for row in rows
        ]


async def get_locations():
    async with async_session() as session:
        result = await session.scalars(select(Location))
        return list(result)


async def get_location_by_id(location_id: str):
    async with async_session() as session:
        return await session.scalar(select(Location).where(Location.id == location_id))


async def get_session_by_token(token: str):
    async with async_session() as session:
        result = await session.scalar(
            select(Session).where(
                Session.token == token,
                Session.expires_at > datetime.utcnow()
            )
        )
        return result


async def get_user_by_id(user_id: str):
    async with async_session() as session:
        result = await session.scalar(select(User).where(User.id == user_id))
        return result


# ─── Events ───────────────────────────────────────────────────────────

async def get_events(
    completed: bool = None,
    event_type: str = None,
    exclude_type: str = None,
    participant_id: str = None,
    location_id: str = None,
    organizer_id: str = None,
    date_from: date = None,
    date_to: date = None,
    search: str = None,
    cursor_date: date = None,
    cursor_time: time = None,
    cursor_id: str = None,
    limit: int = 50,
):
    """
    Серверная пагинация cursor-based.

    Сортировка:
      - active (completed=False): ASC по date, time, id — ближайшие сначала
      - completed (completed=True): DESC по date, time, id — последние сначала
      - без фильтра: DESC

    cursor_id добавлен для детерминированной пагинации при совпадении date+time.
    """
    async with async_session() as session:
        query = select(Event)

        # ── Фильтры ────────────────────────────────────────────────
        if completed is not None:
            query = query.where(Event.completed == completed)
        if event_type:
            query = query.where(Event.type == event_type)
        if exclude_type:
            query = query.where(Event.type != exclude_type)
        if location_id:
            query = query.where(Event.location_id == location_id)
        if organizer_id:
            query = query.where(Event.organizer_id == organizer_id)
        if date_from:
            query = query.where(Event.date >= date_from)
        if date_to:
            query = query.where(Event.date <= date_to)
        if search:
            query = query.where(
                or_(
                    Event.description.ilike(f'%{search}%'),
                    Event.url.ilike(f'%{search}%'),
                )
            )
        if participant_id:
            query = (query
                     .join(EventParticipant, Event.id == EventParticipant.event_id)
                     .where(EventParticipant.user_id == participant_id))

        # ── Cursor + сортировка ────────────────────────────────────
        asc_mode = completed is False  # active → ASC; completed/all → DESC

        if cursor_date is not None and cursor_id is not None:
            if asc_mode:
                # Следующая страница: строки ПОСЛЕ курсора (позже по времени)
                if cursor_time is not None:
                    query = query.where(
                        or_(
                            Event.date > cursor_date,
                            and_(Event.date == cursor_date, Event.time > cursor_time),
                            and_(Event.date == cursor_date, Event.time == cursor_time,
                                 Event.id > cursor_id),
                        )
                    )
                else:
                    query = query.where(
                        or_(
                            Event.date > cursor_date,
                            and_(Event.date == cursor_date, Event.id > cursor_id),
                        )
                    )
            else:
                # Следующая страница: строки ДО курсора (раньше по времени)
                if cursor_time is not None:
                    query = query.where(
                        or_(
                            Event.date < cursor_date,
                            and_(Event.date == cursor_date, Event.time < cursor_time),
                            and_(Event.date == cursor_date, Event.time == cursor_time,
                                 Event.id < cursor_id),
                        )
                    )
                else:
                    query = query.where(
                        or_(
                            Event.date < cursor_date,
                            and_(Event.date == cursor_date, Event.id < cursor_id),
                        )
                    )

        if asc_mode:
            query = query.order_by(Event.date.asc(), Event.time.asc(), Event.id.asc())
        else:
            query = query.order_by(Event.date.desc(), Event.time.desc(), Event.id.desc())

        query = query.limit(limit + 1)
        rows = list(await session.scalars(query))
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        return rows, has_more


async def count_events(
    completed: bool = None,
    event_type: str = None,
    location_id: str = None,
    organizer_id: str = None,
    date_from: date = None,
    date_to: date = None,
    search: str = None,
) -> int:
    """Отдельный COUNT для статистики — без загрузки строк."""
    async with async_session() as session:
        query = select(func.count(Event.id))
        if completed is not None:
            query = query.where(Event.completed == completed)
        if event_type:
            query = query.where(Event.type == event_type)
        if location_id:
            query = query.where(Event.location_id == location_id)
        if organizer_id:
            query = query.where(Event.organizer_id == organizer_id)
        if date_from:
            query = query.where(Event.date >= date_from)
        if date_to:
            query = query.where(Event.date <= date_to)
        if search:
            query = query.where(
                or_(
                    Event.description.ilike(f'%{search}%'),
                    Event.url.ilike(f'%{search}%'),
                )
            )
        result = await session.execute(query)
        return result.scalar() or 0


async def get_event_counts_by_date(completed: bool = False) -> dict:
    """
    Возвращает агрегаты для dashboard/stats одним запросом:
    { total, today, soon, missed }
    """
    today = date.today()
    async with async_session() as session:
        # Один запрос с CASE WHEN вместо загрузки всех строк
        total_q = select(func.count(Event.id)).where(Event.completed == completed)
        today_q = select(func.count(Event.id)).where(
            Event.completed == completed, Event.date == today)
        soon_q = select(func.count(Event.id)).where(
            Event.completed == completed, Event.date > today)
        missed_q = select(func.count(Event.id)).where(
            Event.completed == completed,
            or_(Event.date < today, Event.date.is_(None))
        )
        total = (await session.execute(total_q)).scalar() or 0
        today_count = (await session.execute(today_q)).scalar() or 0
        soon = (await session.execute(soon_q)).scalar() or 0
        missed = (await session.execute(missed_q)).scalar() or 0
        return {'total': total, 'today': today_count, 'soon': soon, 'missed': missed}


async def get_events_by_date_range(start_date: date, end_date: date):
    async with async_session() as session:
        result = await session.scalars(
            select(Event)
            .where(and_(Event.date >= start_date, Event.date <= end_date))
            .order_by(Event.date, Event.time)
        )
        return list(result)


async def get_event_by_id(event_id: str):
    async with async_session() as session:
        return await session.scalar(select(Event).where(Event.id == event_id))


async def get_documents_by_event_id(event_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(Document.id, Document.name, Document.size).where(Document.event_id == event_id)
        )
        return [{'id': row[0], 'name': row[1], 'size': row[2]} for row in result]


async def get_documents_by_event_ids(event_ids: list):
    if not event_ids:
        return {}
    async with async_session() as session:
        result = await session.execute(
            select(Document.id, Document.name, Document.size, Document.event_id)
            .where(Document.event_id.in_(event_ids))
        )
        docs_map = {}
        for row in result:
            eid = row[3]
            if eid not in docs_map:
                docs_map[eid] = []
            docs_map[eid].append({'id': row[0], 'name': row[1], 'size': row[2]})
        return docs_map


async def get_document_by_id(doc_id: str):
    async with async_session() as session:
        result = await session.execute(
            select(Document.id, Document.name, Document.size, Document.file_path, Document.content)
            .where(Document.id == doc_id)
        )
        row = result.first()
        if row:
            return {'id': row[0], 'name': row[1], 'size': row[2], 'file_path': row[3], 'content': row[4]}
        return None


# ─── Event History ──────────────────────────────────────────────────

async def cleanup_stale_locks() -> int:
    try:
        from datetime import timedelta
        async with async_session() as session:
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            result = await session.execute(
                update(Event)
                .where(Event.locked_at < cutoff, Event.locked_at.isnot(None))
                .values(locked_by=None, locked_at=None)
            )
            await session.commit()
            count = result.rowcount
            if count:
                logger.info('Очищено {} просроченных lock\'ов', count)
            return count
    except Exception as e:
        logger.error('Ошибка cleanup_stale_locks: {}', repr(e))
        return 0


async def get_event_history_by_event_id(event_id: str) -> list[dict]:
    async with async_session() as session:
        result = await session.execute(
            select(
                EventHistory.id, EventHistory.timestamp, EventHistory.action, EventHistory.changes,
                User.last_name, User.first_name, User.patronymic, User.name, User.username,
            )
            .join(User, EventHistory.user_id == User.id, isouter=True)
            .where(EventHistory.event_id == event_id)
            .order_by(EventHistory.timestamp.desc())
        )
        rows = result.all()
        history = []
        for row in rows:
            user_parts = [row.last_name or '', row.first_name or '', row.patronymic or '']
            user_name = ' '.join(p for p in user_parts if p).strip() or row.name or row.username or 'Система'
            history.append({
                'id': row.id,
                'user_name': user_name,
                'timestamp': row.timestamp.isoformat() if row.timestamp else None,
                'action': row.action,
                'changes': row.changes,
            })
        return history


# ─── Event Participants ─────────────────────────────────────────────

async def get_event_participants(event_id: str) -> list[dict]:
    async with async_session() as session:
        result = await session.execute(
            select(
                EventParticipant.id, EventParticipant.user_id, EventParticipant.role,
                User.name, User.username, User.last_name, User.first_name, User.patronymic,
            )
            .join(User, EventParticipant.user_id == User.id, isouter=True)
            .where(EventParticipant.event_id == event_id)
        )
        rows = result.all()
        participants = []
        for row in rows:
            user_parts = [row.last_name or '', row.first_name or '', row.patronymic or '']
            user_name = ' '.join(p for p in user_parts if p).strip() or row.name or row.username or ''
            participants.append({'id': row.id, 'user_id': row.user_id, 'name': user_name, 'role': row.role})
        return participants


async def search_users_for_participants(query: str, limit: int = 10) -> list[dict]:
    async with async_session() as session:
        q = select(User.id, User.name, User.username, User.max_id)
        if query:
            q = q.where(
                User.name.ilike(f'%{query}%') |
                User.username.ilike(f'%{query}%') |
                User.last_name.ilike(f'%{query}%')
            )
        q = q.limit(limit)
        result = await session.execute(q)
        rows = result.all()
        return [{'id': row.id, 'name': row.name, 'username': row.username, 'max_id': row.max_id} for row in rows]


# ─── Event Series ────────────────────────────────────────────────────

async def get_event_series(series_id: str):
    async with async_session() as session:
        return await session.scalar(select(EventSeries).where(EventSeries.id == series_id))


async def get_series_exceptions(series_id: str) -> list:
    async with async_session() as session:
        result = await session.scalars(
            select(EventSeriesException).where(EventSeriesException.series_id == series_id)
        )
        return list(result)


async def get_exception_for_series_date(series_id: str, original_date: date):
    async with async_session() as session:
        return await session.scalar(
            select(EventSeriesException).where(
                EventSeriesException.series_id == series_id,
                EventSeriesException.original_date == original_date,
            )
        )
