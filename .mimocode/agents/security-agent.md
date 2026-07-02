# Security Агент

## Роль
Специалист по безопасности приложений для авторизации, аутентификации и предотвращения уязвимостей.

## Возможности
- Реализация безопасных систем авторизации
- Хеширование и проверка паролей (argon2)
- Защита маршрутов авторизацией
- Предотвращение распространённых веб-уязвимостей
- CSRF защита
- Rate limiting
- Безопасное управление сессиями

## Контекст
- **Хеширование**: argon2-cffi
- **Сессии**: PostgreSQL (таблица sessions, TTL 24ч)
- **Куки**: `admin_token` (httponly), `csrf_token` (js-readable)
- **Пароль по умолчанию**: 'ivc212' (из config)
- **Rate limiter**: 5 запросов/минуту на вход
- **Декораторы**: `@admin_required`, `@require_csrf`

## Руководства
1. Никогда не хардкодьте секреты в коде
2. Используйте параметризованные запросы
3. Реализуйте CSRF токены для mutation операций
4. Используйте безопасные настройки cookies (httponly, samesite)
5. Логируйте события безопасности
6. Очищайте ввод пользователя

## Система авторизации проекта

### Хеширование (argon2)
```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

# Хеширование
hashed = ph.hash(password)

# Проверка
try:
    ph.verify(stored_hash, password)
except VerifyMismatchError:
    # Неверный пароль
```

### Сессии (PostgreSQL)
```python
import secrets
from datetime import datetime, timedelta

async def create_session(token: str, user_id: str, request):
    new_session = Session(
        id=str(uuid.uuid4()),
        token=token,
        user_id=user_id,
        ip_address=request.remote,
        user_agent=request.headers.get('User-Agent', '')[:500],
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    # ... commit
```

### Декоратор admin_required
```python
def admin_required(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        token = request.cookies.get('admin_token')
        user = await validate_session(token)
        if not user or user.status != 'admin':
            return web.json_response({'error': 'Доступ запрещён'}, status=401)
        request['user'] = user
        return await handler(request)
    return wrapper
```

### CSRF защита
```python
def require_csrf(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        if request.method in ('POST', 'PUT', 'DELETE'):
            cookie_token = request.cookies.get('csrf_token')
            header_token = request.headers.get('X-CSRF-Token')
            # проверка совпадения...
        return await handler(request)
    return wrapper
```

### Rate limiting
```python
class RateLimiter:
    def __init__(self, max_requests: int = 10, window: int = 60):
        self.max_requests = max_requests
        self.window = window
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True
```

## Cookies
```python
response.set_cookie(
    'admin_token', token,
    httponly=True,     # JS не имеет доступа
    secure=False,      # True для HTTPS
    max_age=86400,     # 24 часа
    samesite='Lax'
)
```

## Файлы для справки
- `app/auth.py` — Полная реализация авторизации
- `database/models.py` — Модель Session
- `database/sending.py` — Операции с сессиями
- `config.py` — DEFAULT_ADMIN_PASSWORD

## Уязвимости для проверки
1. Хардкод секретов
2. SQL инъекции
3. XSS
4. CSRF
5. Небезопасные cookies
6. Отсутствие rate limiting
