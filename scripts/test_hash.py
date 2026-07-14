import asyncio
import sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from sqlalchemy import select
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

async def test():
    async with async_session() as session:
        result = await session.execute(select(User).where(User.max_id == 120880697))
        user = result.scalar_one_or_none()
        if not user:
            print('User not found')
            return

        pwd = user.password
        print(f'Hash from DB: {pwd}')

        # Попробовать разные пароли
        test_passwords = ['admin', '1234', 'password', 'ivc212', 'test', '123456', 'secret']
        for p in test_passwords:
            try:
                ph.verify(pwd, p)
                print(f'  Match: "{p}"')
            except VerifyMismatchError:
                print(f'  No match: "{p}"')
            except Exception as e:
                print(f'  Error with "{p}": {e}')

        # Проверить можем ли мы создать хеш и верифицировать
        new_hash = ph.hash('mypassword')
        print(f'\nNew hash: {new_hash[:60]}')
        try:
            ph.verify(new_hash, 'mypassword')
            print('New hash verify: OK')
        except Exception as e:
            print(f'New hash verify: {e}')

asyncio.run(test())
