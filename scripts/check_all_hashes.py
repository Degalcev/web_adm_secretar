import asyncio, sys
sys.path.insert(0, '/opt/web_test')
from database.models import async_session, User
from sqlalchemy import select
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

async def check():
    async with async_session() as session:
        result = await session.execute(select(User))
        users = list(result.scalars())
        for u in users:
            pwd = u.password
            if pwd:
                print(f'  max_id={u.max_id} name={u.name} hash_len={len(pwd)}')
                # Try common passwords
                for p in ['admin', '1234', 'password', 'ivc212', 'test', '123456', 'secret', 'qwerty']:
                    try:
                        ph.verify(pwd, p)
                        print(f'    MATCH: "{p}"')
                        break
                    except VerifyMismatchError:
                        pass
                    except Exception as e:
                        print(f'    ERROR: {e}')
                        break
                else:
                    print(f'    No common password match')
            else:
                print(f'  max_id={u.max_id} name={u.name} NO PASSWORD (default)')

asyncio.run(check())
