# Скилл: Безопасность и Авторизация

## Назначение
Руководство по реализации безопасной авторизации, хешированию паролей и защите от распространённых веб-уязвимостей.

## Когда использовать
- Реализация функциональности входа/выхода
- Хеширование и проверка паролей
- Защита маршрутов авторизацией
- Обработка CSRF защиты
- Валидация и очистка ввода

## Система авторизации проекта
- **Хеширование паролей**: argon2-cffi
- **Управление сессиями**: Словарь в памяти (cookies)
- **Пароль по умолчанию**: 'ivc212' (из config)

## Хеширование паролей с Argon2
```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

# Хеширование пароля
def hash_password(password: str) -> str:
    return ph.hash(password)

# Проверка пароля
def verify_password(stored_hash: str, password: str) -> bool:
    try:
        ph.verify(stored_hash, password)
        return True
    except VerifyMismatchError:
        return False
```

## Управление сессиями
```python
import secrets
from typing import Dict

# Хранилище сессий в памяти
_sessions: Dict[str, int] = {}

def create_session(user_id: int) -> str:
    token = secrets.token_hex(32)
    _sessions[token] = user_id
    return token

def get_session(token: str) -> int | None:
    return _sessions.get(token)

def delete_session(token: str):
    _sessions.pop(token, None)
```

## Cookie-based авторизация
```python
from aiohttp import web

async def login_handler(request: web.Request):
    data = await request.json()
    max_id = data.get('max_id')
    password = data.get('password')
    
    # Проверка пользователя...
    
    token = create_session(user_id)
    response = web.json_response({'ok': True})
    response.set_cookie(
        'admin_token', token,
        httponly=True,
        max_age=86400,  # 24 часа
        samesite='Lax'
    )
    return response

async def logout_handler(request: web.Request):
    token = request.cookies.get('admin_token')
    if token:
        delete_session(token)
    response = web.json_response({'ok': True})
    response.del_cookie('admin_token')
    return response
```

## Декоратор защиты маршрутов
```python
from functools import wraps

def admin_required(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        token = request.cookies.get('admin_token')
        if not token:
            return web.json_response({'error': 'Unauthorized'}, status=401)
        
        user_id = get_session(token)
        if not user_id:
            return web.json_response({'error': 'Invalid session'}, status=401)
        
        # Проверка что пользователь admin
        user = await get_user_by_id(user_id)
        if not user or user.status != 'admin':
            return web.json_response({'error': 'Forbidden'}, status=403)
        
        return await handler(request)
    return wrapper

# Использование
@admin_required
async def protected_handler(request: web.Request):
    return web.json_response({'message': 'Access granted'})
```

## Валидация ввода
```python
from typing import Optional
import re

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_max_id(max_id: str) -> Optional[int]:
    try:
        value = int(max_id)
        if value <= 0:
            return None
        return value
    except ValueError:
        return None

def sanitize_input(input_str: str) -> str:
    # Удаление потенциального XSS
    import html
    return html.escape(input_str.strip())
```

## CSRF защита
```python
import secrets
from aiohttp import web

# Генерация CSRF токена
def generate_csrf_token() -> str:
    return secrets.token_hex(32)

# Добавление в ответ
async def login_handler(request: web.Request):
    csrf_token = generate_csrf_token()
    response = web.json_response({'ok': True})
    response.set_cookie('csrf_token', csrf_token, httponly=False)
    return response

# Проверка на POST запросах
def require_csrf(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        if request.method == 'POST':
            token = request.cookies.get('csrf_token')
            form_token = (await request.json()).get('csrf_token')
            if not token or token != form_token:
                return web.json_response({'error': 'Invalid CSRF token'}, status=403)
        return await handler(request)
    return wrapper
```

## Предотвращение SQL инъекций
```python
# ВСЕГДА используйте параметризованные запросы
from sqlalchemy import select

# Безопасно
result = await session.execute(
    select(User).where(User.max_id == max_id)
)

# НИКОГДА не делайте так
# query = f"SELECT * FROM users WHERE max_id = {max_id}"
```

## Предотвращение XSS
```python
# Backend: Очистка вывода
import html

def sanitize_output(text: str) -> str:
    return html.escape(text)

# Frontend: Используйте textContent вместо innerHTML
# Безопасно
element.textContent = userInput;

# Опасно
element.innerHTML = userInput;  # Никогда не делайте это с вводом пользователя
```

## Переменные окружения для секретов
```python
# config.py
import os
from dotenv import load_dotenv

load_dotenv()

# Никогда не хардкодьте секреты
DB_PASSWORD = os.getenv('DB_PASSWORD')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')
SECRET_KEY = os.getenv('SECRET_KEY', secrets.token_hex(32))
```

## Security заголовки
```python
@web.middleware
async def security_headers(request, handler):
    response = await handler(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

app = web.Application(middlewares=[security_headers])
```

## Rate limiting
```python
from collections import defaultdict
import time

class RateLimiter:
    def __init__(self, max_requests: int = 100, window: int = 60):
        self.max_requests = max_requests
        self.window = window
        self.requests = defaultdict(list)
    
    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True

limiter = RateLimiter()

def rate_limit(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        client_ip = request.remote
        if not limiter.is_allowed(client_ip):
            return web.json_response({'error': 'Too many requests'}, status=429)
        return await handler(request)
    return wrapper
```

## Распространённые уязвимости для избежания
1. **Хардкод секретов**: Используйте переменные окружения
2. **SQL инъекции**: Используйте параметризованные запросы
3. **XSS**: Очищайте ввод и вывод пользователя
4. **CSRF**: Реализуйте CSRF токены
5. **Небезопасные cookies**: Используйте httponly, secure, samesite флаги
6. **Отсутствие rate limiting**: Защитите от brute force

## Специфичные для проекта заметки по безопасности
- CSRF защита реализована: `@require_csrf` декоратор + cookie `csrf_token` + header `X-CSRF-Token`
- Сессии хранятся в PostgreSQL (таблица sessions, TTL 24ч)
- Rate limiter: 5 запросов/минуту на `/admin/login`
- Пароль admin по умолчанию в конфиге (следует изменить)
- HTTPS обеспечивается nginx (Let's Encrypt)

## Ссылки
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- argon2-cffi: https://argon2-cffi.readthedocs.io/
- aiohttp безопасность: https://docs.aiohttp.org/en/stable/security.html
- Реализация авторизации: `app/auth.py`
