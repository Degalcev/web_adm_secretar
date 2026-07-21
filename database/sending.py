import uuid
import os
from datetime import datetime, timedelta

from loguru import logger
from sqlalchemy import select, update
from sqlalchemy import delete as sql_delete

from database.models import async_session, User, Organizer, Location, Session, Event, Document, EventHistory, EventParticipant, EventSeries, EventSeriesException
from config import DOCUMENTS_DIR


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
            safe_keys = [k for k in kwargs if k != 'password']
            logger.info('Пользователь {} обновлён: fields={}', user_id, safe_keys)
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


async def update_session_expiry(token: str, hours: int = 24):
    """Обновить TTL сессии (rolling session)."""
    try:
        async with async_session() as session:
            await session.execute(
                update(Session)
                .where(Session.token == token)
                .values(expires_at=datetime.utcnow() + timedelta(hours=hours))
            )
            await session.commit()
    except Exception as e:
        logger.error('Ошибка update_session_expiry: {}', repr(e))


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


async def lock_event(event_id: str, user_id: str) -> dict:
    try:
        async with async_session() as session:
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            result = await session.execute(
                update(Event).where(
                    Event.id == event_id,
                    (Event.locked_by.is_(None)) | (Event.locked_at < cutoff)
                ).values(locked_by=user_id, locked_at=datetime.utcnow())
            )
            await session.commit()
            if result.rowcount == 0:
                event = await session.scalar(select(Event).where(Event.id == event_id))
                if event and event.locked_by and event.locked_by != user_id:
                    lu = await session.scalar(select(User).where(User.id == event.locked_by))
                    name = ''
                    if lu:
                        parts = [lu.last_name or '', lu.first_name or '', lu.patronymic or '']
                        name = ' '.join(p for p in parts if p).strip() or lu.name or str(lu.max_id)
                    return {'ok': False, 'locked_by': name or str(event.locked_by), 'locked_at': event.locked_at.isoformat() if event.locked_at else None}
                return {'ok': False, 'error': 'Не удалось заблокировать'}
            logger.debug('Lock event {} by user {}', event_id, user_id)
            return {'ok': True}
    except Exception as e:
        logger.error('Ошибка lock_event: {}', repr(e))
        return {'ok': False, 'error': str(e)}


async def unlock_event(event_id: str) -> None:
    try:
        async with async_session() as session:
            event = await session.scalar(select(Event).where(Event.id == event_id))
            if event:
                event.locked_by = None
                event.locked_at = None
                await session.commit()
                logger.debug('Unlock event {}', event_id)
    except Exception as e:
        logger.error('Ошибка unlock_event: {}', repr(e))


# ─── Documents ────────────────────────────────────────────────────────

async def add_document(event_id: str, name: str, size: int, content: bytes) -> str:
    new_id = str(uuid.uuid4())
    safe_name = f'{new_id}_{name}'
    doc_dir = os.path.join(DOCUMENTS_DIR, event_id)
    os.makedirs(doc_dir, exist_ok=True)
    file_path = os.path.join(doc_dir, safe_name)

    with open(file_path, 'wb') as f:
        f.write(content)

    new_doc = Document(id=new_id, event_id=event_id, name=name, size=size, file_path=file_path)
    async with async_session() as session:
        try:
            session.add(new_doc)
            await session.commit()
            logger.info('Документ {} сохранён на диск: {}', name, file_path)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления документа: {}', repr(e))
            if os.path.exists(file_path):
                os.remove(file_path)
            raise


