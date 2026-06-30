import uuid
from datetime import datetime, timedelta

from loguru import logger
from sqlalchemy import update
from sqlalchemy import delete as sql_delete

from database.models import async_session, User, Organizer, Location, Session, Event


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


# ─── Сессии ─────────────────────────────────────────────────────────────

async def create_session(token: str, user_id: str, ip_address: str = None, user_agent: str = None, expires_hours: int = 24) -> str:
    new_id = str(uuid.uuid4())
    new_session = Session(
        id=new_id,
        token=token,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=datetime.utcnow() + timedelta(hours=expires_hours)
    )
    async with async_session() as session:
        try:
            session.add(new_session)
            await session.commit()
            logger.info('Сессия создана для пользователя {}', user_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка создания сессии: {}', repr(e))
            raise


async def delete_session(token: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(Session).where(Session.token == token)
            )
            await session.commit()
            logger.info('Сессия удалена')
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления сессии: {}', repr(e))
            raise


async def cleanup_expired_sessions():
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(Session).where(Session.expires_at < datetime.utcnow())
            )
            await session.commit()
            logger.info('Просроченные сессии удалены')
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка очистки сессий: {}', repr(e))
            raise


# ─── Events (ВКС) ─────────────────────────────────────────────────────

async def add_event(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    kwargs.setdefault('type', 'ВКС')
    kwargs.setdefault('completed', False)
    kwargs.setdefault('notification', True)
    new_event = Event(id=new_id, **kwargs)
    async with async_session() as session:
        try:
            session.add(new_event)
            await session.commit()
            logger.info('Событие {} добавлено', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления события: {}', repr(e))
            raise


async def update_event(event_id: str, **kwargs):
    async with async_session() as session:
        try:
            await session.execute(
                update(Event).where(Event.id == event_id).values(**kwargs)
            )
            await session.commit()
            logger.info('Событие {} обновлено', event_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка обновления события: {}', repr(e))
            raise


async def delete_event(event_id: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(Event).where(Event.id == event_id)
            )
            await session.commit()
            logger.info('Событие {} удалено', event_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления события: {}', repr(e))
            raise


# ─── Documents ────────────────────────────────────────────────────────

async def add_document(event_id: str, name: str, size: int, content: bytes) -> str:
    new_id = str(uuid.uuid4())
    from sqlalchemy import text
    async with async_session() as session:
        try:
            await session.execute(
                text("INSERT INTO documents (id, event_id, name, size, content) VALUES (:id, :eid, :name, :size, :content)"),
                {'id': new_id, 'eid': event_id, 'name': name, 'size': size, 'content': content}
            )
            await session.commit()
            logger.info('Документ {} добавлен', name)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления документа: {}', repr(e))
            raise


async def delete_document(doc_id: str):
    from sqlalchemy import text
    async with async_session() as session:
        try:
            await session.execute(
                text("DELETE FROM documents WHERE id = :did"),
                {'did': doc_id}
            )
            await session.commit()
            logger.info('Документ {} удалён', doc_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления документа: {}', repr(e))
            raise
