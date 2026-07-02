# app/server.py

from aiohttp import web
from loguru import logger
from pathlib import Path

from app.auth import admin_login, admin_logout
from app.routes import (
    setup_users_routes,
    setup_organizers_routes,
    setup_locations_routes,
    setup_logs_routes,
    setup_vks_routes,
)
from app.routes.documents import setup_document_routes

STATIC_PATH = Path(__file__).parent / 'static'

# Все SPA маршруты
SPA_PATHS = [
    '/',
    '/panel/',
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


async def start_webapp(host='0.0.0.0', port=8080):
    app = web.Application(client_max_size=100 * 1024 * 1024)

    # Auth API routes
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)

    # SPA routes - отдают index.html
    for path in SPA_PATHS:
        app.router.add_get(path, index_page)

    # Resource API routes
    setup_users_routes(app)
    setup_organizers_routes(app)
    setup_locations_routes(app)
    setup_logs_routes(app)
    setup_vks_routes(app)
    setup_document_routes(app)

    # Статика
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
    return web.Response(
        text=html_path.read_text(encoding='utf-8'),
        content_type='text/html'
    )
