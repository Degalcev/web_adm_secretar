from datetime import datetime
from loguru import logger
from sqlalchemy import select

from database.models import async_session, User, Organizer, Location, Session


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
