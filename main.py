import asyncio
import logging

from loguru import logger
from app.server import start_webapp
from config import WEBAPP_HOST, WEBAPP_PORT
from database.models import async_main


class InterceptHandler(logging.Handler):
    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = logging.currentframe(), 6
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging():
    logger_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "{extra[user]} | <level>{message}</level>"
    )
    logger.configure(extra={"user": " "})
    logger.add(
        "./logs/bot_{time:YYYY-MM-DD}.log",
        level="DEBUG",
        rotation="00:00",
        retention="7 days",
        format=logger_format,
    )

    for name, level in [
        ('aiohttp', logging.WARNING),
        ('asyncio', logging.WARNING),
        ('sqlalchemy', logging.WARNING),
    ]:
        log = logging.getLogger(name)
        log.setLevel(level)
        log.addHandler(InterceptHandler())
        log.propagate = False


async def main():
    setup_logging()
    await async_main()

    runner = await start_webapp(host=WEBAPP_HOST, port=WEBAPP_PORT)
    logger.info('Админ-панель запущена на {}:{}', WEBAPP_HOST, WEBAPP_PORT)

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('Админ-панель остановлена')
    except Exception as e:
        logger.exception('Критическая ошибка при запуске: {}', e)
