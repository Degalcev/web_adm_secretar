import asyncio, sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from sqlalchemy import select

async def check():
    async with async_session() as session:
        result = await session.execute(select(User).where(User.max_id == 120880697))
        user = result.scalar_one_or_none()
        if user:
            print(f'Full hash: {user.password}')
            print(f'Hash length: {len(user.password)}')

asyncio.run(check())
