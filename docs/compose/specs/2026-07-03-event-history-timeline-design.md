# Спецификация: История изменений мероприятий (таймлайн)

**Дата**: 2026-07-03
**Статус**: черновик
**Автор**: MiMoCode

---

## Контекст

Текущая система аудита VKS хранит только **последнее** изменение (3 поля на Event: `last_changed_by`, `last_changed_at`, `last_change_action`). Каждое обновление перезаписывает предыдущее. Полная история изменений не сохраняется. Кнопка «История изменений» в шапке модалки VKS существует, но не заполняется (только tooltip).

**Цель**: реализовать полную историю всех изменений мероприятий в виде таймлайна.

---

## Требования

1. **Логировать все изменения полей**: тип, дату, время, организатора, локацию, URL, описание, статус завершения, уведомление
2. **Логировать операции с документами**: добавление и удаление файлов
3. **Логировать lifecycle**: создание, редактирование, завершение/отмена завершения, удаление
4. **Отображение**: таймлайн в модалке VKS по кнопке «История»
5. **Формат записи**: пользователь + дата/время + конкретные изменения (старое → новое)
6. **Хранение**: отдельная таблица `event_history` в PostgreSQL

---

## Архитектура

### 1. Таблица `event_history`

```sql
CREATE TABLE event_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,
    changes JSONB
);

CREATE INDEX idx_event_history_event_id ON event_history(event_id);
CREATE INDEX idx_event_history_timestamp ON event_history(timestamp);
```

**Поля `changes` (JSONB)**:
```json
{
  "type": {"old": "ВКС", "new": "Совещание"},
  "date": {"old": "2026-07-05", "new": "2026-07-06"},
  "completed": {"old": false, "new": true},
  "documents": {
    "added": [{"name": "file.pdf", "size": 1024}],
    "removed": [{"name": "old.docx", "size": 2048}]
  }
}
```

**Действия (`action`)**:
| action | Описание |
|--------|----------|
| `create` | Создание события |
| `update` | Редактирование полей |
| `complete` | Завершение (completed=true) |
| `uncomplete` | Отмена завершения (completed=false) |
| `delete` | Удаление события |
| `doc_add` | Добавление документа(ов) |
| `doc_remove` | Удаление документа(ов) |

**Примечание**: `doc_add` и `doc_remove` записываются как часть `update` (в одном changes JSON), но могут быть и отдельными действиями при будущих расширениях.

---

### 2. Модуль `app/event_logger.py`

Ответственность: сравнение состояний и запись в `event_history`.

```python
# Основные функции:

async def capture_event_state(event_id: str) -> dict:
    """Снимок текущего состояния события из БД"""

async def log_event_change(
    event_id: str,
    user: User,
    action: str,
    old_state: dict | None,
    new_state: dict | None,
    doc_changes: dict | None = None
) -> None:
    """Сравнение old_state vs new_state, формирование JSONB changes, запись в event_history"""

async def get_event_history(event_id: str) -> list[dict]:
    """Чтение таймлайна для API"""
```

**Логика сравнения** (`log_event_change`):
- Если `action == 'create'`: changes = None (создание не требует diff)
- Если `action == 'delete'`: changes = None (удаление)
- Если `action == 'update'`/`'complete'`/`'uncomplete'`: сравнение полей old_state vs new_state
- Если есть `doc_changes`: добавить в changes секцию `documents`

**Поля для сравнения**: `type`, `date`, `time`, `organizer_id`, `location_id`, `url`, `description`, `completed`, `notification`

**JOIN с users**: `user_name` получается через JOIN с таблицей `users` при чтении — нет денормализации, данные всегда актуальны.

---

### 3. Интеграция в routes/vks.py

**Создание** (POST `/admin/api/events`):
```python
# После add_event():
await log_event_change(event_id, user, 'create', None, new_state)
```

