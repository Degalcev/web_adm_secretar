# Анализ системы авторизации — 2026-07-03

## 1. Текущая реализация

### Архитектура (однострочник)

```
Браузер → nginx (80) → aiohttp (8082) → PostgreSQL (sessions)
```

### Бэкенд (`app/auth.py`)

| Компонент | Реализация |
|-----------|-----------|
| Хеширование паролей | argon2-cffi |
| Сессии | PostgreSQL, таблица `sessions` (token, user_id, expires_at, ip, ua) |
| Cookie | `admin_token` (httponly, 24ч), `csrf_token` (JS-readable, 24ч) |
| Rate Limiter | In-memory, 5 запросов/минуту на IP |
| CSRF | Сравнение cookie + JSON body / X-CSRF-Token header |
| Декораторы | `admin_required` (role=admin), `auth_required` (role=admin или user) |

### Фронтенд (`app/static/js/auth.js`)

```
login() → POST /admin/login → set isAuthenticated=true → showMain()
       → setTimeout 100ms → checkAuth(true) → GET /admin/api/auth/check
                                            → GET /admin/api/users/me
                                            → initPreloader()
```

### Инициализация (`app.js`)

```
initTheme() → initRouter() → checkAuth() → initUpdater() → initSSE()
```

### Маршруты с авторизацией

| Маршрут | Декоратор | Назначение |
|---------|-----------|-----------|
| `POST /admin/login` | Нет (публичный) | Вход |
| `POST /admin/logout` | Нет | Выход |
| `GET /admin/api/auth/check` | `auth_required` | Проверка сессии |
| `GET /admin/api/users/me` | `auth_required` | Данные текущего пользователя |
| `GET /admin/api/users` | `admin_required` | Список пользователей |
| `POST /admin/api/users` | `admin_required` + `csrf` | Создание пользователя |
| `PUT /admin/api/users/{id}` | `admin_required` + `csrf` | Обновление пользователя |
| `DELETE /admin/api/users/{id}` | `admin_required` + `csrf` | Удаление пользователя |
| `GET /admin/api/preload` | `auth_required` | Предзагрузка данных |
| VKS маршруты | `auth_required` или `admin_required` | CRUD событий |
| Document маршруты | `auth_required` | Документы |

---

## 2. Найденные проблемы

### Критические

#### 2.1 Гонка при входе (login race condition)

**Симптом:** После входа пользователь видит пустой экран или ошибки загрузки данных.

**Причина:** `login()` в `auth.js:24-30`:
```javascript
if (data.ok) {
    isAuthenticated = true;     // ← Флаг ставится СРАЗУ
    showMain();                 // ← Показываем main-screen
    window.history.replaceState(null, '', '/');
    await new Promise(r => setTimeout(r, 100));  // ← Ждём 100мс
    await checkAuth(true);      // ← Проверяем авторизацию
}
```

**Проблема:**
1. `isAuthenticated = true` ставится до проверки сессии на сервере
2. `showMain()` показывает интерфейс до загрузки данных
3. 100ms delay — хрупкая догадка о времени установки cookie
4. Если `checkAuth` вернёт 401 (cookie ещё не установлена, nginx кеширует), пользователь застревает на пустом main-screen

#### 2.2 `silent` режим не восстанавливает логин

**Симптом:** Если `checkAuth(true)` получает 401, `showLogin()` НЕ вызывается.

В `auth.js:104-106`:
```javascript
} else if (!silent) {     // ← Только если НЕ silent
    showLogin();
}
```

При `silent=true` (вызывается из `login()`), при ошибке — пользователь видит пустой интерфейс.

#### 2.3 Cookie без `domain` — межпортовые проблемы

**Симптом:** Cookie не отправляется между портами 80 и 8082.

В `auth.py:154-167`:
```python
response.set_cookie('admin_token', token, httponly=True, secure=False, max_age=86400, samesite='Lax')
```

Без явного `domain` cookie привязывается к порту. При обращении через nginx (порт 80) к aiohttp (порт 8082) cookie может не передаваться.

#### 2.4 Nginx кеширует статику без anti-cache

**Симптом:** После деплоя пользователи видят старый JS/CSS.

В `deploy/nginx/test.conf` нет заголовков:
```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

Только `index.html` имеет эти заголовки (через `server.py:93-96`). JS/CSS файлы раздаются через `add_static` без кастомных заголовков.

### Средние

#### 2.5 CSRF ломается для multipart запросов

В `auth.py:54-58`:
```python
try:
    data = await request.json()
    form_token = data.get('csrf_token')
