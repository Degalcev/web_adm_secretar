# Модалки CRUD — Compact Flat дизайн

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать модалки Пользователи, Организаторы, Локации под Compact Flat стиль VKS modal, вынести HTML в partials.

**Architecture:** Каждая модалка выносится в `app/static/partials/*.html`. CSS стили `.vks-modal-flat` уже переопределяют базовые — нужно просто добавить класс к контейнеру модалки. Mobile стили в `modals.css @media` уже покрывают `.vks-modal-flat`.

**Tech Stack:** HTML partials, vanilla JS, CSS (vks-modal-flat overrides)

## Global Constraints
- Все модалки используют класс `.vks-modal-flat` на `div.modal`
- Partial загружается через `app.js` → `document.body.insertAdjacentHTML('beforeend', html)`
- JS функции ждут `_vksModalLoaded` promise (общий для всех partials)
- CSS стили `.vks-modal-flat` в `modals.css` переопределяют базовые стили `.modal-*`
- Mobile стили в `modals.css @media (max-width: 768px)` — только для `.vks-modal-flat`

---

### Task 1: Создать partials и загрузчик

**Files:**
- Create: `app/static/partials/user-modal.html`
- Create: `app/static/partials/organizer-modal.html`
- Create: `app/static/partials/location-modal.html`
- Modify: `app/static/js/app.js` — загрузка 3 partials
- Modify: `app/static/index.html` — удалить 3 модалки

**Steps:**

- [ ] **Step 1: Создать `user-modal.html`**

HTML на основе текущей модалки с классами `.vks-modal-flat`:
```html
<div class="modal-overlay" id="user-modal">
  <div class="modal vks-modal-flat">
    <div class="modal-header">
      <div class="vks-modal-header-left">
        <h3 id="modal-title" class="vks-modal-title">Добавить пользователя</h3>
      </div>
      <div class="modal-header-actions">
        <button class="icon-btn" onclick="closeModal()" title="Закрыть">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="modal-body">
      <!-- Данные пользователя -->
      <div class="form-separator">
        <label style="display:block;font-size:0.625rem;font-weight:600;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Данные пользователя</label>
        <div class="form-row">
          <div class="form-group"><label>Фамилия</label><input type="text" id="f-last-name" placeholder="Иванов"></div>
          <div class="form-group"><label>Имя</label><input type="text" id="f-first-name" placeholder="Иван"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Отчество</label><input type="text" id="f-patronymic" placeholder="Иванович"></div>
          <div class="form-group"><label>Юзернейм</label><input type="text" id="f-username" placeholder="ivanov"></div>
        </div>
        <div class="form-group"><label>Имя (отображение)</label><input type="text" id="f-name" placeholder="Иван Иванов"></div>
        <div class="form-row">
          <div class="form-group"><label>Telegram ID</label><input type="number" id="f-tg-id" placeholder="123456789"></div>
          <div class="form-group"><label>MAX ID</label><input type="number" id="f-max-id" placeholder="987654321"></div>
        </div>
      </div>
      <!-- Безопасность -->
      <div class="form-separator">
        <label style="display:block;font-size:0.625rem;font-weight:600;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Безопасность</label>
        <div class="form-group">
          <label>Пароль <span style="font-weight:400;text-transform:none;letter-spacing:0">(оставьте пустым чтобы не менять)</span></label>
          <input type="password" id="f-password" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select id="f-status"><option value="user">user</option><option value="admin">admin</option></select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" id="modal-save-btn" onclick="saveUser()">Сохранить</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Создать `organizer-modal.html`**

```html
<div class="modal-overlay" id="organizer-modal">
  <div class="modal vks-modal-flat">
    <div class="modal-header">
      <div class="vks-modal-header-left">
        <h3 id="org-modal-title" class="vks-modal-title">Добавить организатора</h3>
      </div>
      <div class="modal-header-actions">
        <button class="icon-btn" onclick="closeOrganizerModal()" title="Закрыть">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="modal-body">
      <div class="form-separator form-group">
        <label>Название</label>
        <input type="text" id="f-org-name-modal" placeholder="Организатор">
      </div>
      <div class="form-separator form-group">
        <label>Короткое имя</label>
        <input type="text" id="f-org-short-name" placeholder="org_short">
      </div>
      <div class="form-separator form-group">
        <label>Базовый URL</label>
        <input type="text" id="f-org-base-url" placeholder="https://example.com">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeOrganizerModal()">Отмена</button>
      <button class="btn btn-primary" id="org-modal-save-btn" onclick="saveOrganizer()">Сохранить</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Создать `location-modal.html`**

```html
<div class="modal-overlay" id="location-modal">
  <div class="modal vks-modal-flat">
    <div class="modal-header">
      <div class="vks-modal-header-left">
        <h3 id="loc-modal-title" class="vks-modal-title">Добавить локацию</h3>
      </div>
      <div class="modal-header-actions">
        <button class="icon-btn" onclick="closeLocationModal()" title="Закрыть">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="modal-body">
      <div class="form-separator form-group">
        <label>Название</label>
        <input type="text" id="f-loc-name-modal" placeholder="Название локации">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeLocationModal()">Отмена</button>
      <button class="btn btn-primary" id="loc-modal-save-btn" onclick="saveLocation()">Сохранить</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Обновить app.js — загрузка всех partials**

Заменить `_loadVKSModal` на `_loadModals`:
```javascript
window._modalsLoaded = new Promise((resolve) => {
    async function _loadModals() {
        try {
            const files = [
                '/static/partials/vks-modal.html',
                '/static/partials/user-modal.html',
                '/static/partials/organizer-modal.html',
                '/static/partials/location-modal.html'
            ];
            for (const url of files) {
                const resp = await fetch(url + '?v=' + (window.__VERSION || ''));
                const html = await resp.text();
                document.body.insertAdjacentHTML('beforeend', html);
            }
            resolve();
        } catch (e) {
            console.error('Failed to load modals:', e);
            resolve();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _loadModals);
    } else {
        _loadModals();
    }
});
```

- [ ] **Step 5: Обновить vks.js — заменить `_vksModalLoaded` на `_modalsLoaded`**

Заменить `window._vksModalLoaded` на `window._modalsLoaded` в `openAddEventModal` и `openEditEventModal`.

- [ ] **Step 6: Добавить guard в JS файлы модалок**

В `users.js` — в `openAddModal()` и `openEditModal()` добавить `if (window._modalsLoaded) await window._modalsLoaded;`
В `organizers.js` — в `openAddOrganizerModal()` и `openEditOrganizerModal()` добавить `if (window._modalsLoaded) await window._modalsLoaded;`
В `locations.js` — в `openAddLocationModal()` и `openEditLocationModal()` добавить `if (window._modalsLoaded) await window._modalsLoaded;`

- [ ] **Step 7: Удалить модалки из index.html**

Удалить 3 блока:
- `<div class="modal-overlay" id="user-modal">` ... `</div>` (строки 686-729)
- `<div class="modal-overlay" id="organizer-modal">` ... `</div>` (строки 731-756)
- `<div class="modal-overlay" id="location-modal">` ... `</div>` (строки 758-781)

Оставить комментарии-заглушки.

- [ ] **Step 8: Commit и деплой**

```bash
git add -A
git commit -m "refactor: модалки Users/Organizers/Locations в partials + vks-modal-flat стиль"
git push origin develop
python deploy/deploy.py test
```

Проверить на test сервере:
- Открыть каждую CRUD страницу
- Нажать "+ Добавить" — модалка должна открыться в Compact Flat стиле
- Нажать строку в таблице — модалка редактирования
- Проверить мобильный вид
