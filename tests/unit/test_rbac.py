"""Unit-тесты для require_role decorator."""
import pytest
from aiohttp import web
from aiohttp.web import json_response

from app.auth import require_role
from tests.conftest import MockUser, make_mock_request


# --- Тестовые handler-ы ---

@require_role('admin')
async def admin_only_handler(request):
    return web.json_response({'ok': True, 'role': 'admin'})


@require_role('admin', 'editor')
async def admin_or_editor_handler(request):
    return web.json_response({'ok': True, 'role': 'admin_or_editor'})


@require_role('admin', 'editor', 'viewer')
async def any_role_handler(request):
    return web.json_response({'ok': True, 'role': 'any_role'})


# --- Тесты ---

@pytest.mark.asyncio
async def test_admin_role_passes_admin_only():
    """Админ проходит проверку admin-only endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='admin')
    resp = await admin_only_handler(request)
    assert resp.status == 200
    body = resp.body
    assert b'"ok": true' in body or b'"ok":true' in body


@pytest.mark.asyncio
async def test_editor_role_blocked_by_admin_only():
    """Редактор НЕ проходит проверку admin-only endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='editor')
    resp = await admin_only_handler(request)
    assert resp.status == 403
    body = resp.body
    assert b'FORBIDDEN' in body


@pytest.mark.asyncio
async def test_viewer_role_blocked_by_admin_only():
    """Просмотрщик НЕ проходит проверку admin-only endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='viewer')
    resp = await admin_only_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_no_user_returns_401():
    """Отсутствие пользователя возвращает 401."""
    request = make_mock_request()
    # user не установлен
    resp = await admin_only_handler(request)
    assert resp.status == 401
    body = resp.body
    assert b'UNAUTHORIZED' in body


@pytest.mark.asyncio
async def test_admin_passes_admin_or_editor():
    """Админ проходит admin_or_editor endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='admin')
    resp = await admin_or_editor_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_editor_passes_admin_or_editor():
    """Редактор проходит admin_or_editor endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='editor')
    resp = await admin_or_editor_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_viewer_blocked_by_admin_or_editor():
    """Просмотрщик НЕ проходит admin_or_editor endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='viewer')
    resp = await admin_or_editor_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_regular_user_blocked_by_admin_or_editor():
    """Обычный пользователь НЕ проходит admin_or_editor endpoint."""
    request = make_mock_request()
    request['user'] = MockUser(status='user')
    resp = await admin_or_editor_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_allowed_roles_pass_any_role_handler():
    """Роли из списка проходят endpoint."""
    for status in ('admin', 'editor', 'viewer'):
        request = make_mock_request()
        request['user'] = MockUser(status=status)
        resp = await any_role_handler(request)
        assert resp.status == 200, f"Role '{status}' should pass"


@pytest.mark.asyncio
async def test_disallowed_role_blocked_any_role_handler():
    """Роль 'user' НЕ проходит endpoint с ролями admin/editor/viewer."""
    request = make_mock_request()
    request['user'] = MockUser(status='user')
    resp = await any_role_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_error_response_format():
    """Формат ошибки содержит ok, code, message."""
    request = make_mock_request()
    request['user'] = MockUser(status='viewer')
    resp = await admin_only_handler(request)
    assert resp.status == 403
    body = resp.body
    assert b'ok' in body
    assert b'code' in body
    assert b'message' in body


@pytest.mark.asyncio
async def test_401_response_has_correct_code():
    """401 ответ содержит code=UNAUTHORIZED."""
    request = make_mock_request()
    resp = await admin_only_handler(request)
    assert resp.status == 401
    body = resp.body
    assert b'UNAUTHORIZED' in body


@pytest.mark.asyncio
async def test_403_response_has_correct_code():
    """403 ответ содержит code=FORBIDDEN."""
    request = make_mock_request()
    request['user'] = MockUser(status='viewer')
    resp = await admin_only_handler(request)
    assert resp.status == 403
    body = resp.body
    assert b'FORBIDDEN' in body


@pytest.mark.asyncio
async def test_preserves_handler_name():
    """Декоратор сохраняет имя handler-а (wraps)."""
    assert admin_only_handler.__name__ == 'admin_only_handler'
    assert admin_or_editor_handler.__name__ == 'admin_or_editor_handler'
