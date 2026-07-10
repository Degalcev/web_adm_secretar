# Timeline UI Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Side panel таймлайна на desktop, удаление документов как отдельное действие, цвета по action.

**Architecture:** Flex-контейнер для two-column layout, новый action type `doc_remove`, CSS dot classes по action.

**Tech Stack:** CSS (flexbox, responsive), Vanilla JS, Python (aiohttp routes).

## Global Constraints

- Язык коммитов: русский
- Логирование: loguru
- Деплой: develop → test
- CSS порядок: responsive.css до vks-modal.css
- Mobile: таймлайн под формой (как сейчас)

---

### Task 1: HTML — обернуть modal-body + timeline в flex-контейнер

**Files:**
- Modify: `app/static/partials/vks-modal.html`

**Steps:**

- [ ] **Step 1:** Прочитать vks-modal.html полностью

- [ ] **Step 2:** Обернуть `.modal-body` и `.event-timeline` в `.vks-modal-body-wrapper`:

Найти блок от `<div class="modal-body">` до закрывающего `</div>` modal-body, ПЛЮС следующий `<div class="event-timeline" ...>`.

Заменить на:
```html
    <!-- Body wrapper: form + timeline side panel -->
    <div class="vks-modal-body-wrapper">
      <div class="modal-body">
        <!-- Скрытые контейнеры для совместимости с JS -->
        <div class="modal-event-actions" id="event-modal-actions" style="display:none"></div>

        <!-- Дата и время -->
        <div class="form-row form-separator">
          ... (весь существующий контент формы без изменений) ...
        </div>
      </div>
      <!-- Timeline side panel (desktop: справа, mobile: под формой) -->
      <div class="event-timeline" id="event-modal-audit" style="display:none"></div>
    </div>
```

**ВАЖНО:** `#event-modal-audit` выносится ИЗ `.modal-body` НА УРОВЕНЬ с `.modal-body` внутри `.vks-modal-body-wrapper`.

- [ ] **Step 3:** Коммит

---

### Task 2: CSS — side panel + dot colors

**Files:**
- Modify: `app/static/css/vks-modal.css`

**Steps:**

- [ ] **Step 1:** Прочитать vks-modal.css полностью

- [ ] **Step 2:** Добавить стили `.vks-modal-body-wrapper` (ПЕРЕД стилями timeline, примерно перед строкой 497):

```css
/* Modal body wrapper — form + timeline side panel */
.vks-modal-body-wrapper {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.vks-modal-body-wrapper .modal-body {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
}

.vks-modal-body-wrapper .event-timeline {
    width: 320px;
    min-width: 280px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    padding: 16px;
    background: var(--bg-elevated);
}
```

- [ ] **Step 3:** Добавить responsive override для mobile (в конец файла, ВНУТРИ существующего `@media (max-width: 768px)`):

```css
.vks-modal-body-wrapper {
    flex-direction: column;
}

.vks-modal-body-wrapper .event-timeline {
    width: 100%;
    min-width: 0;
    border-left: none;
    border-top: 1px solid var(--border);
    max-height: 200px;
}
```

- [ ] **Step 4:** Добавить dot color классы (в секцию timeline styles):

```css
/* Timeline dot colors by action */
.timeline-dot.dot-muted { background: var(--fg-muted); }
.timeline-dot.dot-success { background: var(--success); }
.timeline-dot.dot-warning { background: var(--warning, #f59e0b); }
.timeline-dot.dot-danger { background: var(--danger); }
```

- [ ] **Step 5:** Убрать `padding: 0.75rem 0` у `.event-timeline` (теперь padding задаётся через wrapper)

- [ ] **Step 6:** Коммит

---

### Task 3: JS — dot classes + doc_remove label

**Files:**
- Modify: `app/static/js/vks-modal.js`

**Steps:**

- [ ] **Step 1:** Прочитать vks-modal.js, найти `loadEventHistory`

- [ ] **Step 2:** В объект `actionLabels` добавить `doc_remove`:
```javascript
const actionLabels = {
    'create': 'Создание',
    'update': 'Редактирование',
    'complete': 'Завершение',
    'uncomplete': 'Отмена завершения',
    'delete': 'Удаление',
    'doc_remove': 'Удаление документов',
};
```

- [ ] **Step 3:** В цикле рендеринга, после `const actionLabel = ...`, добавить определение dot class:
```javascript
const dotClass = {
    'create': '',
    'update': ' dot-muted',
    'complete': ' dot-success',
    'uncomplete': ' dot-warning',
    'delete': ' dot-danger',
    'doc_remove': ' dot-danger',
}[entry.action] || '';
```

- [ ] **Step 4:** В HTML выводе `.timeline-dot` подставить класс:
```javascript
html += `<div class="timeline-dot${dotClass}"></div>`;
```

- [ ] **Step 5:** Коммит

---

### Task 4: Backend — doc_remove action

**Files:**
- Modify: `app/routes/vks.py`
- Modify: `app/event_logger.py`

**Steps:**

- [ ] **Step 1:** В `app/event_logger.py`, в функции `log_event_change`, расширить условие:
```python
if action in ('update', 'complete', 'uncomplete', 'doc_remove'):
```

- [ ] **Step 2:** В `app/routes/vks.py`, в `update_event_handler`, после вычисления `action` (после блока complete/uncomplete detection), добавить:
```python
if action == 'update' and doc_changes and doc_changes.get('removed') and not changes:
    action = 'doc_remove'
```

**Логика:** если action был `update`, есть удалённые документы, но НЕТ изменений полей формы — это `doc_remove`. Если есть и то и другое — остаётся `update`.

- [ ] **Step 3:** Коммит

---

### Task 5: Деплой + тестирование

- [ ] **Step 1:** `git push origin develop`
- [ ] **Step 2:** `python deploy/deploy.py test`
- [ ] **Step 3:** Тест: desktop → панель справа, mobile → под формой
- [ ] **Step 4:** Тест: удалить документ → action = doc_remove, красная точка
- [ ] **Step 5:** Тест: завершить → зелёная точка, отменить → оранжевая

---

## Зависимости

```
Task 1 (HTML) ──→ Task 2 (CSS) ──→ Task 3 (JS)
                                       ↑
Task 4 (Backend) ──────────────────────┘
                                       ↓
                                   Task 5 (Deploy)
```

Task 1 и Task 4 независимы — можно выполнять параллельно.
Task 2 зависит от Task 1 (нужна новая HTML структура).
Task 3 зависит от Task 2 (нужны CSS классы dot).
Task 5 зависит от всех.
