---
name: vks-events
description: Use when editing vks-board.js, vks-filters.js, events.js, or event-modal.js — covers VKS and Events pages
---

# VKS & Events Pages

## Shared patterns
Both pages use the same architecture:
- **Текущие (active)**: full load (limit=10000), client-side filtering
- **Завершённые (completed)**: cursor-based pagination (limit=50), server-side filtering

## Cache keys
- VKS: `vksActive`, `vksCompleted`
- Events: `eventsActive`, `eventsCompleted`
- Each stores: `{ events, stats, loaded, hasMore, cursorDate, cursorTime, cursorId }`

## Fetch functions
```javascript
// vks-board.js
_vksFetch(filter)  // filter='active'|'completed', type=ВКС
_eventsFetch(status)  // status='active'|'completed', exclude_type=ВКС
```
Both use `Promise.all([events, stats])` for parallel fetch.
Guard: don't cache empty results on error.

## Render functions
- `renderVksBoard(boardId, filter, force)` — reads from cache, renders cards
- `eventsRenderBoard()` — reads from cache, applies client-side filters, renders
- `eventsUpdateStats()` / `_vksRenderStats()` — updates stat counters

## Event modal (event-modal.js)
- `_currentEvent` — current loaded event (set in openEditEventModal)
- Loads via `GET /admin/api/events/{id}/single` (includes docs, participants, series)
- Save: `PUT /admin/api/events/{id}` with FormData (multipart)
- `keep_doc_ids` — comma-separated IDs for preserving documents on update
- Lock: `POST /admin/api/events/{id}/lock` / `unlock`

## SSE update flow
```
sseRefreshPage()
  → invalidate ALL event caches
  → fetch fresh data for current page
  → cacheSet → render
```

## Filters
- VKS: quick-filter (today/soon/missed), org, loc, search, date
- Events: type filter, org, loc, search, date
- Server-side for completed, client-side for active

## Pagination (completed only)
- Cursor-based: cursor_date + cursor_time + cursor_id
- Infinite scroll via sentinel element
- `_vksLoadMore(boardId, filter)` / `_eventsLoadMore()`
