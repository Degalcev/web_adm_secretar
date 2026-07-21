import asyncio
import pytest
import pytest_asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, TestServer, TestClient


class MockUser:
    """Мок пользователя для тестов авторизации."""
    def __init__(self, user_id='test-user-id', status='admin', login='testuser'):
        self.id = user_id
        self.status = status
        self.login = login
        self.first_name = 'Test'
        self.last_name = 'User'
        self.patronymic = ''
        self.username = login
        self.name = 'Test User'
        self.max_id = 1
        self.tg_id = 12345
        self.password = None
        self.notification = False
        self.bot_listen = False


def make_mock_request(method='GET', path='/admin/api/test', cookies=None, headers=None, json_data=None):
    """Создаёт мок-запрос для тестирования decorators."""

    class _Request:
        _data = None

        def __init__(self):
            self._data = {}

        def __getitem__(self, key):
            return self._data.get(key)

        def __setitem__(self, key, value):
            self._data[key] = value

        def get(self, key, default=None):
            return self._data.get(key, default)

    request = _Request()
    request.method = method
    request.path = path
    request.cookies = cookies or {}
    request.headers = headers or {}
    request.remote = '127.0.0.1'
    request.match_info = {}

    if json_data is not None:
        request.json = AsyncMock(return_value=json_data)
    else:
        request.json = AsyncMock(side_effect=Exception('No JSON body'))

    request.post = AsyncMock(return_value={})

    return request


@pytest.fixture
def admin_user():
    return MockUser(status='admin')


@pytest.fixture
def editor_user():
    return MockUser(status='editor')


@pytest.fixture
def viewer_user():
    return MockUser(status='viewer')


@pytest.fixture
def regular_user():
    return MockUser(status='user')
