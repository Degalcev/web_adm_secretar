import asyncio, sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from database.sending import update_user
from sqlalchemy import select
from argon2 import PasswordHasher

ph = PasswordHasher()

async def reset():
    # Найти пользователя
    async with async_session() as session:
        result = await session.execute(select(User).where(User.max_id == 120880697))
        user = result.scalar_one_or_none()
        if not user:
            print('User not found')
            return

        # Сбросить пароль на 'admin123'
        new_hash = ph.hash('admin123')
        await update_user(user_id=user.id, password=new_hash)
        print(f'Password reset for {user.name} (max_id={user.max_id})')
        print(f'New password: admin123')

        # Verify
        ph.verify(new_hash, 'admin123')
        print('Verify: OK')

asyncio.run(reset())
