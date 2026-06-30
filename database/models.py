import uuid
from datetime import datetime
import logging

from loguru import logger
from sqlalchemy import (BigInteger, String, Integer, ForeignKey, Time, Date,
                        Boolean, LargeBinary, DateTime, Index)
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import relationship, mapped_column, DeclarativeBase

from config import (SSH_SERVER, SSH_USER_NAME, SSH_USER_PASSWORD,
                    DB_USER, DB_USER_PASSWORD, DB_NAME, DB_HOST, DB_PORT)


class InterceptHandler(logging.Handler):
    def emit(self, record):
        level = logger.level(record.levelname).name
        logger.log(level, record.getMessage())


# ─── Подключение к БД ─────────────────────────────────────────────────────

if SSH_SERVER:
    from sshtunnel import SSHTunnelForwarder
    server = SSHTunnelForwarder(
        (SSH_SERVER, 22),
        ssh_username=SSH_USER_NAME,
        ssh_password=SSH_USER_PASSWORD,
        remote_bind_address=('localhost', 5432)
    )
    server.start()
    logger.info('SSH tunnel started: {}', server.tunnel_is_up)
    local_port = str(server.local_bind_port)
    local_host = 'localhost'
else:
    server     = None
    local_port = DB_PORT
    local_host = DB_HOST
    logger.info('Прямое подключение к БД: {}:{}', local_host, local_port)

connection_data = (
    'postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}'
    .format(user=DB_USER, password=DB_USER_PASSWORD,
            host=local_host, port=local_port, db=DB_NAME)
)

engine = create_async_engine(connection_data, echo=False)
async_session = async_sessionmaker(engine)

logging.getLogger('sqlalchemy').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy').addHandler(InterceptHandler())


# ─── Модели ───────────────────────────────────────────────────────────────

class Base(AsyncAttrs, DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'

    id                      = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    tg_id                   = mapped_column(Integer(), unique=True, nullable=True)
    max_id                  = mapped_column(Integer(), unique=True, nullable=True)
    name                    = mapped_column(String())
    password                = mapped_column(String(), nullable=True)
    status                  = mapped_column(String())
    fsm_id                  = mapped_column(Integer())
    fsm_user_message_id     = mapped_column(Integer())
    all_event_message_id    = mapped_column(BigInteger())
    chat_id                 = mapped_column(BigInteger())
    notification            = mapped_column(Boolean())
    bot_listen              = mapped_column(Boolean())
    updated_at              = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    max_all_event_message_id = mapped_column(String())
    max_fsm_id              = mapped_column(String())
    max_fsm_user_message_id = mapped_column(String())


class Organizer(Base):
    __tablename__ = 'organizers'

    id         = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = mapped_column(String(40))
    short_name = mapped_column(String(20), nullable=True)
    base_url   = mapped_column(String())
    updated_at = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_organizer_name', 'name'),
    )


class Location(Base):
    __tablename__ = 'locations'

    id         = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = mapped_column(String(20))
    updated_at = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_location_name', 'name'),
    )


class Session(Base):
    __tablename__ = 'sessions'

    id         = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    token      = mapped_column(String(64), unique=True, nullable=False)
    user_id    = mapped_column(String(), ForeignKey('users.id'), nullable=False)
    ip_address = mapped_column(String(45), nullable=True)
    user_agent = mapped_column(String(500), nullable=True)
    created_at = mapped_column(DateTime, default=datetime.utcnow)
    expires_at = mapped_column(DateTime, nullable=False)

    __table_args__ = (
        Index('idx_session_token', 'token'),
        Index('idx_session_expires', 'expires_at'),
    )


class Event(Base):
    __tablename__ = 'events'

    id             = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    type           = mapped_column(String(20), default='ВКС')
    date           = mapped_column(Date(), nullable=False)
    time           = mapped_column(Time(), nullable=True)
    organizer_id   = mapped_column(String(), ForeignKey('organizers.id'), nullable=True)
    location_id    = mapped_column(String(), ForeignKey('locations.id'), nullable=True)
    url            = mapped_column(String(), nullable=True)
    description    = mapped_column(String(), nullable=True)
    completed      = mapped_column(Boolean(), default=False)
    doc_id         = mapped_column(String(), nullable=True)
    notification   = mapped_column(Boolean(), default=True)
    updated_at     = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    locked_by      = mapped_column(Integer(), nullable=True)
    locked_at      = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index('idx_event_date', 'date'),
        Index('idx_event_date_time', 'date', 'time'),
        Index('idx_event_organizer_id', 'organizer_id'),
        Index('idx_event_location_id', 'location_id'),
    )


async def   async_main():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        logger.info('Соединение с базой данных выполнено')
    except Exception as e:
        logger.error('Ошибка создания базы данных: {}', repr(e))
