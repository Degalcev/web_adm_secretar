import asyncio
import sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from database.requests import get_user_by_login
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

async def test():
    # Найти пользователя
    user = await get_user_by_login('120880697')
    if not user:
        print('User not found by max_id')
        return
    print(f'Found: {user.name} (max_id={user.max_id})')
    print(f'Password hash: {(user.password or "NULL")[:80]}')

    if user.password:
        # Проверить хеш
        try:
            ph.verify(user.password, 'test1234')
            print('Verify "test1234": OK')
        except VerifyMismatchError:
            print('Verify "test1234": MISMATCH')
        except Exception as e:
            print(f'Verify "test1234": ERROR - {e}')
    else:
        print('Password is NULL (default password)')

    # Попробовать создать новый хеш и проверить
    new_hash = ph.hash('test1234')
    print(f'New hash: {new_hash[:80]}')
    try:
        ph.verify(new_hash, 'test1234')
        print('Verify new hash: OK')
    except Exception as e:
        print(f'Verify new hash: ERROR - {e}')

asyncio.run(test())
