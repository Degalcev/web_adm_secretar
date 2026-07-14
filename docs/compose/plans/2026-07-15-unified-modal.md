# Объединение модалок VKS и Мероприятия — План реализации

> **For agentic workers:** Use compose:subagent or compose:execute to implement task-by-task.

**Goal:** Объединить две модалки (VKS и Мероприятия) в одну универсальную, доработав модалку VKS.

**Architecture:** Модифицируем `vks-modal.html` + `vks-modal.js`, удаляем `event-modal.html` + `events.js` (модальные функции). Бэкенд не меняется — формат данных тот же.

**Tech Stack:** Vanilla JS/CSS, aiohttp backend (без изменений)

---

## Файлы для изменений

| Файл | Изменения |
|------|-----------|
| `app/static/partials/vks-modal.html` | Добавить: тип, organizer_type toggle, участники, повторять |
| `app/static/js/vks-modal.js` | Расширить: тип, toggle, участники, повторять, условная видимость URL |
| `app/static/js/events.js` | Удалить: модальные функции (evtOpen*, evtSave*, _eventsOpenModal, etc.) |
| `app/static/partials/event-modal.html` | Удалить (не используется) |
| `app/static/css/vks-modal.css` | Добавить стили для тип-бейджа, toggle, участников |

---

## Task 1: HTML —доработка vks-modal.html

**Files:** `app/static/partials/vks-modal.html`

Добавить в модалку VKS следующие элементы (после现有的 полей):

1. **Тип мероприятия** (select) — перед датой/временем:
```html
<div class="form-separator form-group">
  <label>Тип мероприятия</label>
  <select id="f-event-type" class="form-input" onchange="onEventTypeChange()">
    <option value="ВКС">ВКС</option>
    <option value="Совещание">Совещание</option>
    <option value="Встреча">Встреча</option>
    <option value="Заседание">Заседание</option>
    <option value="Приём">Личный приём</option>
  </select>
</div>
```

2. **Organizer type toggle** (org/user) +Organizer select — заменить текущий Organizer:
```html
<div class="form-group">
  <label>Организатор *</label>
  <div class="form-row">
    <div class="form-group" style="flex:0 0 110px">
      <select id="f-event-organizer-type" class="form-input" onchange="onOrganizerTypeChange()">
        <option value="org">Организация</option>
        <option value="user">Сотрудник</option>
      </select>
    </div>
    <div class="form-group" style="flex:1">
      <select id="f-event-organizer" class="form-input" required><option value="">Не указан</option></select>
    </div>
  </div>
</div>
```

3. **Участники** (после описания):
```html
<div class="form-separator form-group">
  <label>Участники</label>
  <div class="event-participants-list" id="event-participants-list"></div>
  <div class="event-participant-add">
    <input type="text" id="event-participant-search" class="form-input" placeholder="Поиск сотрудника...">
    <div class="event-participant-dropdown" id="event-participant-dropdown" style="display:none"></div>
  </div>
</div>
```

4. **Повторять** (pill-button как в events modal):
```html
<div class="form-separator form-group">
  <label>Повторять</label>
  <button type="button" class="pill-btn" id="event-repeat-btn" onclick="evtToggleRepeat()">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
    <span class="pill-label">Повторять</span>
  </button>
  <div class="evt-repeat-options" id="event-repeat-options" style="display:none; margin-top:8px">
    <!-- freq, until, weekday buttons — same as events modal -->
  </div>
  <input type="hidden" id="event-repeat-active" value="false">
</div>
```

5. **URL field** — остаётся как есть, но добавить id `f-event-url` и CSS class для условного скрытия.

- [ ] Коммит

## Task 2: JS — расширение vks-modal.js

**Files:** `app/static/js/vks-modal.js`

Добавить:

1. **State переменные:**
```js
let _modalParticipants = [];
let _modalRepeatActive = false;
let _modalMode = 'vks'; // 'vks' или 'events'
```

2. **onEventTypeChange()** — скрыть/показать URL:
```js
function onEventTypeChange() {
    const type = document.getElementById('f-event-type').value;
    const urlGroup = document.getElementById('f-event-url-group');
    if (urlGroup) urlGroup.style.display = type === 'ВКС' ? '' : 'none';
}
```

3. **onOrganizerTypeChange()** — переключить options в organizer select:
```js
function onOrganizerTypeChange() {
    const orgType = document.getElementById('f-event-organizer-type').value;
    const sel = document.getElementById('f-event-organizer');
    sel.innerHTML = '<option value="">Не указан</option>';
    const list = orgType === 'user' ? (store.allUsers || []) : (store.allOrganizers || []);
    list.forEach(item => {
        const name = orgType === 'user' ? item.name : item.name;
        sel.innerHTML += `<option value="${item.id}">${esc(name)}</option>`;
    });
}
```

