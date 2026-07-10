# Event Locking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Блокировка VKS при редактировании — замок на карточках, auto-timeout 10мин.

**Architecture:** Lock/unlock endpoints + auto-cleanup + frontend lock icon + modal warning.

---

### Task 1: Database layer — lock/unlock + cleanup

**Files:** `database/sending.py`, `database/requests.py`

- [ ] **Step 1:** В `database/sending.py` добавить `lock_event`:

```python
async def lock_event(event_id: str, user_max_id: int) -> dict:
    try:
        async with async_session() as session:
            event = await session.scalar(select(Event).where(Event.id == event_id))
            if not event:
                return {'ok': False, 'error': 'Событие не найдено'}
            # Проверяем — не заблокировано ли уже другим
            if event.locked_by and event.locked_by != user_max_id:
                # Разрешаем, если lock старше 10 минут
                if event.locked_at and (datetime.utcnow() - event.locked_at).total_seconds() < 600:
                    user = await session.scalar(select(User).where(User.max_id == event.locked_by))
                    name = ''
                    if user:
                        parts = [user.last_name or '', user.first_name or '', user.patronymic or '']
                        name = ' '.join(p for p in parts if p).strip() or user.name or str(user.max_id)
                    return {'ok': False, 'locked_by': name or str(event.locked_by), 'locked_at': event.locked_at.isoformat() if event.locked_at else None}
            # Ставим lock
            event.locked_by = user_max_id
            event.locked_at = datetime.utcnow()
            await session.commit()
            logger.debug('Lock event {} by user {}', event_id, user_max_id)
            return {'ok': True}
    except Exception as e:
        logger.error('Ошибка lock_event: {}', repr(e))
        return {'ok': False, 'error': str(e)}
```

- [ ] **Step 2:** В `database/sending.py` добавить `unlock_event`:

```python
async def unlock_event(event_id: str) -> None:
    try:
        async with async_session() as session:
            event = await session.scalar(select(Event).where(Event.id == event_id))
            if event:
                event.locked_by = None
                event.locked_at = None
                await session.commit()
                logger.debug('Unlock event {}', event_id)
    except Exception as e:
        logger.error('Ошибка unlock_event: {}', repr(e))
```

- [ ] **Step 3:** В `database/requests.py` добавить `cleanup_stale_locks`:

```python
async def cleanup_stale_locks() -> int:
    try:
        async with async_session() as session:
            from datetime import timedelta
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            result = await session.execute(
                update(Event).where(Event.locked_at < cutoff, Event.locked_at.isnot(None)).values(locked_by=None, locked_at=None)
            )
            await session.commit()
            count = result.rowcount
            if count:
                logger.info('Очищено {} просроченных lock\'ов', count)
            return count
    except Exception as e:
        logger.error('Ошибка cleanup_stale_locks: {}', repr(e))
        return 0
```

- [ ] **Step 4:** Коммит

---

### Task 2: Routes — lock/unlock endpoints + GET response

**Files:** `app/routes/vks.py`

- [ ] **Step 1:** Добавить импорты:

```python
from database.sending import add_event, update_event, delete_event, add_document, delete_document, lock_event, unlock_event
from database.requests import get_events, get_event_by_id, get_documents_by_event_id, get_documents_by_event_ids, get_user_by_id, cleanup_stale_locks
```

- [ ] **Step 2:** В `get_events_handler` — вызвать `cleanup_stale_locks()` в начале и добавить lock данные в response:

В начале функции (после try):
```python
await cleanup_stale_locks()
```

В цикле building data dict — добавить:
```python
# Resolve lock user
locked_by_name = None
locked_by_id = e.locked_by
if e.locked_by:
    lu = await get_user_by_id(str(e.locked_by)) if e.locked_by else None
    if lu:
        parts = [lu.last_name or '', lu.first_name or '', lu.patronymic or '']
        locked_by_name = ' '.join(p for p in parts if p).strip() or lu.name or str(lu.max_id)
```

В data dict добавить:
```python
'locked_by': locked_by_name,
'locked_by_id': locked_by_id,
'locked_at': e.locked_at.isoformat() if e.locked_at else None,
```

