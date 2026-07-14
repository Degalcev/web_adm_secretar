import asyncio
import sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from sqlalchemy import select

async def check():
    async with async_session() as session:
        result = await session.execute(select(User))
        users = list(result.scalars())
        for u in users:
            pwd = (u.password or 'NULL')[:60]
            print(f'  max_id={u.max_id} name={u.name} username={u.username} pwd={pwd}')

asyncio.run(check())
