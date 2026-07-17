---
name: frontend-spa
description: Use when editing JS/CSS files in app/static/ — covers SPA routing, pageInit, cache, SSE, and vanilla JS patterns
---

# Frontend SPA Patterns

Vanilla JS single-page app. No frameworks. All patterns below are mandatory.

## pageInit — unified page loading pattern
Every page uses `pageInit(pageKey, renderFn, fetchFn)` from cache.js:
```javascript
// Cache valid → render instantly
// Cache empty → fetch → cacheSet → render
async function pageInit(pageKey, renderFn, fetchFn) {
    if (cacheIsValid(pageKey)) { renderFn(); return; }
    await fetchFn();
    renderFn();
}
```

Each page's init function:
- Dashboard: `pageInit('dashboard', renderDashboard, fetchDashboard)`
- VKS: `pageInit(cacheKey, renderVksBoard, () => _vksFetch(filter))`
- Events: `pageInit(cacheKey, renderFn, () => _eventsFetch(status))`
- Calendar: `pageInit('calendar', () => renderCalendar(true), fetchCalendar)`

## Cache system (cache.js)
- `_dataCache` — single object, keys per page (vksActive, eventsActive, dashboard, calendar, etc.)
- Each entry: `{ data, ts }` where ts = Date.now()
- `cacheIsValid(key, ttl)` — checks TTL (default 5min), returns false for empty arrays
- `cacheInvalidate(key)` — sets to null
- Fetch functions MUST NOT cache empty results on error (guard: `if (!resp.ok && !data.length) return`)

## SSE updates (sse.js)
- `sseRefreshPage()` — single function for all SSE event handling
- On events table change: invalidate ALL event caches (vksActive, vksCompleted, eventsActive, eventsCompleted, dashboard, calendar)
- Current page: fetch fresh data + cacheSet + render
- Other pages: cache invalidated → pageInit will fetch on next navigation
- Modal guard: skip refresh if event-modal is open
- Debounce: 200ms

## SPA routing (router.js + navigation.js)
- `ROUTES` map: path → { page, title }
- `navigateTo(path)` → pushState + switchPage(page)
- `switchPage(page)` → highlights nav, shows page div, calls page init
- `handlePopState()` — browser back/forward

## CSS load order (order matters!)
```
base → layout → components → tables → modals → logs → vks → settings → filters → dashboard → responsive → event-modal → calendar
```
responsive.css must be last base CSS. event-modal.css and calendar.css come after responsive.

## Common pitfalls
- `body { overflow: hidden }` in base.css — affects calendar layout
- `overflow: clip` on tables (not hidden)
- `event.stopPropagation()` on delete buttons
- All IDs are UUID strings
- `localDateStr()` for local dates (never toISOString())
- `typeof X === 'function'` for cross-module calls
