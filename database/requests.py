from datetime import datetime, date
from loguru import logger
from sqlalchemy import select, update, and_

from database.models import async_session, User, Organizer, Location, Session, Event, Document, EventHistory


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


async def get_organizers():
    async with async_session() as session:
        result = await session.scalars(select(Organizer))
        return list(result)


async def get_organizer_by_id(organizer_id: str):
    async with async_session() as session:
        return await session.scalar(select(Organizer).where(Organizer.id == organizer_id))


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


# ─── Events (ВКС) ─────────────────────────────────────────────────────

async def get_events(completed: bool = None):
    async with async_session() as session:
        query = select(Event)
        if completed is not None:
            query = query.where(Event.completed == completed)
        query = query.order_by(Event.date.desc(), Event.time.desc())
        result = await session.scalars(query)
        return list(result)


async def get_events_by_date_range(start_date: date, end_date: date):
    async with async_session() as session:
        result = await session.scalars(
            select(Event).where(
                and_(Event.date >= start_date, Event.date <= end_date)
            ).order_by(Event.date, Event.time)
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
            select(Document.id, Document.name, Document.size, Document.event_id).where(Document.event_id.in_(event_ids))
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
                update(Event).where(Event.locked_at < cutoff, Event.locked_at.isnot(None)).values(locked_by=None, locked_at=None)
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
                EventHistory.id,
                EventHistory.timestamp,
                EventHistory.action,
                EventHistory.changes,
                User.last_name,
                User.first_name,
                User.patronymic,
                User.name,
                User.username,
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