4. **Расширить openAddEventModal / openEditEventModal** — принимать параметр `mode`:
```js
function openAddEventModal(mode = 'vks') {
    _modalMode = mode;
    // ...existing code...
    // Установить тип по умолчанию
    document.getElementById('f-event-type').value = mode === 'events' ? 'Совещание' : 'ВКС';
    onEventTypeChange();
    // Заполнить organizer dropdown
    onOrganizerTypeChange();
    // Сбросить участников
    _modalParticipants = [];
    _renderParticipants();
    // Сбросить повтор
    _modalRepeatActive = false;
    // ...
}
```

5. **Расширить saveEvent()** — отправлять тип, organizer_type, participants, repeat:
```js
// В formData добавить:
formData.append('type', document.getElementById('f-event-type').value);
formData.append('organizer_type', document.getElementById('f-event-organizer-type').value);
formData.append('participants', JSON.stringify(_modalParticipants));
```

6. **Расширить загрузку данных при edit** — заполнять новые поля:
```js
// В openEditEventModal, после загрузки данных:
document.getElementById('f-event-type').value = event.type || 'ВКС';
document.getElementById('f-event-organizer-type').value = event.organizer_type || 'org';
onEventTypeChange();
onOrganizerTypeChange();
document.getElementById('f-event-organizer').value = event.organizer_id || '';
// Участники
_modalParticipants = event.participants || [];
_renderParticipants();
```

7. **Участники — поиск и добавление:**
```js
function _renderParticipants() { /* рендер списка */ }
function _searchParticipants(query) { /* fetch /api/participants/search?q= */ }
function _addParticipant(user) { /* добавить в _modalParticipants */ }
function _removeParticipant(idx) { /* удалить из _modalParticipants */ }
```

8. **Повторять — toggle:**
```js
function evtToggleRepeat() { /* показать/скрытие options */ }
```

9. **Переименовать заголовок** по контексту:
```js
// При открытии:
title.textContent = _modalMode === 'events' 
    ? (editingEventId ? 'Редактирование мероприятия' : 'Новое мероприятие')
    : (editingEventId ? 'Редактирование ВКС' : 'Добавить ВКС');
```

- [ ] Коммит

## Task 3: JS — переключение events.js на единую модалку

**Files:** `app/static/js/events.js`

Удалить все модальные функции из events.js:
- `evtOpenAddModal` → вызывает `openAddEventModal('events')`
- `evtOpenEditModal` → вызывает `openEditEventModal(id, 'events')`
- `evtCloseModal` → вызывает `closeEventModal()`
- `evtSaveEvent` → удалён (используется `saveEvent()`)
- `_eventsOpenModal` → удалён
- `_eventsLoadEventData` → удалён
- `_eventsResetForm` → удалён
- `_eventsPopulateDropdowns` → удалён
- `_eventsPopulateOrganizer` → удалён
- `_eventsRenderParticipants` → удалён
- Все функции участников → удалены
- Все функции повтора → удалены

Заменить вызовы в HTML:
- `onclick="evtOpenAddModal()"` → `onclick="openAddEventModal('events')"`
- `onclick="evtOpenEditModal('${e.id}')"` → `onclick="openEditEventModal('${e.id}', 'events')"`

В `events.js` оставить ТОЛЬКО:
- `eventsRenderBoard()` — рендеринг карточек
- `eventsUpdateStats()` — статистика
- `eventsFilterQuick()` — быстрые фильтры
- `_eventsGetTypeClass()` — CSS классы типов
- `_eventsUpdateCardActive()` — active state карточек

- [ ] Коммит

## Task 4: Удаление event-modal.html

**Files:** `app/static/partials/event-modal.html`, `app/static/js/app.js`

1. Удалить `event-modal.html`
2. Удалить из `app.js` загрузку `'/static/partials/event-modal.html'` из массива `_modalsLoaded`
3. Удалить из `index.html` подключение event-modal.html если есть

- [ ] Коммит

## Task 5: CSS — стили для unified modal

**Files:** `app/static/css/vks-modal.css`

Добавить стили для:
- `.event-participants-list` — список участников
- `.event-participant-add` — строка поиска
- `.event-participant-dropdown` — выпадающий список
- `.event-participant-item` — элемент участника
- `.evt-repeat-options` — опции повтора
- `.evt-wd-btn` — кнопки дней недели
- Организатор toggle (flex row)

- [ ] Коммит

## Task 6: Деплой и тестирование

1. Проверить VKS модалку — создание/редактирование VKS
2. Проверить Мероприятия — создание/редактирование
3. Проверить переключение типа — URL скрывается/показывается
4. Проверить organizer toggle
5. Проверить участников
6. Проверить повтор

- [ ] Деплой
- [ ] Коммит