**Примечание:** `get_user_by_id` принимает string UUID, а `locked_by` — это Integer max_id. Нужно найти пользователя по max_id. Проверить существующую функцию `get_user_by_id` — если она ищет по UUID, нужно использовать `get_user(max_id=locked_by)`.

- [ ] **Step 3:** Добавить lock/unlock handlers:

```python
@require_csrf
async def lock_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        user = request.get('user')
        if not user:
            return web.json_response({'ok': False, 'error': 'Не авторизован'}, status=401)
        result = await lock_event(event_id, user.max_id)
        return web.json_response(result)
    except Exception as e:
        logger.error('Ошибка lock: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)

@require_csrf
async def unlock_event_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['id']
        await unlock_event(event_id)
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка unlock: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)
```

- [ ] **Step 4:** Зарегистрировать маршруты в `setup_vks_routes`:

```python
app.router.add_put('/admin/api/events/{id}/lock', lock_event_handler)
app.router.add_put('/admin/api/events/{id}/unlock', unlock_event_handler)
```

- [ ] **Step 5:** Коммит

---

### Task 3: Startup cleanup

**Files:** `app/server.py`

- [ ] **Step 1:** Добавить импорт `cleanup_stale_locks` в server.py

- [ ] **Step 2:** В `periodic_session_cleanup` (или в `on_startup`) добавить вызов `cleanup_stale_locks()`

- [ ] **Step 3:** Коммит

---

### Task 4: Frontend — lock icon + modal lock/unlock

**Files:** `app/static/js/vks-board.js`, `app/static/js/vks-modal.js`, `app/static/css/vks.css`

**vks-board.js — lock icon:**

- [ ] **Step 1:** В `renderVksCard()` добавить lock icon. Найти место после `.vks-card-meta` или в `.vks-card-actions`. Добавить:

```javascript
// Lock indicator
if (e.locked_by && e.locked_by_id !== window.currentUser?.max_id) {
    html += `<div class="vks-card-lock">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        <span>${esc(e.locked_by)}</span>
    </div>`;
}
```

**vks-modal.js — lock on open:**

- [ ] **Step 2:** В `openEditEventModal()`, после проверки `if (!e) return;`, добавить lock:

```javascript
// Try to lock
try {
    const lockRes = await fetch(`/admin/api/events/${id}/lock`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    const lockData = await lockRes.json();
    if (!lockData.ok && lockData.locked_by) {
        showToast(`Редактирует: ${lockData.locked_by}`, 'warning');
        // Продолжаем открытие в read-only (или не открываем — зависит от UX)
    }
} catch (err) {
    // Lock failed — продолжаем без блокировки
}
```

**vks-modal.js — unlock on close:**

- [ ] **Step 3:** В `closeEventModal()`, в начале функции, добавить:

```javascript
if (editingEventId) {
    fetch(`/admin/api/events/${editingEventId}/unlock`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': getCsrfToken() }
    }).catch(() => {});
}
```

**vks.css — lock icon styles:**

- [ ] **Step 4:** Добавить стили:

```css
.vks-card-lock {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    color: var(--warning, #f59e0b);
    padding: 2px 6px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
    margin-top: 4px;
}

.vks-card-lock svg {
    flex-shrink: 0;
}
```

- [ ] **Step 5:** Коммит

---

### Task 5: Деплой + тестирование

- [ ] `git push origin develop && python deploy/deploy.py test`
- [ ] Открыть событие → проверить что `locked_by` записан в БД
- [ ] Открыть то же событие в другом браузере → предупреждение
- [ ] Закрыть модалку → `locked_by` очищается
- [ ] Проверить auto-timeout (можно временно уменьшить до 1 мин для теста)

---

## Зависимости

```
Task 1 (DB layer) → Task 2 (Routes) → Task 3 (Startup)
                                      → Task 4 (Frontend)
                                      → Task 5 (Deploy)
```

Task 1 → Task 2 → Task 3/4 параллельно → Task 5.