async def delete_document(doc_id: str):
    async with async_session() as session:
        try:
            result = await session.execute(
                select(Document).where(Document.id == doc_id)
            )
            doc = result.scalar_one_or_none()
            if doc and doc.file_path and os.path.exists(doc.file_path):
                os.remove(doc.file_path)
                logger.info('Файл удалён с диска: {}', doc.file_path)
            await session.execute(
                sql_delete(Document).where(Document.id == doc_id)
            )
            await session.commit()
            logger.info('Документ {} удалён', doc_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления документа {}: {}', doc_id, repr(e))
            raise


# ─── Event History ──────────────────────────────────────────────────

async def add_event_history(
    event_id: str,
    user_id: str | None,
    action: str,
    changes: dict | None = None
) -> None:
    try:
        new_entry = EventHistory(
            event_id=event_id,
            user_id=user_id,
            action=action,
            changes=changes,
        )
        async with async_session() as session:
            session.add(new_entry)
            await session.commit()
        logger.debug('event_history: event={} action={}', event_id, action)
    except Exception as e:
        logger.error('Ошибка записи event_history: {}', repr(e))


# ─── Event Participants ─────────────────────────────────────────────

async def add_event_participants(event_id: str, participants: list[dict]) -> list[str]:
    """Batch insert участников. participants = [{user_id, role}]"""
    ids = []
    async with async_session() as session:
        try:
            for p in participants:
                new_id = str(uuid.uuid4())
                ep = EventParticipant(
                    id=new_id,
                    event_id=event_id,
                    user_id=p['user_id'],
                    role=p.get('role', 'участник'),
                )
                session.add(ep)
                ids.append(new_id)
            await session.commit()
            logger.info('Добавлено {} участников для event {}', len(ids), event_id)
            return ids
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления участников: {}', repr(e))
            raise


async def remove_event_participant(participant_id: str):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(EventParticipant).where(EventParticipant.id == participant_id)
            )
            await session.commit()
            logger.info('Участник {} удалён', participant_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления участника {}: {}', participant_id, repr(e))
            raise


async def replace_event_participants(event_id: str, participants: list[dict]) -> list[str]:
    """Полная замена участников мероприятия."""
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(EventParticipant).where(EventParticipant.event_id == event_id)
            )
            ids = []
            for p in participants:
                new_id = str(uuid.uuid4())
                ep = EventParticipant(
                    id=new_id,
                    event_id=event_id,
                    user_id=p['user_id'],
                    role=p.get('role', 'участник'),
                )
                session.add(ep)
                ids.append(new_id)
            await session.commit()
            logger.info('Заменено {} участников для event {}', len(ids), event_id)
            return ids
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка замены участников: {}', repr(e))
            raise


# ─── Event Series ────────────────────────────────────────────────────

async def create_event_series(freq: str, interval_val: int, by_day: list, until=None) -> str:
    new_id = str(uuid.uuid4())
    series = EventSeries(
        id=new_id,
        freq=freq,
        interval_val=interval_val,
        by_day=by_day,
        until=until,
    )
    async with async_session() as session:
        try:
            session.add(series)
            await session.commit()
            logger.info('Серия создана: {}', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка создания серии: {}', repr(e))
            raise


async def delete_event_series(series_id: str):
    async with async_session() as session:
        try:
            await session.execute(sql_delete(EventSeriesException).where(EventSeriesException.series_id == series_id))
            await session.execute(sql_delete(EventSeries).where(EventSeries.id == series_id))
            await session.commit()
            logger.info('Серия {} удалена', series_id)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления серии {}: {}', series_id, repr(e))
            raise


async def delete_series_exception(series_id: str, original_date):
    async with async_session() as session:
        try:
            await session.execute(
                sql_delete(EventSeriesException).where(
                    EventSeriesException.series_id == series_id,
                    EventSeriesException.original_date == original_date
                )
            )
            await session.commit()
            logger.info('Исключение серии удалено: series={} date={}', series_id, original_date)
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка удаления исключения серии: {}', repr(e))
            raise


async def add_series_exception(series_id: str, original_date, event_id: str = None, action: str = 'skip', new_date=None) -> str:
    new_id = str(uuid.uuid4())
    exc = EventSeriesException(
        id=new_id,
        series_id=series_id,
        original_date=original_date,
        event_id=event_id,
        action=action,
        new_date=new_date,
    )
    async with async_session() as session:
        try:
            session.add(exc)
            await session.commit()
            logger.info('Исключение серии добавлено: {}', new_id)
            return new_id
        except Exception as e:
            await session.rollback()
            logger.error('Ошибка добавления исключения: {}', repr(e))
            raise
