---
name: project-architecture
description: Use when starting any task in web_adm_secretar — provides project identity, stack, file structure, deploy, and rules
---

# Project Architecture — web_adm_secretar

Admin panel for VKS Secretar bot. Python aiohttp backend, PostgreSQL, vanilla JS/CSS SPA frontend.

## Stack
- Backend: Python 3 + asyncio + aiohttp
- DB: PostgreSQL (asyncpg) + SQLAlchemy async
- Auth: argon2-cffi, sessions in PostgreSQL
- Frontend: Vanilla JS/CSS SPA (client-side routing)
- Real-time: SSE via PostgreSQL LISTEN/NOTIFY
- Deploy: paramiko SSH to VPS
- Logging: loguru (NEVER print/logging)

## Deploy (critical — wrong command = wrong env)
```bash
python deploy/deploy.py test   # develop branch → /opt/web_test, port 8082
python deploy/deploy.py prod   # main branch → /opt/web, port 8081
```
Deploy script clones from git. MUST commit + push before deploying.

## Branches
- `develop` → test server
- `main` → production

## File Structure
```
app/
├── auth.py           # Auth middleware, CSRF, rate limiting
├── server.py         # aiohttp entry (SPA + API + static)
├── sse_listener.py   # PostgreSQL LISTEN/NOTIFY → broadcast
├── event_logger.py   # Audit log (event_history)
├── event_types.py    # ALLOWED_TYPES config
├── routes/           # API handlers (users, organizers, locations, vks, documents, etc.)
└── static/
    ├── index.html    # SPA entry
    ├── partials/     # Modal HTML (event-modal, user-modal, etc.)
    ├── css/          # base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → event-modal → calendar
    └── js/           # SPA modules (see frontend-spa skill)
database/
├── models.py         # User, Event, Session, Organizer, Location, EventHistory, EventSeries, EventParticipant, Document
├── requests.py       # Read queries
└── sending.py        # Write operations
deploy/
├── deploy.py         # SSH deploy script
├── .env.test         # test_db config (DB_USER=bot_secretar)
└── .env.prod         # prod config
```

## SPA Routing — TWO lists must match
1. `SPA_PATHS` in `app/server.py` (serves index.html)
2. `spa_prefixes` in `app/auth.py` (skips auth check)
Missing either = 404 or 401.

## Auth Model
- Auth middleware handles ALL auth. No decorators.
- `@require_csrf` — on POST/PUT/DELETE (multipart-compatible)
- Cookie: `admin_token` (httponly) + `csrf_token` (js-readable)

## DB
- Test: `test_db` on VPS 45.90.217.225:5432
- DB_USER: `bot_secretar` (NOT web_secretar)
- Password: `,jnctrhtnfhm2024`

## Key Rules
- All IDs are UUID strings (not integers)
- loguru.logger only (never print/logging)
- Any code change requires planning first (plan in docs/compose/plans/)
- CSS load order matters (responsive.css must be last base CSS)
