# Event History Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полную историю всех изменений мероприятий VKS в виде таймлайна.

**Architecture:** Новая таблица `event_history` (append-only) + модуль `event_logger.py` для сравнения состояний + интеграция в routes vks.py + API endpoint + frontend таймлайн в модалке VKS.

**Tech Stack:** Python 3.x, asyncio, aiohttp, PostgreSQL (asyncpg), SQLAlchemy async, loguru, Vanilla JS/CSS.

## Global Constraints

- Язык описаний и коммитов: русский
- Логирование: всегда `loguru.logger`
- Деплой: `develop` → test
- БД: `test_db` на `localhost:5432`
- DB_USER: `web_secretar`
- Тестовый сайт: `http://45.90.217.225:8082/admin`
- Существующие паттерны: SQLAlchemy ORM (не raw SQL), `async_session()` для подключений
- `get_documents_by_event_id` — используйте `session.execute()` для multi-column select

---

## Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `database/models.py` | Modify | Модель `EventHistory` |
| `database/requests.py` | Modify | Запрос `get_event_history_by_event_id()` |
| `database/sending.py` | Modify | Функция `add_event_history()` |
| `app/event_logger.py` | **Create** | Логика сравнения состояний и записи |
| `app/routes/vks.py` | Modify | Интеграция event_logger в create/update/delete + GET history endpoint |
| `app/server.py` | Modify | Регистрация нового маршрута (если нужен отдельный) |
| `app/static/js/vks-modal.js` | Modify | `loadEventHistory()` + рендеринг таймлайна |
| `app/static/css/vks-modal.css` | Modify | Стили `.event-timeline` |
| `app/static/partials/vks-modal.html` | Modify | Обновить `#event-modal-audit` div |

---

### Task 1: Модель EventHistory + миграция

**Files:**
- Modify: `database/models.py`

**Interfaces:**
- Produces: модель `EventHistory` с полями `id`, `event_id`, `user_id`, `timestamp`, `action`, `changes`

- [ ] **Step 1: Добавить модель EventHistory в models.py**

Открыть `database/models.py`. После модели `Event` (строка ~155) добавить:

```python
class EventHistory(Base):
    __tablename__ = 'event_history'

    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = mapped_column(UUID(as_uuid=True), ForeignKey('events.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    timestamp = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    action = mapped_column(String(50), nullable=False)
    changes = mapped_column(JSON, nullable=True)
```

Импорты `UUID`, `ForeignKey`, `JSON` уже есть в файле (проверить).

- [ ] **Step 2: Создать таблицу через миграцию**

Создать файл `database/migration_event_history.sql`:

```sql
CREATE TABLE IF NOT EXISTS event_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,
    changes JSONB
);

CREATE INDEX IF NOT EXISTS idx_event_history_event_id ON event_history(event_id);
CREATE INDEX IF NOT EXISTS idx_event_history_timestamp ON event_history(timestamp);
```

- [ ] **Step 3: Применить миграцию на test_db**

```bash
psql -U web_secretar -d test_db -f database/migration_event_history.sql
```

Ожидаемый результат: `CREATE TABLE`, `CREATE INDEX` без ошибок.

- [ ] **Step 4: Проверить что модель работает**

```bash
cd E:\Codding\web_adm_secretar
python -c "from database.models import EventHistory; print('OK:', EventHistory.__tablename__)"
```

Ожидаемый результат: `OK: event_history`

- [ ] **Step 5: Коммит**

```bash
git add database/models.py database/migration_event_history.sql
git commit -m "feat: модель EventHistory + миграция таблицы event_history"
```

---

### Task 2: Database layer — запросы и запись

**Files:**
- Modify: `database/requests.py`
- Modify: `database/sending.py`

**Interfaces:**
- Consumes: модель `EventHistory` из Task 1
- Produces: `get_event_history_by_event_id(event_id)` → `list[dict]`, `add_event_history(**kwargs)` → `None`

- [ ] **Step 1: Добавить импорт EventHistory в requests.py**

Открыть `database/requests.py`. В импортах моделей добавить `EventHistory`:

```python
from database.models import Event, Organizer, Location, User, Session, Document, EventHistory
```

- [ ] **Step 2: Добавить функцию get_event_history_by_event_id**

В конец `database/requests.py` добавить:

