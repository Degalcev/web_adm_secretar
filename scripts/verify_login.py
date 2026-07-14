import asyncio, sys
sys.path.insert(0, '/opt/web_test')
from database.requests import get_user_by_login
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

async def verify():
    # Тест по MAX ID
    user = await get_user_by_login('120880697')
    if user:
        print(f'Found by max_id: {user.name}')
        try:
            ph.verify(user.password, 'admin123')
            print('  Verify admin123: OK')
        except VerifyMismatchError:
            print('  Verify admin123: FAIL')

    # Тест по username
    user2 = await get_user_by_login('v.degalcev')
    if user2:
        print(f'Found by username: {user2.name}')
        try:
            ph.verify(user2.password, 'admin123')
            print('  Verify admin123: OK')
        except VerifyMismatchError:
            print('  Verify admin123: FAIL')

asyncio.run(verify())
