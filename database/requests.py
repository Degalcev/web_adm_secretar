from datetime import datetime, date
from loguru import logger
from sqlalchemy import select, and_

from database.models import async_session, User, Organizer, Location, Session, Event


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
        from sqlalchemy import text
        result = await session.execute(
            text("SELECT id, name, size FROM documents WHERE event_id = :eid"),
            {'eid': event_id}
        )
        return [dict(row) for row in result]