except Exception:
    pass
```

Для multipart/form-data (события VKS с файлами) `request.json()` выбросит исключение → `form_token` останется `None` → CSRF проверка упадёт.

**На практике:** VKS маршруты используют `@require_csrf` и `multipart/form-data` → CSRF всегда падает для PUT/DELETE событий.

#### 2.6 Нет очистки истёкших сессий

`cleanup_expired_sessions()` в `sending.py:185-196` существует, но нигде не вызывается. Сессии копятся в БД бесконечно.

#### 2.7 `validate_session` делает 2 запроса к БД

```python
async def validate_session(token: str):
    session = await get_session_by_token(token)  # запрос 1
    user = await get_user_by_id(session.user_id)  # запрос 2
    return user
```

Можно заменить на JOIN: 1 запрос вместо 2.

#### 2.8 Утечка информации через `check_admin_status`

`GET /api/check-admin-status/{max_id}` — публичный эндпоинт, раскрывает является ли пользователь админом.

### Низкие

#### 2.9 Logout без CSRF

`admin_logout` — POST без `@require_csrf`. Возможен CSRF-атака на выход.

#### 2.10 Двойной вызов `checkAuth`

При входе: `login()` → `checkAuth(true)`. При обновлении страницы: `app.js` → `checkAuth()`. При навигации: `handlePopState()` → нет повторной проверки. Если сессия истекла во время работы — пользователь не будет разлогинен до следующего API-вызова.

#### 2.11 Rate Limiter in-memory

При перезапуске сервера rate limiting сбрасывается. Для single-server部署 это приемлемо, но не масштабируется.

---

## 3. Корневые причины

| # | Корневая причина | Следствие |
|---|-----------------|-----------|
| 1 | **Нет единой точки принятия решения о состоянии авторизации** | `isAuthenticated` на фронте, сессия на бэкенде — два источника правды |
| 2 | **Auth flow основ猜测ах, не на гарантиях** | 100ms delay, silent mode без fallback |
| 3 | **Cookie не考虑跨端口** | nginx → backend cookie не работает |
| 4 | **Статика не版本化на уровне HTTP** | Nginx кеширует JS/CSS, version query в URL помогает частично |
| 5 | **CSRF не兼容 multipart** | Файловые формы ломают CSRF |

---

## 4. Что я бы реализовал (с нуля)

### 4.1 Единый auth flow на фронте

```javascript
// auth.js — переработанная версия

async function checkAuth() {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
        if (resp.ok) {
            isAuthenticated = true;
            await loadCurrentUser();
            showMain();
            return true;
        }
    } catch (e) { /* ignore */ }
    
    isAuthenticated = false;
    showLogin();
    return false;
}

async function login() {
    const maxId = document.getElementById('login-max-id').value;
    const password = document.getElementById('login-password').value;
    
    // ... валидация ...
    
    const resp = await fetch(`${BASE_URL}/admin/login`, { ... });
    const data = await resp.json();
    
    if (data.ok) {
        // НЕ ставим isAuthenticated = true
        // НЕ показываем main-screen
        // Доверяем только checkAuth()
        await checkAuth();  // ← Если fail → showLogin()
    }
}
```

**Ключевое:** `login()` доверяет `checkAuth()`. Никаких `setTimeout`, никаких `silent` режимов.

### 4.2 Middleware для auth

```python
# auth.py — переработанная версия

@web.middleware
async def auth_middleware(request, handler):
    # Пропускаем публичные маршруты
    if request.path in ('/admin/login', '/admin/logout', '/version.json'):
        return await handler(request)
    
    # Пропускаем статику
    if request.path.startswith('/static/'):
        return await handler(request)
    
    token = request.cookies.get('admin_token')
    user = await validate_session(token)
    
    if not user:
        return web.json_response({'error': 'Не авторизован'}, status=401)
    
    request['user'] = user
    return await handler(request)
```

**Преимущество:** Одна проверка на каждый запрос. Декораторы не нужны.

### 4.3 CSRF через Double-Submit Cookie (совместимый с multipart)

```python
def generate_csrf_token() -> str:
    return secrets.token_hex(32)

# При логине:
response.set_cookie('csrf_token', csrf_token, httponly=False, max_age=86400)

