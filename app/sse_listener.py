import asyncio
import json
from loguru import logger
from config import DB_USER, DB_USER_PASSWORD, DB_HOST, DB_PORT, DB_NAME


_subscribers = set()
_connection = None


def subscribe():
    q = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q):
    _subscribers.discard(q)


async def _broadcast(data):
    for q in list(_subscribers):
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            _subscribers.discard(q)


async def _listen_loop():
    global _connection
    import asyncpg

    while True:
        try:
            logger.info('SSE listener: connecting to {}@{}:{}/{}', DB_USER, DB_HOST, DB_PORT, DB_NAME)
            _connection = await asyncpg.connect(
                user=DB_USER, password=DB_USER_PASSWORD,
                database=DB_NAME, host=DB_HOST, port=int(DB_PORT)
            )
            logger.info('SSE listener: connected, adding listener...')
            await _connection.add_listener('update_event', _on_notify)
            logger.info('SSE listener: LISTEN update_event OK')
            # Keep alive
            while True:
                await asyncio.sleep(60)
                await _connection.execute('SELECT 1')
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error('SSE listener error: {}, retry in 5s', repr(e))
            await asyncio.sleep(5)


async def _on_notify(connection, pid, channel, payload):
    logger.info('SSE notify received: channel={}, payload={}', channel, payload[:200])
    try:
        data = json.loads(payload)
        logger.info('SSE: broadcasting to {} subscribers', len(_subscribers))
        await _broadcast(data)
    except (json.JSONDecodeError, TypeError):
        logger.info('SSE: skipped non-JSON payload')
    except Exception as e:
        logger.error('SSE notify error: {}', repr(e))


_listener_task = None


def start_listener():
    global _listener_task
    if _listener_task is None or _listener_task.done():
        _listener_task = asyncio.ensure_future(_listen_loop())


def stop_listener():
    global _listener_task, _connection
    if _listener_task:
        _listener_task.cancel()
    if _connection:
        asyncio.ensure_future(_connection.close())
