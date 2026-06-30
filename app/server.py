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
)

STATIC_PATH = Path(__file__).parent / 'static'


async def start_webapp(host='0.0.0.0', port=8080):
    app = web.Application()

    # Auth routes
    app.router.add_get('/admin', admin_page)
    app.router.add_post('/admin/login', admin_login)
    app.router.add_post('/admin/logout', admin_logout)

    # Resource routes
    setup_users_routes(app)
    setup_organizers_routes(app)
    setup_locations_routes(app)
    setup_logs_routes(app)

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


async def admin_page(request: web.Request) -> web.Response:
    html_path = Path(__file__).parent / 'static' / 'admin.html'
    if not html_path.exists():
        logger.error('Файл admin.html не найден по пути: {}', html_path)
        return web.Response(text='Admin page not found', status=404)
    return web.Response(
        text=html_path.read_text(encoding='utf-8'),
        content_type='text/html'
    )
