# AGENTS.md — web_adm_secretar

## Project Identity

Admin panel for VKS Secretar bot. Python aiohttp backend, PostgreSQL, vanilla JS/CSS SPA frontend. SSH deploy to VPS.

## Deploy (critical — wrong command = wrong env)

```bash
# Test (branch: develop)
python deploy/deploy.py test
# → VPS /opt/web_test, port 8082, service: web-admin-test
# → http://45.90.217.225:8082/admin

# Prod (branch: main)
python deploy/deploy.py prod
# → VPS /opt/web, port 8081, service: web_admin (note underscore!)
# → https://bot.dlab.run/admin
```

Deploy script clones from git. **Must commit + push before deploying.**

## Branches

| Branch | Target | Deploy |
|--------|--------|--------|
| `develop` | test server | `python deploy/deploy.py test` |
| `main` | production | `python deploy/deploy.py prod` |

## Auth Model

**Auth middleware** handles ALL auth. No `@admin_required` or `@auth_required` decorators — they were removed. Middleware checks every request except public routes.

- `@require_csrf` — still used on POST/PUT/DELETE (multipart-compatible)
- Cookie: `admin_token` (httponly) + `csrf_token` (js-readable), domain from `COOKIE_DOMAIN`
- Roles checked on frontend only (via `applyRoleRestrictions()`), not by middleware

## SPA Routing Gotcha

Adding a new route requires updating **TWO lists**:
1. `SPA_PATHS` in `app/server.py` (serves index.html)
2. `spa_prefixes` in `app/auth.py` (skips auth check)

Missing either = 404 or 401.

## Database

- **test_db** — use for all development (`deploy/.env.test`)
- `DB_USER=bot_secretar` in .env.test (NOT `web_secretar`)
- PostgreSQL, SQLAlchemy async, asyncpg driver

## Logging

Always use `loguru.logger`. Never `print()` or `logging`.

## CSS Load Order (order matters!)

```
base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → vks-modal → calendar
```

- `responsive.css` must be last base CSS
- `vks-modal.css` and `calendar.css` come AFTER responsive.css (higher specificity)
- Missing/extra `}` breaks ALL subsequent rules (CSS parse error cascade)

## Key Gotchas

- `body { overflow: hidden }` in base.css affects all pages — calendar relies on this for layout. Removing it breaks `.cal-wrap` scroll
- `overflow: clip` on tables — not `overflow: hidden` (avoids nested scroll context)
- `event.stopPropagation()` on delete buttons — prevents opening edit modal
- `organizers.py` has a duplicate `update_organizer_handler` function — pre-existing bug
- `await` on sync functions causes TypeError — `start_listener()`/`stop_listener()` are sync
- All IDs are UUID strings (not integers). Event locking uses `user.id` (UUID), NOT `max_id` (Integer)
- Multipart for events: `keep_doc_ids` is comma-separated IDs for preserving documents on update

## Frontend Patterns

- Vanilla JS, no framework. SPA routing via `router.js`
- `checkAuth()` is the SINGLE source of truth for `isAuthenticated`
- `window.store` — centralized data (allEvents, allLocations, allOrganizers, allUsers)
- `createCrudModule(config)` in utils.js — factory for CRUD modules
- Modals loaded as HTML partials via `app/static/partials/*.html`
- SSE updates 4 channels: events, users, locations, organizers

## Reference Files

- `CLAUDE.md` — full architecture, patterns, rules (detailed reference)
- `mimo.md` — API endpoints, DB models, SPA routes
- `.mimocode/agents/` — specialized agent prompts (backend, frontend, database, security, devops)
- `.mimocode/skills/` — skill definitions for common tasks
