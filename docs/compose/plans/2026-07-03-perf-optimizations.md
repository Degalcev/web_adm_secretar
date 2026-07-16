# Performance & Architecture Optimizations

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant network requests, reduce DOM flash on page switches, and clean up code debt — achieving measurable load-time improvements and cleaner module boundaries.

**Architecture:** Merge `/auth/check` + `/users/me` into one request (−1 RTT per page load). Extend `/admin/api/dashboard` with organizer/location lists (eliminate separate preload fetch on dashboard). Remove board clearing in `switchPage()` for cached pages. Add `eventsResetCache()` as a public API. Remove dead code (duplicate handler, redundant fetch).

**Tech Stack:** Python aiohttp backend, vanilla JS frontend, PostgreSQL, localStorage cache

## Global Constraints

- Все коммиты и пояснения — на русском языке
- Деплой через `python deploy/deploy.py test` (ветка `develop`)
- Версионирование: инкрементировать второе значение (не patch)
- PostgreSQL: только тестовая база `test_db` на VPS 45.90.217.225
- `COOKIE_DOMAIN` test=`45.90.217.225`, prod=`bot.dlab.run`
- НЕ трогай цвета — запрет на изменение цветов вкладок/заголовка
- `loguru.logger` — никогда `print()` или `logging`
- `@require_csrf` только на POST/PUT/DELETE (multipart-compatible)

---

## Task 1: Merge `/auth/check` + `/users/me` into one request

**Covers:** Оптимизация #1 — убрать один RTT при каждом входе/обновлении страницы

**Files:**
- Modify: `app/routes/users.py:30-32` (check_auth handler)
- Modify: `app/static/js/auth.js:9-34` (checkAuth function), `app/static/js/auth.js:39-68` (loadCurrentUser)

**Interfaces:**
- Produces: `GET /admin/api/auth/check` теперь возвращает user object вместо `{"ok": True}`
- Consumes: `checkAuth()` читает user данные напрямую из ответа, не вызывает `loadCurrentUser()`

- [ ] **Step 1: Обновить backend `check_auth` в `app/routes/users.py`**

Заменить функцию `check_auth` (строки 30-32) на:

```python
async def check_auth(request: web.Request) -> web.Response:
    """Проверка авторизации — возвращает данные пользователя."""
    try:
        user = request['user']
        return web.json_response({
            'ok': True,
            'id': user.id,
            'first_name': user.first_name or '',
            'last_name': user.last_name or '',
            'patronymic': user.patronymic or '',
            'username': user.username or '',
            'name': user.name or '',
            'max_id': user.max_id,
            'status': user.status or 'user',
        })
    except Exception as e:
        logger.error('Ошибка check_auth: {}', repr(e))
        return web.json_response({'ok': False}, status=401)
```

- [ ] **Step 2: Обновить `checkAuth()` в `app/static/js/auth.js`**

Заменить функцию `checkAuth` (строки 9-34):

