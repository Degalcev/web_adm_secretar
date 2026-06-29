import uuid

from loguru import logger
from sqlalchemy import update
from sqlalchemy import delete as sql_delete

from database.models import async_session, User


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
