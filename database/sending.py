import uuid

from loguru import logger
from sqlalchemy import update
from sqlalchemy import delete as sql_delete

from database.models import async_session, User, Organizer, Location


async def add_user(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    kwargs.setdefault('notification', False)
    kwargs.setdefault('bot_listen', False)

    new_user = User(id=new_id, **kwargs)
    async with async_session() as session:
        try:
            session.add(new_user)
            await session.commit()
            logger.info('Пользователь {} добавлен', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления пользователя: {}', repr(e))
            raise


async def update_user(user_id: str, **kwargs):
    async with async_session() as session:
        try:
            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(**kwargs)
            )
            await session.commit()
            logger.info('Пользователь {} обновлён: {}', user_id, kwargs)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка обновления пользователя: {}', repr(e))
            raise


async def delete_user(user_id: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(User).where(User.id == user_id)
            )
            await session.commit()
            logger.info('Пользователь {} удалён', user_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления пользователя: {}', repr(e))
            raise


async def add_organizer(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    new_obj = Organizer(id=new_id, **kwargs)
    async with async_session() as session:
        try:
            session.add(new_obj)
            await session.commit()
            logger.info('Организатор {} добавлен', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления организатора: {}', repr(e))
            raise


async def update_organizer(organizer_id: str, **kwargs):
    async with async_session() as session:
        try:
            await session.execute(
                update(Organizer).where(Organizer.id == organizer_id).values(**kwargs)
            )
            await session.commit()
            logger.info('Организатор {} обновлён', organizer_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка обновления организатора: {}', repr(e))
            raise


async def delete_organizer(organizer_id: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(Organizer).where(Organizer.id == organizer_id)
            )
            await session.commit()
            logger.info('Организатор {} удалён', organizer_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления организатора: {}', repr(e))
            raise


async def add_location(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    new_obj = Location(id=new_id, **kwargs)
    async with async_session() as session:
        try:
            session.add(new_obj)
            await session.commit()
            logger.info('Локация {} добавлена', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления локации: {}', repr(e))
            raise


async def update_location(location_id: str, **kwargs):
    async with async_session() as session:
        try:
            await session.execute(
                update(Location).where(Location.id == location_id).values(**kwargs)
            )
            await session.commit()
            logger.info('Локация {} обновлена', location_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка обновления локации: {}', repr(e))
            raise


async def delete_location(location_id: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(Location).where(Location.id == location_id)
            )
            await session.commit()
            logger.info('Локация {} удалена', location_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления локации: {}', repr(e))
            raise