```python
async def get_event_history_by_event_id(event_id: str) -> list[dict]:
    async with async_session() as session:
        result = await session.execute(
            select(
                EventHistory.id,
                EventHistory.timestamp,
                EventHistory.action,
                EventHistory.changes,
                User.last_name,
                User.first_name,
                User.patronymic,
                User.name,
                User.username,
            )
            .join(User, EventHistory.user_id == User.id, isouter=True)
            .where(EventHistory.event_id == event_id)
            .order_by(EventHistory.timestamp.desc())
        )
        rows = result.all()
        history = []
        for row in rows:
            user_parts = [row.last_name or '', row.first_name or '', row.patronymic or '']
            user_name = ' '.join(p for p in user_parts if p).strip() or row.name or row.username or 'Система'
            history.append({
                'id': str(row.id),
                'user_name': user_name,
                'timestamp': row.timestamp.isoformat() if row.timestamp else None,
                'action': row.action,
                'changes': row.changes,
            })
        return history
```

- [ ] **Step 3: Добавить импорт EventHistory в sending.py**

Открыть `database/sending.py`. В импортах моделей добавить `EventHistory`:

```python
from database.models import Event, Organizer, Location, User, Session, Document, EventHistory
```

- [ ] **Step 4: Добавить функцию add_event_history**

В конец `database/sending.py` добавить:

```python
async def add_event_history(
    event_id: str,
    user_id: str | None,
    action: str,
    changes: dict | None = None
) -> None:
    new_entry = EventHistory(
        event_id=event_id,
        user_id=user_id,
        action=action,
        changes=changes,
    )
    async with async_session() as session:
        session.add(new_entry)
        await session.commit()
```

- [ ] **Step 5: Проверить импорты**

```bash
cd E:\Codding\web_adm_secretar
python -c "from database.requests import get_event_history_by_event_id; print('requests OK')"
python -c "from database.sending import add_event_history; print('sending OK')"
```

- [ ] **Step 6: Коммит**

```bash
git add database/requests.py database/sending.py
git commit -m "feat: database layer — get_event_history_by_event_id + add_event_history"
```

---

### Task 3: Модуль event_logger.py — логика сравнения

**Files:**
- Create: `app/event_logger.py`

**Interfaces:**
- Consumes: `add_event_history()` из Task 2, `get_event_by_id()` из database/requests.py
- Produces: `capture_event_state()`, `log_event_change()`, `get_event_history()`

- [ ] **Step 1: Создать app/event_logger.py**

```python
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
        'time': event.time,
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
    if action in ('update', 'complete', 'uncomplete'):
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
```

- [ ] **Step 2: Проверить что модуль импортируется**

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.event_logger import capture_event_state, log_event_change, get_event_history; print('OK')"
```

- [ ] **Step 3: Коммит**

```bash
git add app/event_logger.py
git commit -m "feat: модуль event_logger — логика сравнения состояний и записи в event_history"
```

---

### Task 4: Интеграция в routes/vks.py — запись при create/update/delete

**Files:**
- Modify: `app/routes/vks.py`

**Interfaces:**
- Consumes: `capture_event_state()`, `log_event_change()` из Task 3
- Produces: записи в event_history при каждом create/update/delete

- [ ] **Step 1: Добавить импорт event_logger**

Открыть `app/routes/vks.py`. В импортах добавить:

```python
from app.event_logger import capture_event_state, log_event_change
```

- [ ] **Step 2: Добавить логирование при создании (POST)**

Найти обработчик создания события (функция `create_event_handler`). После строки с `event_id = await add_event(...)` добавить:

```python
await log_event_change(event_id, str(user.id) if user else None, 'create')
```

- [ ] **Step 3: Добавить логирование при обновлении (PUT)**

Найти обработчик обновления события (функция `update_event_handler`). Перед вызовом `update_event()` добавить:

```python
old_state = await capture_event_state(event_id)
```

После `update_event()` добавить:

```python
new_state = await capture_event_state(event_id)

# Определяем action на основе изменения completed
action = 'update'
if old_state and new_state:
    if 'completed' in (set(new_state.keys()) & set(old_state.keys())):
        if old_state['completed'] != new_state['completed']:
            action = 'complete' if new_state['completed'] else 'uncomplete'

# Собираем изменения документов
doc_changes = None
if removed_doc_ids or new_files:
    added_docs = [{'name': f.filename, 'size': f.file_size} for f in new_files] if new_files else []
    removed_docs = [{'id': did} for did in removed_doc_ids] if removed_doc_ids else []
    doc_changes = {'added': added_docs, 'removed': removed_docs}