# В require_csrf:
def require_csrf(handler):
    @wraps(handler)
    async def wrapper(request):
        if request.method in ('POST', 'PUT', 'DELETE'):
            cookie_token = request.cookies.get('csrf_token')
            
            # Сначала пробуем заголовок
            header_token = request.headers.get('X-CSRF-Token')
            
            # Если заголовка нет — пробуем form data
            if not header_token:
                try:
                    data = await request.json()
                    header_token = data.get('csrf_token')
                except Exception:
                    pass
            
            if not header_token:
                try:
                    post_data = await request.post()
                    header_token = post_data.get('csrf_token')
                except Exception:
                    pass
            
            if not cookie_token or cookie_token != header_token:
                return web.json_response({'error': 'CSRF'}, status=403)
        
        return await handler(request)
    return wrapper
```

### 4.4 Nginx anti-cache

```nginx
# Для статики — версионирование через version query
location /static/ {
    proxy_pass http://127.0.0.1:8082;
    proxy_cache_valid 200 1d;
    add_header Cache-Control "public, max-age=86400";
}

# Для API — никогда не кешировать
location /admin/api/ {
    proxy_pass http://127.0.0.1:8082;
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}
```

### 4.5 Session validation с JOIN

```python
async def validate_session(token: str):
    if not token:
        return None
    async with async_session() as session:
        result = await session.execute(
            select(User)
            .join(Session, Session.user_id == User.id)
            .where(
                Session.token == token,
                Session.expires_at > datetime.utcnow()
            )
        )
        return result.scalar_one_or_none()
```

### 4.6 Автоочистка сессий

```python
# В server.py при старте:
async def startup_cleanup(app):
    await cleanup_expired_sessions()
    # Периодическая очистка каждые 6 часов
    app['session_cleanup_task'] = asyncio.create_task(periodic_cleanup())

async def periodic_cleanup():
    while True:
        await asyncio.sleep(6 * 3600)
        await cleanup_expired_sessions()
```

### 4.7 Cookie с domain

```python
# Для test среды (порт 80):
response.set_cookie('admin_token', token,
    httponly=True,
    secure=False,
    max_age=86400,
    samesite='Lax',
    domain='45.90.217.225'  # ← Явный domain
)

# Для prod (HTTPS):
response.set_cookie('admin_token', token,
    httponly=True,
    secure=True,
    max_age=86400,
    samesite='Lax',
    domain='bot.dlab.run'
)
```

### 4.8 Публичные/защищённые маршруты — единая конфигурация

```python
PUBLIC_ROUTES = {
    '/admin/login',
    '/admin/logout',
    '/version.json',
    '/api/check-admin-status',
}

@web.middleware
async def auth_middleware(request, handler):
    if request.path in PUBLIC_ROUTES or request.path.startswith('/static/'):
        return await handler(request)
    
    token = request.cookies.get('admin_token')
    user = await validate_session(token)
    
    if not user:
        return web.json_response({'error': 'Не авторизован'}, status=401)
    
    request['user'] = user
    return await handler(request)
```

---

## 5. Сводка рекомендаций

| # | Приоритет | Изменение | Сложность |
|---|-----------|-----------|-----------|
| 1 | **Высокий** | Убрать гонку в `login()` — доверять `checkAuth()` | Низкая |
| 2 | **Высокий** | Добавить nginx anti-cache headers | Низкая |
| 3 | **Высокий** | Исправить cookie domain для кросс-портового доступа | Низкая |
| 4 | **Средний** | Auth middleware вместо декораторов | Средняя |
| 5 | **Средний** | CSRF совместимый с multipart | Средняя |
| 6 | **Средний** | Автоочистка сессий при старте | Низкая |
| 7 | **Средний** | JOIN в validate_session | Низкая |
| 8 | **Низкий** | Logout с CSRF | Низкая |
| 9 | **Низкий** | Скрыть check_admin_status | Низкая |
| 10 | **Низкий** | Периодическая очистка сессий | Низкая |

---

## 6. Итого

Текущая авторизация **функциональна для простых случаев** (вход/выход на desktop), но имеет несколько серьёзных проблем:

1. **Гонка при входе** — основная причина нестабильности
2. **Nginx кеш** — ломает деплой
3. **Cookie без domain** — проблемы при proxy

Исправление первых 3 пунктов (приоритет «Высокий») решит 90% текущих проблем. Остальное — улучшения для production-ready системы.