```javascript
async function checkAuth() {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
        if (resp.ok) {
            const me = await resp.json();
            if (!me.ok) throw new Error('auth check failed');
            isAuthenticated = true;
            window.currentUserRole = me.status || 'user';
            window.currentUser = me;
            const lastName = me.last_name || '';
            const firstName = me.first_name || '';
            if (lastName && firstName) {
                window.currentUserName = `${lastName} ${firstName.charAt(0)}.`;
            } else if (me.name) {
                window.currentUserName = me.name;
            } else if (me.username) {
                window.currentUserName = me.username;
            } else {
                window.currentUserName = `User #${me.max_id || ''}`;
            }
            const userEl = document.getElementById('topbar-user');
            if (userEl && window.currentUserName) {
                userEl.textContent = window.currentUserName;
                userEl.style.display = 'inline';
            }
            showMain();
            if (typeof applyRoleRestrictions === 'function') {
                applyRoleRestrictions();
            }
            const route = getRouteFromURL();
            if (route && typeof ROUTES !== 'undefined' && ROUTES[route]) {
                navigateTo(route, false);
            }
            return true;
        }
    } catch (e) { /* ignore network errors */ }

    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    window.currentUser = null;
    showLogin();
    return false;
}
```

- [ ] **Step 3: Сделать `loadCurrentUser()` вызываемой только из `login()`**

Функция `loadCurrentUser()` (строки 39-68) больше не нужна в `checkAuth()`. Она остаётся как fallback для `login()` — но `login()` уже вызывает `checkAuth()` который теперь возвращает user data. Удалить вызов `await loadCurrentUser()` из `checkAuth()`. Функцию `loadCurrentUser()` оставить как есть (на случай если что-то другое её вызывает).

- [ ] **Step 4: Коммит**

```bash
git add app/routes/users.py app/static/js/auth.js
git commit -m "perf: объединить /auth/check + /users/me в один запрос"
```

---

## Task 2: Extend `/admin/api/dashboard` with organizer/location lists

**Covers:** Оптимизация #2 — убрать отдельный preload-запрос при первом входе на дашборд

**Files:**
- Modify: `app/routes/vks.py:379-481` (dashboard_stats)
- Modify: `app/static/js/dashboard.js:12-21` (initDashboard), `app/static/js/dashboard.js:96-109` (renderDashboard)

**Interfaces:**
- Produces: `GET /admin/api/dashboard` теперь возвращает `organizers` и `locations` массивы
- Consumes: `initDashboard()` сохраняет справочники в `store` при первом входе

- [ ] **Step 1: Добавить загрузку справочников в `dashboard_stats()` в `app/routes/vks.py`**

Добавить перед `return web.json_response({...})` (перед строкой 467):

```python
        # Справочники
        from database.models import Organizer, Location
        orgs_q = await session.execute(select(Organizer))
        organizers = [{'id': o.id, 'name': o.name, 'short_name': o.short_name or ''} for o in orgs_q.scalars()]

        locs_q = await session.execute(select(Location))
        locations = [{'id': l.id, 'name': l.name} for l in locs_q.scalars()]
```

И добавить в `return` dict (после `chart_year`):

```python
            'organizers': organizers,
            'locations': locations,
```

- [ ] **Step 2: Обновить `initDashboard()` в `app/static/js/dashboard.js`**

Заменить `initDashboard` (строки 12-21):

```javascript
async function initDashboard() {
    setupDashboardClicks();
    if (_dashCache) {
        renderDashboard();
        _dashRefreshInBackground();
        return;
    }
    await _dashFetch();
    // Сохранить справочники в store при первом входе
    if (_dashCache?.organizers && !store.allOrganizers?.length) {
        store.allOrganizers = _dashCache.organizers;
    }
    if (_dashCache?.locations && !store.allLocations?.length) {
        store.allLocations = _dashCache.locations;
    }
    renderDashboard();
}
```

- [ ] **Step 3: Коммит**

```bash
git add app/routes/vks.py app/static/js/dashboard.js
git commit -m "perf: dashboard возвращает справочники — убрать двойной preload"
```

---

## Task 3: Remove board clearing in `switchPage()` for cached pages

**Covers:** Оптимизация #3 — убрать мигание доски при переключении страниц

**Files:**
- Modify: `app/static/js/navigation.js:50-62` (switchPage)

**Interfaces:**
- Consumes: `renderVksBoard()` уже проверяет localStorage кэш и рендерит мгновенно

- [ ] **Step 1: Убрать innerHTML очистку для VKS страниц в `navigation.js`**

Закомментировать или удалить строки 50-57:

```javascript
    // Очистить доски при переключении — renderVksBoard/renderEventsBoard сами берут из кэша
    // if (page === 'vks-active') {
    //     const board = document.getElementById('vks-board-active');
    //     if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
    // }
    // if (page === 'vks-completed') {
    //     const board = document.getElementById('vks-board-completed');
    //     if (board) board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';
    // }
```

Для Events страниц (строки 59-62) — оставить как есть, т.к. events.js `_eventsHardReset()` сам очищает board.

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/navigation.js
git commit -m "perf: убрать очистку VKS board при переключении — кэш рендерит мгновенно"
```

---

## Task 4: Add `eventsResetCache()` public API

**Covers:** Оптимизация #4 — убрать хрупкую связь между auth.js и events.js

**Files:**
- Modify: `app/static/js/events.js` (добавить функцию)
- Modify: `app/static/js/auth.js:139-142` (logout)

**Interfaces:**
- Produces: `eventsResetCache()` — сбрасывает обе ветки кэша
- Consumes: `logout()` вызывает `eventsResetCache()` вместо прямого доступа к `_eventsCache`

