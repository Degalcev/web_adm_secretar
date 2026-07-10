# Спецификация: UI улучшения таймлайна истории изменений

**Дата**: 2026-07-09
**Статус**: черновик

---

## Изменения

### 1. Side panel на desktop (≥768px)

Таймлайн истории изменений открывается **справа** от формы, в виде панели той же высоты что и модалка. На mobile (<768px) — под формой (как сейчас).

**Layout:**
- Обернуть `.modal-body` и `.event-timeline` в новый flex-контейнер `.vks-modal-body-wrapper`
- На desktop: `display: flex`, `flex: 1`, `overflow: hidden`
- `.modal-body` (форма): `flex: 1`, `overflow-y: auto`
- `.event-timeline` (панель): `width: 320px`, `min-width: 280px`, `overflow-y: auto`, `border-left: 1px solid var(--border)`, `padding: 16px`
- На mobile (<768px): wrapper `flex-direction: column`, timeline под формой

**HTML changes (vks-modal.html):**
```html
<div class="vks-modal-body-wrapper">
  <div class="modal-body">
    <!-- form fields... -->
  </div>
  <div class="event-timeline" id="event-modal-audit" style="display:none"></div>
</div>
```

Timeline выносится ИЗ `.modal-body` В `.vks-modal-body-wrapper` (на одном уровне с modal-body).

**JS changes:**
- `loadEventHistory()`: показывает панель через `container.style.display = ''` (убирает inline none)
- `hideEventHistory()`: скрывает панель через `container.style.display = 'none'`

### 2. Удаление документов — отдельное действие

Сейчас: doc removal — часть `update` action.
Изменение: при наличии doc removal БЕЗ изменений полей формы — логировать как `doc_remove`. Если есть и поля и документы — оставлять `update`.

**Backend (app/routes/vks.py):**
В `update_event_handler`, после вычисления `action`:
```python
if action == 'update' and doc_changes and doc_changes.get('removed') and not changes:
    action = 'doc_remove'
```

**Backend (app/event_logger.py):**
Добавить `'doc_remove'` в список действий, которые записывают changes:
```python
if action in ('update', 'complete', 'uncomplete', 'doc_remove'):
```

**Frontend (vks-modal.js):**
Добавить label для `doc_remove`:
```javascript
'doc_remove': 'Удаление документов',
```

### 3. Цвета таймлайна по action

Каждое действие в таймлайне получает свой цвет точки:

| action | Цвет | CSS класс |
|--------|------|-----------|
| create | accent (синий) | `.timeline-dot` (по умолчанию) |
| update | muted (серый) | `.timeline-dot.dot-muted` |
| complete | green | `.timeline-dot.dot-success` |
| uncomplete | orange | `.timeline-dot.dot-warning` |
| delete | red (danger) | `.timeline-dot.dot-danger` |
| doc_remove | red (danger) | `.timeline-dot.dot-danger` |

**CSS (vks-modal.css):**
```css
.dot-muted { background: var(--fg-muted); }
.dot-success { background: var(--success); }
.dot-warning { background: var(--warning); }
.dot-danger { background: var(--danger); }
```

**JS (vks-modal.js):**
В `loadEventHistory()`, при рендеринге dot:
```javascript
const dotClass = {
    'create': '',
    'update': ' dot-muted',
    'complete': ' dot-success',
    'uncomplete': ' dot-warning',
    'delete': ' dot-danger',
    'doc_remove': ' dot-danger',
}[entry.action] || '';
html += `<div class="timeline-dot${dotClass}"></div>`;
```

---

## Изменения в файлах

| Файл | Изменение |
|------|-----------|
| `app/static/partials/vks-modal.html` | Обернуть modal-body + timeline в `.vks-modal-body-wrapper` |
| `app/static/css/vks-modal.css` | Стили `.vks-modal-body-wrapper`, `.dot-*`, responsive overrides |
| `app/static/js/vks-modal.js` | dot CSS классы, label для doc_remove |
| `app/routes/vks.py` | Определение `doc_remove` action |
| `app/event_logger.py` | Добавить `doc_remove` в список actions |

---

## Тестирование

1. Desktop: открыть VKS → нажать «История» → панель справа, скролл независимый
2. Mobile: то же самое → таймлайн под формой
3. Удалить документ → сохранить → проверить что action = `doc_remove`
4. Завершить событие → проверить зелёную точку
5. Удалить событие → проверить красную точку
