# Модальное окно мероприятия — рефакторинг UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переместить кнопку удаления и чекбокс «Завершено» из modal-footer в modal-body, добавить индикатор статуса.

**Architecture:** Изменяем HTML-структуру модалки, добавляем CSS-классы для нового расположения. JS не меняется — только стилизация.

**Tech Stack:** HTML, CSS (Vanilla)

## Global Constraints

- Python backend, Vanilla JS frontend
- Не трогаем логику — только UI

## Текущая структура (до)

```
modal-footer:
  [удалить] [завершено чекбокс] [отмена] [сохранить]
```

## Целевая структура (после)

```
modal-body (внизу):
  [статус:● В работе] -------- [☑ Завершить] [🗑 удалить]

modal-footer:
  [отмена] [сохранить]
```

---

### Task 1: HTML — новая структура modal-body

**Files:**
- Modify: `app/static/index.html:734-820`

**Цель:** Добавить в конец modal-body панель с индикатором статуса, чекбоксом и кнопкой удаления. Убрать их из modal-footer.

- [ ] **Step 1: Добавить панель действий в конец modal-body**

Заменить закрывающий `</div>` секции документов (строка 806) и `</div>` modal-body (строка 807):

```html
      <!-- Документы -->
      <div class="modal-section" id="f-event-docs-group" style="display:none">
        ... (без изменений)
      </div>

      <!-- ─── Панель действий (только при редактировании) ─── -->
      <div class="modal-event-actions" id="event-modal-actions" style="display:none">
        <div class="modal-event-status" id="event-modal-status"></div>
        <div class="modal-event-buttons">
          <label class="modal-check-label" id="event-modal-completed-group">
            <input type="checkbox" id="f-event-completed">
            <span class="modal-check-mark"></span>
            Завершить
          </label>
          <button class="btn-icon danger" id="event-modal-delete-btn" onclick="confirmDeleteFromModal()" title="Удалить событие">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeEventModal()">Отмена</button>
      <button class="btn btn-primary" id="event-modal-save-btn" onclick="saveEvent()">Сохранить</button>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add app/static/index.html
git commit -m "refactor(event-modal): move delete/completed to modal-body, add status indicator"
```

---

### Task 2: CSS — стили панели действий модалки

**Files:**
- Modify: `app/static/css/vks.css` (добавить в конец файла)

**Цель:** Стилизовать панель с индикатором статуса, чекбоксом и кнопкой удаления.

- [ ] **Step 1: Добавить CSS-классы**

```css
/* ─── Modal Event Actions Panel ─────────────────────────────── */
.modal-event-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.modal-event-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.modal-event-status.status-active {
  color: var(--warning);
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.modal-event-status.status-completed {
  color: var(--success);
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.25);
}

.modal-event-status.status-missed {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.modal-event-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.modal-event-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Зелёный ховер для чекбокса завершения */
.modal-event-buttons .modal-check-label:hover {
  background: rgba(74, 222, 128, 0.08);
  color: var(--success);
}

.modal-event-buttons .modal-check-label:hover .modal-check-mark {
  border-color: var(--success);
}

/* Кнопка удаления в панели */
.modal-event-buttons .btn-icon.danger {
  color: var(--fg-muted);
}

.modal-event-buttons .btn-icon.danger:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.3);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/vks.css
git commit -m "style(event-modal): add actions panel with status indicator and green checkbox hover"
```

---

### Task 3: JS — обновить логику отображения панели действий

**Files:**
- Modify: `app/static/js/vks.js` — функции `openAddEventModal` и `openEditEventModal`

**Цель:** Показывать панель действий только при редактировании, прятать при добавлении. Заполнять индикатор статуса.

- [ ] **Step 1: Обновить openAddEventModal**

Добавить скрытие панели действий:

```javascript
async function openAddEventModal() {
    editingEventId = null;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Добавить ВКС';
    document.getElementById('event-modal-actions').style.display = 'none';
    // ... остальной код без изменений
```

- [ ] **Step 2: Обновить openEditEventModal**

Добавить показ панели действий и заполнение статуса:

```javascript
async function openEditEventModal(id) {
    const e = allEvents.find(x => x.id === id);
    if (!e) return;
    editingEventId = id;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Редактировать ВКС';

    // Показать панель действий
    const actionsPanel = document.getElementById('event-modal-actions');
    actionsPanel.style.display = 'flex';

    // Заполнить индикатор статуса
    const statusEl = document.getElementById('event-modal-status');
    const today = _getLocalDateStr(new Date());
    if (e.completed) {
        statusEl.className = 'modal-event-status status-completed';
        statusEl.innerHTML = '<span class="status-dot"></span>Завершено';
    } else if (!e.date || e.date < today) {
        statusEl.className = 'modal-event-status status-missed';
        statusEl.innerHTML = '<span class="status-dot"></span>Пропущено';
    } else {
        statusEl.className = 'modal-event-status status-active';
        statusEl.innerHTML = '<span class="status-dot"></span>В работе';
    }

    document.getElementById('event-modal-completed-group').style.display = 'inline-flex';
    document.getElementById('f-event-completed').checked = e.completed;
    // ... остальной код без изменений
```

- [ ] **Step 3: Commit**

```bash
git add app/static/js/vks.js
git commit -m "feat(event-modal): show status indicator and actions panel on edit"
```

---

## Verification

- [ ] Открыть модалку добавления ВКС → панель действий скрыта
- [ ] Открыть модалку редактирования → панель действий видна
- [ ] Статус отображается: В работе (жёлтый) / Пропущено (красный) / Завершено (зелёный)
- [ ] Чекбокс «Завершено» при наведении — зелёный фон
- [ ] Кнопка удаления — правая сторона панели
- [ ] Кнопки «Отмена» и «Сохранить» в footer (без удаления и чекбокса)
