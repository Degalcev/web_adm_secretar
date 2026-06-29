from aiohttp import web
from loguru import logger

from app.admin_routes import setup_admin_routes
from config import WEBAPP_HOST, WEBAPP_PORT
from pathlib import Path

STATIC_PATH = Path(__file__).parent / 'static'


async def start_webapp(host='0.0.0.0', port=8080):
    app = web.Application()

    setup_admin_routes(app)

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
