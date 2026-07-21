"""Unit-тесты для require_csrf decorator."""
import pytest
from aiohttp import web

from app.auth import require_csrf
from tests.conftest import make_mock_request


# --- Тестовые handler ---

@require_csrf
async def protected_handler(request):
    return web.json_response({'ok': True})


# --- Тесты ---

@pytest.mark.asyncio
async def test_get_request_passes_without_csrf():
    """GET-запросы не требуют CSRF-токена."""
    request = make_mock_request(method='GET')
    resp = await protected_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_post_with_valid_csrf_cookie_and_header():
    """POST с валидным CSRF-токеном в cookie и header проходит."""
    token = 'abc123'
    request = make_mock_request(
        method='POST',
        cookies={'csrf_token': token},
        headers={'X-CSRF-Token': token},
    )
    resp = await protected_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_post_with_mismatched_csrf_tokens():
    """POST с различающимися CSRF-токенами отклоняется."""
    request = make_mock_request(
        method='POST',
        cookies={'csrf_token': 'token_a'},
        headers={'X-CSRF-Token': 'token_b'},
    )
    resp = await protected_handler(request)
    assert resp.status == 403
    body = resp.body
    assert b'CSRF_INVALID' in body


@pytest.mark.asyncio
async def test_post_without_csrf_cookie():
    """POST без csrf_token cookie отклоняется."""
    request = make_mock_request(
        method='POST',
        headers={'X-CSRF-Token': 'some_token'},
    )
    resp = await protected_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_post_without_csrf_header():
    """POST без CSRF header отклоняется."""
    request = make_mock_request(
        method='POST',
        cookies={'csrf_token': 'some_token'},
    )
    resp = await protected_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_csrf_from_json_body():
    """CSRF-токен из JSON body принимается."""
    token = 'json_token_123'
    request = make_mock_request(
        method='POST',
        cookies={'csrf_token': token},
        json_data={'csrf_token': token, 'name': 'test'},
    )
    resp = await protected_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_put_with_valid_csrf():
    """PUT с валидным CSRF-токеном проходит."""
    token = 'put_token'
    request = make_mock_request(
        method='PUT',
        cookies={'csrf_token': token},
        headers={'X-CSRF-Token': token},
    )
    resp = await protected_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_delete_with_valid_csrf():
    """DELETE с валидным CSRF-токеном проходит."""
    token = 'delete_token'
    request = make_mock_request(
        method='DELETE',
        cookies={'csrf_token': token},
        headers={'X-CSRF-Token': token},
    )
    resp = await protected_handler(request)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_delete_without_csrf_rejected():
    """DELETE без CSRF-токена отклоняется."""
    request = make_mock_request(method='DELETE')
    resp = await protected_handler(request)
    assert resp.status == 403


@pytest.mark.asyncio
async def test_csrf_does_not_log_token_values():
    """CSRF-лог не содержит значений токенов (проверяем через вызов)."""
    # Тест проверяет, что при невалидном CSRF вызов logger.warning
    # не содержит сами токены. Мы проверяем через перехват логов.
    import logging
    from unittest.mock import patch

    token_a = 'secret_cookie_token'
    token_b = 'different_header_token'

    request = make_mock_request(
        method='POST',
        cookies={'csrf_token': token_a},
        headers={'X-CSRF-Token': token_b},
    )

    with patch('app.auth.logger') as mock_logger:
        resp = await protected_handler(request)
        assert resp.status == 403

        # Проверяем, что warning вызван
        mock_logger.warning.assert_called()
        log_message = mock_logger.warning.call_args[0][0]
        # Убеждаемся, что токены НЕ в логе
        assert token_a not in log_message
        assert token_b not in log_message


@pytest.mark.asyncio
async def test_csrf_error_response_format():
    """Формат CSRF-ошибки содержит ok, code, message."""
    request = make_mock_request(method='POST')
    resp = await protected_handler(request)
    assert resp.status == 403
    body = resp.body
    assert b'ok' in body
    assert b'code' in body
    assert b'message' in body


@pytest.mark.asyncio
async def test_preserves_handler_name():
    """Декоратор сохраняет имя handler-а."""
    assert protected_handler.__name__ == 'protected_handler'


@pytest.mark.asyncio
async def test_patch_method_not_protected_by_csrf():
    """PATCH не защищён require_csrf (только POST/PUT/DELETE)."""
    request = make_mock_request(method='PATCH')
    resp = await protected_handler(request)
    assert resp.status == 200
