# Скилл: SQLAlchemy Async разработка

## Назначение
Руководство по работе с async SQLAlchemy, моделями баз данных и asyncpg операциями.

## Когда использовать
- Определение моделей базы данных
- Написание async запросов к БД
- Выполнение CRUD операций
- Миграции базы данных
- Отладка проблем с БД

## Базовая настройка
```python
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, mapped_column

# Настройка engine
engine = create_async_engine("postgresql+asyncpg://user:pass@host/db")
async_session = async_sessionmaker(engine)

# Базовая модель
class Base(AsyncAttrs, DeclarativeBase):
    pass
```

## Определение моделей
```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import mapped_column

class User(Base):
    __tablename__ = 'users'
    
    id = mapped_column(String(), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = mapped_column(String())
    created_at = mapped_column(DateTime, default=datetime.utcnow)
```

## Async CRUD операции
```python
from sqlalchemy import select

# Создание
async def create_user(name: str):
    async with async_session() as session:
        user = User(name=name)
        session.add(user)
        await session.commit()
        return user.id

# Чтение
async def get_user(user_id: str):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

# Обновление
async def update_user(user_id: str, name: str):
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user:
            user.name = name
            await session.commit()

# Удаление
async def delete_user(user_id: str):
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user:
            await session.delete(user)
            await session.commit()
```

## Bulk операции
```python
# Bulk вставка
async def create_many_users(users_data: list):
    async with async_session() as session:
        users = [User(**data) for data in users_data]
        session.add_all(users)
        await session.commit()

# Bulk обновление
async def update_many_users(updates: list):
    async with async_session() as session:
        for user_id, data in updates:
            user = await session.get(User, user_id)
            if user:
                for key, value in data.items():
                    setattr(user, key, value)
        await session.commit()
```

## Специфика проекта
```python
# database/models.py - Определения моделей
# database/requests.py - Операции чтения
# database/sending.py - Операции записи

# Пример из проекта:
async def get_user_by_max_id(max_id: int):
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.max_id == max_id)
        )
        return result.scalar_one_or_none()
```

## Управление подключениями
```python
# SSH Tunnel (специфика проекта)
from sshtunnel import SSHTunnelForwarder

if SSH_SERVER:
    server = SSHTunnelForwarder(
        (SSH_SERVER, 22),
        ssh_username=SSH_USER_NAME,
        ssh_password=SSH_USER_PASSWORD,
        remote_bind_address=('localhost', 5432)
    )
    server.start()
    local_port = str(server.local_bind_port)
```

## Обработка ошибок
```python
from sqlalchemy.exc import SQLAlchemyError

async def safe_operation():
    try:
        async with async_session() as session:
            # Ваша операция здесь
            await session.commit()
    except SQLAlchemyError as e:
        logger.error(f"Ошибка базы данных: {e}")
        raise
```

## Советы по производительности
1. **Используйте пул сессий**: `async_sessionmaker` управляет пулом соединений
2. **Избегайте N+1 запросов**: Используйте `selectinload()` или `joinedload()` для связей
3. **Пакетные операции**: Используйте `session.add_all()` для множественных вставок
4. **Лимиты соединений**: Настройте `pool_size` в `create_async_engine()`

## Распространённые ошибки
1. **Пропущенный commit**: Всегда вызывайте `await session.commit()` после изменений
2. **Область сессии**: Используйте `async with` для автоматического управления сессиями
3. **Изоляция транзакций**: Учитывайте уровень изоляции по умолчанию
4. **Утечки соединений**: Всегда закрывайте сессии правильно

## Отладка
```python
# Включение SQL логирования
engine = create_async_engine(
    "postgresql+asyncpg://...",
    echo=True  # Логирует весь SQL
)

# Инспекция запроса
from sqlalchemy import inspect
print(select(User).where(User.id == "123").compile())
```

## Ссылки
- SQLAlchemy Async: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- asyncpg: https://magicstack.github.io/asyncpg/
- Модели проекта: `database/models.py`
- Запросы проекта: `database/requests.py`, `database/sending.py`
