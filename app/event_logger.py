from loguru import logger
from database.requests import get_event_by_id, get_event_history_by_event_id
from database.sending import add_event_history


async def capture_event_state(event_id: str) -> dict | None:
    """Снимок текущего состояния события из БД."""
    event = await get_event_by_id(event_id)
    if not event:
        return None
    return {
        'type': event.type,
        'date': event.date.isoformat() if event.date else None,
        'time': event.time.strftime('%H:%M') if event.time else None,
        'organizer_id': str(event.organizer_id) if event.organizer_id else None,
        'location_id': str(event.location_id) if event.location_id else None,
        'url': event.url or '',
        'description': event.description or '',
        'completed': event.completed,
        'notification': event.notification,
    }


def _compare_states(old_state: dict | None, new_state: dict | None) -> dict | None:
    """Сравнение двух состояний, возвращает dict изменений или None."""
    if not old_state or not new_state:
        return None
    changes = {}
    for key in new_state:
        old_val = old_state.get(key)
        new_val = new_state.get(key)
        if old_val != new_val:
            changes[key] = {'old': old_val, 'new': new_val}
    return changes if changes else None


async def log_event_change(
    event_id: str,
    user_id: str | None,
    action: str,
    old_state: dict | None = None,
    new_state: dict | None = None,
    doc_changes: dict | None = None,
) -> None:
    """Запись изменения в event_history."""
    changes = None
    if action in ('update', 'complete', 'uncomplete', 'doc_remove'):
        changes = _compare_states(old_state, new_state)
        if doc_changes:
            if changes is None:
                changes = {}
            changes['documents'] = doc_changes

    await add_event_history(event_id, user_id, action, changes)
    logger.debug('event_history: event={} user={} action={}', event_id, user_id, action)


async def get_event_history(event_id: str) -> list[dict]:
    """Чтение таймлайна для API."""
    return await get_event_history_by_event_id(event_id)
