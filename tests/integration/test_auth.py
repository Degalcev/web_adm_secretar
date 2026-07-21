"""Интеграционные тесты авторизации — login, middleware, logout."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, TestServer, TestClient

from app.auth import (
    auth_middleware,
    admin_login,
    admin_logout,
    require_role,
    require_csrf,
    _set_cookie,
    login_limiter,
)
from tests.conftest import MockUser


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Сбрасывает rate limiter перед каждым тестом."""
    login_limiter.requests.clear()
    yield
    login_limiter.requests.clear()


async def create_test_app(handler, extra_routes=None):
    """Создаёт минимальное aiohttp приложение для тестов."""
    app = web.Application(middlewares=[auth_middleware])
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)
    app.router.add_get('/admin/api/test', handler)
    app.router.add_post('/admin/api/test', require_csrf(handler))
    app.router.add_delete('/admin/api/events/123/series/exception', require_csrf(handler))
    if extra_routes:
        for path, h in extra_routes:
            app.router.add_post(path, h)
    return app


# --- Login tests ---

@pytest.mark.asyncio
async def test_login_returns_cookies(aiohttp_client):
    """Login устанавливает admin_token и csrf_token cookies."""
    mock_user = MockUser(status='admin')

    async def fake_get_user_by_login(login):
        return mock_user

    async def fake_create_session(*args, **kwargs):
        return 'session-token'

    with patch('app.auth.get_user_by_login', fake_get_user_by_login), \
         patch('app.auth.create_session', fake_create_session), \
         patch('app.auth.DEFAULT_ADMIN_PASSWORD', 'testpass'):

        app = web.Application()
        app.router.add_post('/admin/login', admin_login)
        client = await aiohttp_client(app)

        resp = await client.post('/admin/login', json={
            'login': 'testuser',
            'password': 'testpass',
        })
        assert resp.status == 200
        body = await resp.json()
        assert body['ok'] is True

        # Проверяем cookies
        cookies = {c.key: c for c in client.session.cookie_jar}
        assert 'admin_token' in cookies
        assert 'csrf_token' in cookies
        assert cookies['admin_token'].get('httponly') is True


@pytest.mark.asyncio
async def test_login_rejects_wrong_password(aiohttp_client):
    """Login отклоняет неверный пароль."""
    mock_user = MockUser(status='admin')
    from argon2 import PasswordHasher
    ph = PasswordHasher()
    mock_user.password = ph.hash('correct_password')

    async def fake_get_user_by_login(login):
        return mock_user

    with patch('app.auth.get_user_by_login', fake_get_user_by_login):
        app = web.Application()
        app.router.add_post('/admin/login', admin_login)
        client = await aiohttp_client(app)

        resp = await client.post('/admin/login', json={
            'login': 'testuser',
            'password': 'wrong_password',
        })
        assert resp.status == 401
        body = await resp.json()
        assert body['ok'] is False
        assert body['code'] == 'AUTH_FAILED'
        # Не раскрываем, существует ли пользователь
        assert 'Неверный логин или пароль' in body['message']


@pytest.mark.asyncio
async def test_login_rejects_unknown_user(aiohttp_client):
    """Login отклоняет неизвестного пользователя с тем же сообщением."""
    async def fake_get_user_by_login(login):
        return None

    with patch('app.auth.get_user_by_login', fake_get_user_by_login):
        app = web.Application()
        app.router.add_post('/admin/login', admin_login)
        client = await aiohttp_client(app)

        resp = await client.post('/admin/login', json={
            'login': 'unknown_user',
            'password': 'any_password',
        })
        assert resp.status == 401
        body = await resp.json()
        assert body['code'] == 'AUTH_FAILED'


@pytest.mark.asyncio
async def test_login_validates_required_fields(aiohttp_client):
    """Login требует логин и пароль."""
    app = web.Application()
    app.router.add_post('/admin/login', admin_login)
    client = await aiohttp_client(app)

    resp = await client.post('/admin/login', json={'login': 'user'})
    assert resp.status == 400
    body = await resp.json()
    assert body['code'] == 'VALIDATION_ERROR'


@pytest.mark.asyncio
async def test_login_rate_limit(aiohttp_client):
    """Login блокирует после 5 неудачных попыток."""
    async def fake_get_user_by_login(login):
        return None

    with patch('app.auth.get_user_by_login', fake_get_user_by_login):
        app = web.Application()
        app.router.add_post('/admin/login', admin_login)
        client = await aiohttp_client(app)

        # 5 попыток — все отклоняются
        for i in range(5):
            resp = await client.post('/admin/login', json={
                'login': 'user', 'password': 'pass',
            })
            assert resp.status == 401

        # 6-я попыка — rate limit
        resp = await client.post('/admin/login', json={
            'login': 'user', 'password': 'pass',
        })
        assert resp.status == 429
        body = await resp.json()
        assert body['code'] == 'RATE_LIMITED'


@pytest.mark.asyncio
async def test_middleware_blocks_unauthenticated_api(aiohttp_client):
    """Middleware блокирует /admin/api/ без сессии."""
    async def handler(request):
        return web.json_response({'ok': True})

    app = await create_test_app(handler)
    client = await aiohttp_client(app)

    resp = await client.get('/admin/api/test')
    assert resp.status == 401
    body = await resp.json()
    assert body['code'] == 'UNAUTHORIZED'


