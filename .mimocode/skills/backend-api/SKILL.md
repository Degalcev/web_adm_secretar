---
name: backend-api
description: Use when editing Python files in app/ or database/ — covers aiohttp routes, auth, DB patterns, SSE
---

# Backend API Patterns

## aiohttp route structure
Each domain has a `setup_*_routes(app)` function in `app/routes/`:
```python
def setup_vks_routes(app):
    app.router.add_get('/admin/api/events', get_events_handler)
    app.router.add_post('/admin/api/events', create_event_handler)
    app.router.add_put('/admin/api/events/{id}', update_event_handler)
    app.router.add_delete('/admin/api/events/{id}', delete_event_handler)
```

All handlers receive `request: web.Request`. Access user via `request['user']` (set by auth middleware).

## Auth middleware (auth.py)
- Checks every request except: static files, PUBLIC_ROUTES, SPA routes (non-API)
- Sets `request['user']` = SQLAlchemy User object
- Rolling session: updates TTL on each request
- `@require_csrf` decorator for POST/PUT/DELETE

## Database patterns
```python
from database.models import async_session
from sqlalchemy import select

async def get_something(id: str):
    async with async_session() as session:
        result = await session.execute(select(Model).where(Model.id == id))
        return result.scalar_one_or_none()
```

Write operations use `database/sending.py`:
```python
from database.sending import lock_event, unlock_event
```

## SSE notification
After any write to `events` table, PostgreSQL trigger fires NOTIFY. SSE listener broadcasts to all connected clients. No manual SSE trigger needed from route handlers.

## Event types
```python
ALLOWED_TYPES = ['ВКС', 'Совещание', 'Встреча', 'Заседание', 'Приём']
```
Validate in create/update handlers.

## Key endpoints
- `GET /admin/api/events` — list with filters (status, type, exclude_type, from, to, limit, cursor_*)
- `GET /admin/api/events/{id}/single` — full event with docs/participants/series
- `GET /admin/api/events/stats` — COUNT-based stats with filters
- `GET /admin/api/dashboard` — aggregated dashboard data
- `POST /admin/api/events/{id}/lock` / `unlock` — event locking
- `POST /admin/login` — returns admin_token + csrf_token cookies
- `GET /admin/api/auth/check` — validates session
- `GET /admin/api/events/stream` — SSE endpoint

## Logging
Always `from loguru import logger`. Never print() or logging module.
