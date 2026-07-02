import asyncio
import json
from aiohttp import web, ClientConnectionResetError
from loguru import logger

from app.auth import admin_required
from app.sse_listener import subscribe, unsubscribe


@admin_required
async def event_stream(request: web.Request) -> web.Response:
    queue = subscribe()
    response = web.StreamResponse(
        status=200,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )
    await response.prepare(request)

    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=30)
                payload = json.dumps(data)
                await response.write(f'data: {payload}\n\n'.encode())
            except asyncio.TimeoutError:
                try:
                    await response.write(b': keepalive\n\n')
                except (ClientConnectionResetError, ConnectionResetError, Exception):
                    break
            except (ClientConnectionResetError, ConnectionResetError):
                break
    except asyncio.CancelledError:
        pass
    finally:
        unsubscribe(queue)
        try:
            await response.write_eof()
        except Exception:
            pass

    return response


def setup_sse_routes(app: web.Application):
    app.router.add_get('/admin/api/events/stream', event_stream)
