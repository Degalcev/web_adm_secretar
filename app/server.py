# app/server.py

import asyncio
from aiohttp import web
from loguru import logger
from pathlib import Path

from app.auth import auth_middleware, admin_login, admin_logout
from app.routes import (
    setup_users_routes,
    setup_organizers_routes,
    setup_locations_routes,
    setup_logs_routes,
    setup_vks_routes,
)
from app.routes.documents import setup_document_routes
from app.routes.preload import setup_preload_routes
from app.routes.sse import setup_sse_routes
from app.sse_listener import start_listener, stop_listener
from database.sending import cleanup_expired_sessions
from database.requests import cleanup_stale_locks

STATIC_PATH = Path(__file__).parent / 'static'
VERSION = 'dev'


def _read_version():
    """Чтение версии из version.json при старте."""
    global VERSION
    vpath = Path(__file__).parent.parent / 'version.json'
    if vpath.exists():
        try:
            import json
            VERSION = json.loads(vpath.read_text()).get('version', 'dev')
        except Exception:
            VERSION = 'dev'

# Все SPA маршруты
SPA_PATHS = [
    '/',
    '/panel/',
    '/admin',
    '/admin/',
    '/admin/users/',
    '/admin/organizers/',
    '/admin/locations/',
    '/admin/logs/',
    '/conferences/',
    '/conferences/completed/',
    '/settings/',
    '/settings/general/',
    '/settings/profile/',
]


# --- Session Cleanup ---

async def periodic_session_cleanup():
    """Очистка истёкших сессий каждые 6 часов."""
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await cleanup_expired_sessions()
            await cleanup_stale_locks()
            logger.info('Периодическая очистка сессий и lock\'ов выполнена')
        except Exception as e:
            logger.error('Ошибка очистки сессий: {}', repr(e))


async def on_startup(app):
    """Действия при старте сервера."""
    try:
        await cleanup_expired_sessions()
        await cleanup_stale_locks()
        logger.info('Очистка истёкших сессий и stale lock\'ов выполнена при старте')
    except Exception as e:
        logger.error('Ошибка очистки сессий при старте: {}', repr(e))

    app['session_cleanup_task'] = asyncio.create_task(periodic_session_cleanup())
    start_listener()


async def on_shutdown(app):
    """Действия при остановке сервера."""
    task = app.get('session_cleanup_task')
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    stop_listener()


# --- Web App ---

async def start_webapp(host='0.0.0.0', port=8080):
    _read_version()
    app = web.Application(client_max_size=100 * 1024 * 1024)

    # Auth middleware
    app.middlewares.append(auth_middleware)

    # Startup / Shutdown
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    # Auth API routes
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)

    # SPA routes
    for path in SPA_PATHS:
        app.router.add_get(path, index_page)

    # Resource API routes
    setup_users_routes(app)
    setup_organizers_routes(app)
    setup_locations_routes(app)
    setup_logs_routes(app)
    setup_vks_routes(app)
    setup_document_routes(app)
    setup_preload_routes(app)
    setup_sse_routes(app)

    # Version JSON
    async def version_json(request):
        vpath = Path(__file__).parent.parent / 'version.json'
        if vpath.exists():
            return web.FileResponse(vpath)
        return web.json_response({'version': 'dev', 'env': 'dev'})
    app.router.add_get('/version.json', version_json)

    # Static files
    if STATIC_PATH.exists():
        app.router.add_static('/static', path=str(STATIC_PATH), name='static')
        logger.info('Статика: {}', STATIC_PATH)
    else:
        logger.error('Папка static не найдена: {}', STATIC_PATH)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info('Веб-сервер запущен на {}:{}', host, port)
    return runner


async def index_page(request: web.Request) -> web.Response:
    html_path = Path(__file__).parent / 'static' / 'index.html'
    if not html_path.exists():
        logger.error('Файл index.html не найден по пути: {}', html_path)
        return web.Response(text='Page not found', status=404)
    html = html_path.read_text(encoding='utf-8').replace('?v=__VERSION__', f'?v={VERSION}')
    return web.Response(
        text=html,
        content_type='text/html',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    )