- [ ] **Step 1: Добавить `eventsResetCache()` в `app/static/js/events.js`**

Добавить после `_eventsInvalidateCache()` (после строки 39):

```javascript
function eventsResetCache() {
    _eventsCache.active = { events: [], cursorDate: null, cursorTime: null, cursorId: null, hasMore: true, ts: 0 };
    _eventsCache.completed = { events: [], cursorDate: null, cursorTime: null, cursorId: null, hasMore: true, ts: 0 };
}
```

- [ ] **Step 2: Обновить `logout()` в `app/static/js/auth.js`**

Заменить строки 139-142:

```javascript
    if (typeof eventsResetCache === 'function') eventsResetCache();
```

- [ ] **Step 3: Коммит**

```bash
git add app/static/js/events.js app/static/js/auth.js
git commit -m "refactor: eventsResetCache() — убрать хрупкую связь из logout()"
```

---

## Task 5: Remove duplicate `update_organizer_handler`

**Covers:** Оптимизация #7 — удалить мёртвый код

**Files:**
- Modify: `app/routes/organizers.py:51-65` (удалить дубль)

**Interfaces:** Нет изменений в поведении — второе определение идентично первому.

- [ ] **Step 1: Удалить дублированную функцию в `app/routes/organizers.py`**

Удалить строки 51-65 (второе определение `update_organizer_handler` с `@require_csrf`):

```python
# УДАЛИТЬ этот блок (строки 50-66 — пустая строка + дубль):
@require_csrf
async def update_organizer_handler(request: web.Request) -> web.Response:
    try:
        item_id = request.match_info['id']
        data = await request.json()
        await update_organizer(
            organizer_id=item_id,
            name=data.get('name'),
            short_name=data.get('short_name'),
            base_url=data.get('base_url'),
        )
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка обновления организатора: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


```

- [ ] **Step 2: Коммит**

```bash
git add app/routes/organizers.py
git commit -m "fix: удалить дубль update_organizer_handler"
```

---

## Task 6: Replace redundant fetch in `loadEventSelects()` with preloader wait

**Covers:** Оптимизация #5 — дедупликация запроса к `/admin/api/organizers`

**Files:**
- Modify: `app/static/js/event-modal.js:355-365` (loadEventSelects)

**Interfaces:**
- Consumes: `preloadAllData()` возвращает промис, `_preloaded` флаг предотвращает повторный запрос

- [ ] **Step 1: Заменить fallback fetch на ожидание preloader в `event-modal.js`**

Заменить строки 355-365:

```javascript
async function loadEventSelects() {
    // Ждём preloader если он ещё работает (вернёт сразу если _preloaded = true)
    if (!store.allOrganizers?.length || !store.allLocations?.length) {
        if (typeof preloadAllData === 'function') {
            await preloadAllData();
        } else {
            const [orgResp, locResp] = await Promise.all([
                fetch('/admin/api/organizers', { credentials: 'same-origin' }),
                fetch('/admin/api/locations', { credentials: 'same-origin' })
            ]);
            if (orgResp.ok) store.allOrganizers = await orgResp.json();
            if (locResp.ok) store.allLocations = await locResp.json();
        }
    }
```

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/event-modal.js
git commit -m "perf: loadEventSelects использует preloader вместо дублирующего fetch"
```

---

## Execution Summary

| Task | Изменения | Эффект |
|------|-----------|--------|
| T1 | `check_auth` + `checkAuth()` | −1 RTT при каждом входе/обновлении |
| T2 | `dashboard_stats` + `initDashboard()` | −1 fetch при первом входе на дашборд |
| T3 | `navigation.js` switchPage | Убрать flash мигание VKS досок |
| T4 | `events.js` + `auth.js` logout | Чистая архитектура — публичный API сброса |
| T5 | `organizers.py` удалить дубль | Мёртвый код → нет |
| T6 | `event-modal.js` loadEventSelects | Дедупликация organizers/locations fetch |

**Порядок реализации:** T1 → T2 → T3 → T4 → T5 → T6 (T1-T2 независимы, T3-T6 тоже, но T1-T2 дают максимальный выигрыш)

**Итого:** −2 RTT при каждом входе, устранение flash при переключении страниц, чище модули.