@pytest.mark.asyncio
async def test_middleware_allows_spa_routes(aiohttp_client):
    """Middleware пропускает SPA-роуты без авторизации."""
    async def handler(request):
        return web.Response(text='index.html')

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_get('/', handler)
    app.router.add_get('/admin', handler)
    app.router.add_get('/calendar/', handler)
    client = await aiohttp_client(app)

    for path in ('/', '/admin', '/calendar/'):
        resp = await client.get(path)
        assert resp.status == 200, f"SPA route {path} should be accessible"


@pytest.mark.asyncio
async def test_middleware_allows_public_routes(aiohttp_client):
    """Middleware пропускает публичные роуты."""
    async def handler(request):
        return web.json_response({'ok': True})

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_post('/admin/login', handler)
    app.router.add_post('/admin/logout', handler)
    app.router.add_get('/version.json', handler)
    client = await aiohttp_client(app)

    for path in ('/admin/login', '/admin/logout', '/version.json'):
        resp = await client.get(path) if path == '/version.json' else await client.post(path)
        assert resp.status == 200, f"Public route {path} should be accessible"


@pytest.mark.asyncio
async def test_require_role_enforced_on_endpoint(aiohttp_client):
    """require_role работает через middleware + decorator на endpoint."""
    @require_role('admin')
    async def admin_handler(request):
        return web.json_response({'ok': True})

    mock_user = MockUser(status='editor')

    async def fake_validate_session(token):
        return mock_user

    async def fake_update_session_expiry(token):
        pass

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_get('/admin/api/users', admin_handler)

    with patch('app.auth.validate_session', fake_validate_session), \
         patch('app.auth.update_session_expiry', fake_update_session_expiry):
        client = await aiohttp_client(app)

        # С валидной сессией editor — 403
        resp = await client.get('/admin/api/users', cookies={'admin_token': 'valid_token'})
        assert resp.status == 403
        body = await resp.json()
        assert body['code'] == 'FORBIDDEN'


@pytest.mark.asyncio
async def test_csrf_enforced_on_delete_endpoint(aiohttp_client):
    """CSRF проверяется на DELETE /admin/api/events/{id}/series/exception."""
    async def handler(request):
        return web.json_response({'ok': True})

    mock_user = MockUser(status='admin')

    async def fake_validate_session(token):
        return mock_user

    async def fake_update_session_expiry(token):
        pass

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_delete('/admin/api/events/123/series/exception', require_csrf(handler))

    with patch('app.auth.validate_session', fake_validate_session), \
         patch('app.auth.update_session_expiry', fake_update_session_expiry):
        client = await aiohttp_client(app)

        # Без CSRF — 403
        resp = await client.delete(
            '/admin/api/events/123/series/exception',
            cookies={'admin_token': 'valid_token'},
        )
        assert resp.status == 403

        # С CSRF — 200
        resp = await client.delete(
            '/admin/api/events/123/series/exception',
            cookies={'admin_token': 'valid_token', 'csrf_token': 'token123'},
            headers={'X-CSRF-Token': 'token123'},
        )
        assert resp.status == 200


@pytest.mark.asyncio
async def test_set_cookie_production_secure(aiohttp_client):
    """_set_cookie устанавливает Secure=True когда COOKIE_SECURE=True."""
    response = web.json_response({'ok': True})

    with patch('app.auth.COOKIE_SECURE', True), \
         patch('app.auth.COOKIE_SAMESITE', 'Strict'), \
         patch('app.auth.COOKIE_DOMAIN', 'example.com'):
        _set_cookie(response, 'test_cookie', 'value', httponly=True, max_age=3600)

    cookie = response.cookies['test_cookie']
    assert cookie.get('secure') is True
    assert cookie['samesite'] == 'Strict'
    assert cookie['domain'] == 'example.com'


@pytest.mark.asyncio
async def test_set_cookie_development_not_secure(aiohttp_client):
    """_set_cookie устанавливает Secure=False когда COOKIE_SECURE=False."""
    response = web.json_response({'ok': True})

    with patch('app.auth.COOKIE_SECURE', False), \
         patch('app.auth.COOKIE_SAMESITE', 'Lax'), \
         patch('app.auth.COOKIE_DOMAIN', ''):
        _set_cookie(response, 'test_cookie', 'value')

    cookie = response.cookies['test_cookie']
    assert cookie.get('secure') is False


@pytest.mark.asyncio
async def test_login_same_error_for_wrong_user_and_password(aiohttp_client):
    """Login возвращает одинаковую ошибку для неверного логина и пароля."""
    from argon2 import PasswordHasher
    ph = PasswordHasher()
    mock_user = MockUser(status='admin')
    mock_user.password = ph.hash('correct')

    async def fake_get_user_by_login(login):
        if login == 'existing':
            return mock_user
        return None

    with patch('app.auth.get_user_by_login', fake_get_user_by_login):
        app = web.Application()
        app.router.add_post('/admin/login', admin_login)
        client = await aiohttp_client(app)

        # Неверный логин
        resp1 = await client.post('/admin/login', json={
            'login': 'unknown', 'password': 'any',
        })
        # Неверный пароль
        resp2 = await client.post('/admin/login', json={
            'login': 'existing', 'password': 'wrong',
        })

        body1 = await resp1.json()
        body2 = await resp2.json()
        # Одинаковый код и статус
        assert resp1.status == resp2.status == 401
        assert body1['code'] == body2['code'] == 'AUTH_FAILED'