**Обновление** (PUT `/admin/api/events/<id>`):
```python
old_state = await capture_event_state(event_id)
# ... обновление ...
new_state = await capture_event_state(event_id)
doc_changes = {'added': [...], 'removed': [...]}  # если были изменения
await log_event_change(event_id, user, 'update', old_state, new_state, doc_changes)
# Если completed изменился: action = 'complete'/'uncomplete' вместо 'update'
```

**Удаление** (DELETE `/admin/api/events/<id>`):
```python
await log_event_change(event_id, user, 'delete', old_state, None)
# Потом delete_event()
```

---

### 4. API endpoint

**GET `/admin/api/events/<event_id>/history`**

Ответ:
```json
{
  "ok": true,
  "history": [
    {
      "id": "uuid",
      "user_name": "Иванов Иван Иванович",
      "timestamp": "2026-07-03T14:30:00",
      "action": "update",
      "changes": {
        "type": {"old": "ВКС", "new": "Совещание"},
        "date": {"old": "2026-07-05", "new": "2026-07-06"}
      }
    }
  ]
}
```

`user_name` получается через JOIN с таблицей `users` при запросе истории.

Сортировка: `timestamp DESC` (новые сверху).

---

### 5. Frontend — таймлайн в модалке VKS

**UI компонент**:
- Кнопка «История» (`#event-modal-audit-btn`) — уже существует в шапке модалки
- По клику: загрузка истории через API → отображение таймлайна
- Таймлайн отображается в `#event-modal-audit` div (уже есть в HTML)

**Формат записи таймлайна**:
```
┌─────────────────────────────────┐
│ ● Иванов Иван Иванович         │
│   03.07.2026, 14:30             │
│   Изменения:                    │
│   • Тип: «ВКС» → «Совещание»   │
│   • Дата: 2026-07-05 → 2026-07-06│
│   • Документы: +file.pdf        │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ ● Иванов Иван Иванович         │
│   03.07.2026, 14:00             │
│   Создание события              │
└─────────────────────────────────┘
```

**CSS**: Отдельный блок `.event-timeline` в `vks-modal.css` — вертикальная линия слева, точки-маркеры для каждой записи, блоки с информацией.

**JS**: Новая функция `loadEventHistory(eventId)` в `vks-modal.js`:
- GET `/admin/api/events/<id>/history`
- Рендеринг таймлайна в `#event-modal-audit`
- Показ/скрытие по кнопке info

---

## Изменения в существующих файлах

| Файл | Изменение |
|------|-----------|
| `database/models.py` | Новая модель `EventHistory` |
| `database/sending.py` | Функции `add_event_history()`, `get_event_history()` |
| `database/requests.py` | Запрос `get_event_history_by_event_id()` |
| `app/event_logger.py` | **НОВЫЙ** — модуль логирования изменений |
| `app/routes/vks.py` | Интеграция event_logger в create/update/delete |
| `app/server.py` | Регистрация нового маршрута GET history |
| `app/static/js/vks-modal.js` | Функция `loadEventHistory()` + рендеринг таймлайна |
| `app/static/css/vks-modal.css` | Стили `.event-timeline` |

---

## Миграция данных

- Таблица `event_history` создаётся через SQLAlchemy `create_all()` или миграцию
- Существующие события **не** мигрируются — история начнёт записываться с момента деплоя
- Старые поля аудита (`last_changed_by`, `last_changed_at`, `last_change_action`) **остаются** — они используются в tooltip кнопки info

---

## Тестирование

1. **Создание события** → запись `create` в event_history
2. **Редактирование полей** → запись `update` с diff в changes
3. **Завершение/отмена** → запись `complete`/`uncomplete`
4. **Добавление документов** → `doc_add` в changes
5. **Удаление документов** → `doc_remove` в changes
6. **Удаление события** → запись `delete`
7. **Отображение** → кнопка «История» показывает таймлайн

---

## Ограничения

- История не записывается для событий, созданных до деплоя этой фичи
- Если пользователь удалён (`ON DELETE SET NULL`), в таймлайне будет показано "Система" (или пустое имя)
- JSONB changes не индексируется — поиск по конкретным изменениям не предполагается
