---
name: calendar-module
description: Use when editing calendar.js or calendar.css — covers range loading, rendering, tabs, mobile, now-line
---

# Calendar Module

## Architecture
- Cache key: `'calendar'` — stores `{ ranges: { "from_to": events[] } }`
- `_calLoadRange(from, to)` — cursor-based pagination, caches by range key
- `renderCalendar(full)` — full=true rebuilds HTML, full=false updates grid only
- `pageInit('calendar', () => renderCalendar(true), fetchCalendar)` — standard init

## Data loading flow
```
initCalendar()
  → preloadAllData()  (organizers + locations)
  → pageInit('calendar', renderCalendar, fetchCalendar)
    → fetchCalendar() → _calLoadRange(wide range)
    → renderCalendar(true)
```

`_calLoadRange` range: calWeekStart -14 days to +20 days (wide buffer).
`_calGetEventsForDate(ds)` reads from the same wide range cache.

## SSE update
```javascript
// sse.js — calendar branch
cacheInvalidate('calendar');
_calLoadingRange = false;
await _calLoadRange(rangeStart, rangeEnd);  // MUST fetch before render
renderCalendar(false);
```

## Key functions
- `calPrevWeek()` / `calNextWeek()` / `calGoToday()` — navigation
- `calSelectDay(i)` — select day tab (renderCalendar(false))
- `calStartNowLineTimer()` / `calStopNowLineTimer()` — now-line animation
- `_calRenderTabs()` / `_calRenderGrid()` — HTML generators
- `_calGetTypeClass(type)` — ВКС→type-vks, Совещание→type-meeting, etc.

## CSS structure (calendar.css)
- `.cal-wrap` — scroll container (overflow-y: auto)
- `.cal-panel` — tabs + grid wrapper
- `.cal-day-tabs` — horizontal day tabs with SVG shadow
- `.cal-grid` — time labels + event columns
- `.cal-event` — individual event card
- `.cal-now-line` — red line at current time

## Common pitfalls
- `calWeekStart` always Monday (getMonday())
- `_calLoadingRange` mutex — prevents concurrent fetches
- `localDateStr()` for date strings (not toISOString())
- `calActiveDay` tracks selected day
- Mobile: swipe support, room chips, different layout