await log_event_change(event_id, str(user.id) if user else None, action, old_state, new_state, doc_changes)
```

**Примечание**: нужно проверить имена переменных `removed_doc_ids` и `new_files` в существующем коде — они уже используются для логики keep/delete documents.

- [ ] **Step 4: Добавить логирование при удалении (DELETE)**

Найти обработчик удаления события (функция `delete_event_handler`). Перед вызовом `delete_event()` добавить:

```python
old_state = await capture_event_state(event_id)
await log_event_change(event_id, str(user.id) if user else None, 'delete', old_state)
```

- [ ] **Step 5: Добавить GET endpoint для истории**

В `app/routes/vks.py` добавить новый обработчик:

```python
@routes.get('/api/events/{event_id}/history')
async def get_event_history_handler(request: web.Request) -> web.Response:
    try:
        event_id = request.match_info['event_id']
        history = await get_event_history(event_id)
        return web.json_response({'ok': True, 'history': history})
    except Exception as e:
        logger.error('Ошибка получения истории: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)
```

Импорт `get_event_history` из `app/event_logger.py` уже добавлен в Step 1.

- [ ] **Step 6: Проверить импорты**

Убедиться что все новые импорты работают:

```bash
cd E:\Codding\web_adm_secretar
python -c "from app.routes.vks import routes; print('OK')"
```

- [ ] **Step 7: Коммит**

```bash
git add app/routes/vks.py
git commit -m "feat: интеграция event_logger в vks routes — запись при create/update/delete + GET history"
```

---

### Task 5: Frontend — таймлайн в модалке VKS

**Files:**
- Modify: `app/static/js/vks-modal.js`
- Modify: `app/static/partials/vks-modal.html`
- Modify: `app/static/css/vks-modal.css`

**Interfaces:**
- Consumes: `GET /admin/api/events/<id>/history` из Task 4
- Produces: функция `loadEventHistory()`, CSS стили таймлайна, обновлённый HTML

- [ ] **Step 1: Обновить HTML — показать #event-modal-audit**

Открыть `app/static/partials/vks-modal.html`. Найти скрытый div:

```html
<div class="event-modal-audit" id="event-modal-audit" style="display:none"></div>
```

Заменить на:

```html
<div class="event-timeline" id="event-modal-audit" style="display:none"></div>
```

- [ ] **Step 2: Добавить функцию loadEventHistory в vks-modal.js**

Открыть `app/static/js/vks-modal.js`. В конец файла добавить:

```javascript
async function loadEventHistory(eventId) {
    const container = document.getElementById('event-modal-audit');
    if (!container) return;

    container.innerHTML = '<div class="timeline-loading">Загрузка...</div>';
    container.style.display = 'block';

    try {
        const res = await fetch(`/admin/api/events/${eventId}/history`, {
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        });
        const data = await res.json();

        if (!data.ok || !data.history || data.history.length === 0) {
            container.innerHTML = '<div class="timeline-empty">История изменений пуста</div>';
            return;
        }

        const actionLabels = {
            'create': 'Создание',
            'update': 'Редактирование',
            'complete': 'Завершение',
            'uncomplete': 'Отмена завершения',
            'delete': 'Удаление',
        };

        const fieldLabels = {
            'type': 'Тип',
            'date': 'Дата',
            'time': 'Время',
            'organizer_id': 'Организатор',
            'location_id': 'Локация',
            'url': 'Ссылка',
            'description': 'Описание',
            'completed': 'Статус',
            'notification': 'Уведомление',
            'documents': 'Документы',
        };

        let html = '';
        for (const entry of data.history) {
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const actionLabel = actionLabels[entry.action] || entry.action;

            html += `<div class="timeline-entry">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-user">${esc(entry.user_name)}</div>
                    <div class="timeline-datetime">${dateStr}, ${timeStr}</div>
                    <div class="timeline-action">${actionLabel}</div>`;

            if (entry.changes) {
                html += '<div class="timeline-changes">';
                for (const [field, diff] of Object.entries(entry.changes)) {
                    if (field === 'documents') {
                        if (diff.added) {
                            for (const doc of diff.added) {
                                html += `<div class="timeline-change">+ Документ: ${esc(doc.name)}</div>`;
                            }
                        }
                        if (diff.removed) {
                            for (const doc of diff.removed) {
                                html += `<div class="timeline-change timeline-change-remove">- Документ: ${esc(doc.name || doc.id)}</div>`;
                            }
                        }
                    } else {
                        const label = fieldLabels[field] || field;
                        const oldVal = diff.old !== null && diff.old !== undefined ? String(diff.old) : '(пусто)';
                        const newVal = diff.new !== null && diff.new !== undefined ? String(diff.new) : '(пусто)';
                        html += `<div class="timeline-change">${esc(label)}: ${esc(oldVal)} → ${esc(newVal)}</div>`;
                    }
                }
                html += '</div>';
            }

            html += '</div></div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="timeline-error">Ошибка загрузки истории</div>';
    }
}

function hideEventHistory() {
    const container = document.getElementById('event-modal-audit');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}
```

- [ ] **Step 3: Подключить кнопку info к таймлайну**

В функции `openEditEventModal` в `vks-modal.js` найти блок с `auditBtn` (строки ~105-121). Заменить логику установки title на toggle таймлайна:

```javascript
const auditBtn = document.getElementById('event-modal-audit-btn');
if (e.last_changed_by || e.id) {
    auditBtn.style.display = 'inline-flex';
    auditBtn.onclick = () => {
        const container = document.getElementById('event-modal-audit');
        if (container.style.display === 'block') {
            hideEventHistory();
        } else {
            loadEventHistory(e.id);
        }
    };
} else {
    auditBtn.style.display = 'none';
}
```

- [ ] **Step 4: Скрыть таймлайн при закрытии модалки**

В функции `closeEventModal` в `vks-modal.js` добавить вызов `hideEventHistory()`.

- [ ] **Step 5: Добавить CSS стили таймлайна**

Открыть `app/static/css/vks-modal.css`. В конец файла добавить:

```css
/* Event Timeline */
.event-timeline {
    padding: 0.75rem 0;
}

.timeline-loading,
.timeline-empty,
.timeline-error {
    text-align: center;
    padding: 1rem;
    color: var(--fg-muted);
    font-size: 0.8125rem;
}

.timeline-entry {
    position: relative;
    padding-left: 1.5rem;
    padding-bottom: 1rem;
    margin-bottom: 0.5rem;
}

.timeline-entry:last-child {
    margin-bottom: 0;
}

.timeline-entry::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 8px;
    bottom: 0;
    width: 2px;
    background: var(--border);
}

.timeline-entry:last-child::before {
    display: none;
}

.timeline-dot {
    position: absolute;
    left: 0;
    top: 4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
}

.timeline-content {
    font-size: 0.8125rem;
}

.timeline-user {
    font-weight: 600;
    color: var(--fg);
    margin-bottom: 2px;
}

.timeline-datetime {
    color: var(--fg-muted);
    font-size: 0.75rem;
    margin-bottom: 4px;
}

.timeline-action {
    color: var(--accent);
    font-weight: 500;
    margin-bottom: 4px;
}

.timeline-changes {
    margin-top: 4px;
    padding-left: 0.25rem;
}

.timeline-change {
    color: var(--fg-secondary);
    font-size: 0.75rem;
    line-height: 1.4;
    padding: 1px 0;
}

.timeline-change::before {
    content: '• ';
    color: var(--fg-muted);
}

.timeline-change-remove {
    color: var(--danger);
}
```

- [ ] **Step 6: Проверить что JS и CSS корректно подключены**

Открыть `app/static/index.html` и убедиться что `vks-modal.css` подключён ПОСЛЕ `responsive.css`, а `vks-modal.js` подключён корректно. Порядок уже правильный согласно CLAUDE.md.

- [ ] **Step 7: Коммит**

```bash
git add app/static/js/vks-modal.js app/static/partials/vks-modal.html app/static/css/vks-modal.css
git commit -m "feat: frontend таймлайн истории изменений VKS — loadEventHistory + CSS"
```

---

### Task 6: Деплой на test + тестирование

**Files:**
- Нет изменений в коде

**Interfaces:**
- Все предыдущие задачи должны быть завершены

- [ ] **Step 1: Git push**

```bash
git push origin develop
```

- [ ] **Step 2: Деплой**

```bash
python deploy/deploy.py test
```

- [ ] **Step 3: Ручное тестирование**

Открыть `http://45.90.217.225:8082/admin`:

1. **Создать новое VKS событие** → проверить что в event_history появилась запись `create`
2. **Открыть модалку редактирования** → нажать кнопку «История» → должна появиться запись "Создание"
3. **Изменить тип/дату/время** → сохранить → нажать «История» → должна появиться запись "Редактирование" с diff полей
4. **Добавить документ** → сохранить → проверить что в changes есть `documents.added`
5. **Удалить документ** → сохранить → проверить что в changes есть `documents.removed`
6. **Завершить событие** → проверить action = `complete`
7. **Отменить завершение** → проверить action = `uncomplete`
8. **Удалить событие** → проверить что запись `delete` появилась (проверить через прямой запрос к БД или API)

- [ ] **Step 4: Проверить API history endpoint**

```bash
curl -s http://45.90.217.225:8082/admin/api/events/<event_id>/history | python -m json.tool
```

Ожидаемый результат: JSON с массивом `history`, каждая запись содержит `id`, `user_name`, `timestamp`, `action`, `changes`.

- [ ] **Step 5: Коммит (если были фиксы)**

```bash
git add -A
git commit -m "fix: фиксы после тестирования event history"
```

---

## Зависимости задач

```
Task 1 (Model)
    ↓
Task 2 (Database layer)
    ↓
Task 3 (event_logger)
    ↓
Task 4 (Routes integration)
    ↓
Task 5 (Frontend)
    ↓
Task 6 (Deploy + test)
```

Все задачи последовательные — каждая зависит от предыдущей.
