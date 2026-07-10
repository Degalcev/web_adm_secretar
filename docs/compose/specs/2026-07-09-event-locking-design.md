# Спецификация: Блокировка VKS при редактировании

**Дата**: 2026-07-09
**Статус**: черновик

---

## Цель

При открытии VKS события на редактирование — блокировать его для других пользователей. На карточке отображается замок с именем того, кто редактирует.

---

## Механика

1. **Lock при открытии**: `openEditEventModal()` → PUT `/admin/api/events/{id}/lock` → `locked_by = user.max_id`, `locked_at = now()`
2. **Unlock при закрытии**: `closeEventModal()` → PUT `/admin/api/events/{id}/unlock` → очистка `locked_by`, `locked_at`
3. **Auto-timeout 10 минут**: при чтении событий — если `locked_at` старше 10 минут, очищать lock
4. **Проверка при открытии**: если событие заблокировано другим пользователем — показать предупреждение, запретить редактирование
5. **SSE**: lock/unlock обновляет events → триггер → SSE → все клиенты видят замок

---

## API

### PUT `/admin/api/events/{id}/lock`
```json
// Response OK
{"ok": true}
// Response locked (другой пользователь)
{"ok": false, "locked_by": "Иванов И.И.", "locked_at": "2026-07-09T10:30:00"}
```

### PUT `/admin/api/events/{id}/unlock`
```json
{"ok": true}
```

### GET `/admin/api/events` — добавить в response:
```json
{
  ...existing fields...,
  "locked_by": "Иванов И.И.",
  "locked_by_id": 120880697,
  "locked_at": "2026-07-09T10:30:00"
}
```

---

## Backend (database)

### sending.py
```python
async def lock_event(event_id: str, user_max_id: int) -> dict:
    """Блокировка события. Возвращает {'ok': True} или {'ok': False, 'locked_by': name}"""

async def unlock_event(event_id: str) -> None:
    """Разблокировка события"""
```

### requests.py
```python
async def cleanup_stale_locks() -> int:
    """Очистка lock'ов старше 10 минут. Возвращает количество очищенных."""
```

---

## Backend (routes)

### vks.py — lock/unlock handlers
```python
@require_csrf
async def lock_event_handler(request):
    event_id = request.match_info['id']
    user = request.get('user')
    result = await lock_event(event_id, user.max_id)
    return web.json_response(result)

@require_csrf
async def unlock_event_handler(request):
    event_id = request.match_info['id']
    await unlock_event(event_id)
    return web.json_response({'ok': True})
```

### vks.py — get_events_handler
Добавить в response:
```python
'locked_by': locked_user_name,  # resolved name or None
'locked_by_id': e.locked_by,    # max_id for comparison
'locked_at': e.locked_at.isoformat() if e.locked_at else None,
```

### server.py — startup cleanup
Вызывать `cleanup_stale_locks()` при старте (как `cleanup_expired_sessions`).

---

## Frontend

### vks-board.js — lock icon на карточке
В `renderVksCard()` добавить:
```javascript
if (e.locked_by && e.locked_by_id !== currentUser.max_id) {
    html += `<div class="vks-card-lock">
        <svg lock icon> ${esc(e.locked_by)}
    </div>`;
}
```

### vks-modal.js — lock при открытии
```javascript
async function openEditEventModal(id) {
    // ...existing code...
    // Попытка заблокировать
    const lockRes = await fetch(`/admin/api/events/${id}/lock`, { method: 'PUT', ... });
    const lockData = await lockRes.json();
    if (!lockData.ok) {
        showToast(`Редактирует: ${lockData.locked_by}`, 'warning');
        // Показать модалку в read-only режиме
    }
    // ...show modal...
}
```

### vks-modal.js — unlock при закрытии
```javascript
function closeEventModal() {
    if (editingEventId) {
        fetch(`/admin/api/events/${editingEventId}/unlock`, { method: 'PUT', ... });
    }
    // ...existing code...
}
```

### vks-modal.css — стили замка
```css
.vks-card-lock {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    color: var(--warning);
    padding: 2px 6px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
}
```

---

## Изменения в файлах

| Файл | Изменение |
|------|-----------|
| `database/sending.py` | `lock_event()`, `unlock_event()` |
| `database/requests.py` | `cleanup_stale_locks()`, resolve lock user name |
| `app/routes/vks.py` | lock/unlock handlers + GET response |
| `app/server.py` | startup cleanup |
| `app/static/js/vks-board.js` | lock icon на карточке |
| `app/static/js/vks-modal.js` | lock/unlock при open/close |
| `app/static/css/vks.css` | стили `.vks-card-lock` |

---

## Тестирование

1. Пользователь A открывает событие → на карточке появляется замок
2. Пользователь B видит замок → при клике — предупреждение
3. Пользователь A закрывает модалку → замок исчезает
4. Auto-timeout: после 10 минут — lock снимается
5. SSE: замок обновляется в реальном времени
