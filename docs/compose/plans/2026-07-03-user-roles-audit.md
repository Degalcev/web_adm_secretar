# User Roles & Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить роли пользователей (admin/user), ФИО, аудит изменений VKS и скрытие Администрирования для non-admin.

**Architecture:** Миграция БД → Backend auth + audit → Frontend role-based UI.

**Tech Stack:** SQLAlchemy async, aiohttp, argon2, vanilla JS

## Global Constraints

- Язык: русский для коммитов
- Логирование: loguru
- Деплой: `develop` → test
- Тестовая среда: `test_db`, VPS `45.90.217.225:8082`

---

### Task 1: Миграция БД — новые поля

**Covers:** [S2, S5]

**Files:**
- Modify: `database/models.py`
- Create: `database/migration_roles_audit.sql`

**Interfaces:**
- Consumes: текущая модель User и Event
- Produces: новые поля в БД

- [ ] **Step 1: Добавить новые поля в модель User**

В `database/models.py`, в класс `User`, после поля `name`:

```python
first_name  = mapped_column(String(), nullable=True)
last_name   = mapped_column(String(), nullable=True)
patronymic  = mapped_column(String(), nullable=True)
username    = mapped_column(String(), nullable=True)
```

- [ ] **Step 2: Добавить audit-поля в модель Event**

В `database/models.py`, в класс `Event`, после `locked_at`:

```python
last_changed_by    = mapped_column(String(), nullable=True)
last_changed_at    = mapped_column(DateTime(), nullable=True)
last_change_action = mapped_column(String(), nullable=True)
```

- [ ] **Step 3: Создать SQL-миграцию**

Создать `database/migration_roles_audit.sql`:

```sql
-- User: новые поля
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS patronymic VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR;

-- Event: audit-поля
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_changed_by VARCHAR;
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_change_action VARCHAR;
```

- [ ] **Step 4: Применить миграцию на test_db**

```bash
psql -h localhost -U bot_secretar -d test_db -f database/migration_roles_audit.sql
```

Expected: OK без ошибок

- [ ] **Step 5: Commit**

```bash
git add database/models.py database/migration_roles_audit.sql
git commit -m "feat: новые поля User (ФИО, username) + Event (audit)"
```

---

### Task 2: Backend — auth_required декоратор + роли

**Covers:** [S3]

**Files:**
- Modify: `app/auth.py`
- Modify: `app/routes/users.py`
- Modify: `app/server.py`

**Interfaces:**
- Consumes: User.status из БД
- Produces: `auth_required` декоратор, маршрут `/admin/api/users/me`

- [ ] **Step 1: Добавить auth_required декоратор**

В `app/auth.py`, после `admin_required`:

```python
def auth_required(handler):
    @wraps(handler)
    async def wrapper(request: web.Request):
        token = request.cookies.get('admin_token')
        user = await validate_session(token)
        if not user or user.status not in ('admin', 'user'):
            return web.json_response({'error': 'Доступ запрещён'}, status=401)
        request['user'] = user
        return await handler(request)
    return wrapper
```

- [ ] **Step 2: Изменить admin_login — разрешить вход всем ролям**

В `app/auth.py`, в `admin_login`, заменить:

```python
# БЫЛО:
if not user or user.status != 'admin':
    logger.warning('Попытка входа не-администратора с max_id: {}', max_id)
    return web.json_response({'ok': False, 'error': 'Доступ только для администраторов'}, status=403)

# СТАЛО:
if not user:
    logger.warning('Пользователь не найден: {}', max_id)
    return web.json_response({'ok': False, 'error': 'Пользователь не найден'}, status=404)
```

Также заменить сообщение в логе:

```python
# БЫЛО:
logger.info('Администратор {} вошёл в панель', max_id)

# СТАЛО:
logger.info('Пользователь {} (role={}) вошёл в панель', max_id, user.status)
```

- [ ] **Step 3: Добавить маршрут /admin/api/users/me**

В `app/routes/users.py`:

```python
from app.auth import auth_required

@auth_required
async def get_current_user(request: web.Request) -> web.Response:
    try:
        user = request['user']
        return web.json_response({
            'id': user.id,
            'first_name': user.first_name or '',
            'last_name': user.last_name or '',
            'patronymic': user.patronymic or '',
            'username': user.username or '',
            'name': user.name or '',
            'max_id': user.max_id,
            'status': user.status or 'user',
        })
    except Exception as e:
        logger.error('Ошибка получения текущего пользователя: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)
```

В `setup_users_routes` добавить:

```python
app.router.add_get('/admin/api/users/me', get_current_user)
```

- [ ] **Step 4: Обновить get_users — добавить новые поля**

В `app/routes/users.py`, в `get_users`:

```python
data = [
    {
        'id': u.id,
        'first_name': u.first_name or '',
        'last_name': u.last_name or '',
        'patronymic': u.patronymic or '',
        'username': u.username or '',
        'name': u.name or '',
        'tg_id': u.tg_id,
        'max_id': u.max_id,
        'status': u.status or 'user',
    }
    for u in users
]
```

- [ ] **Step 5: Обновить create_user — принимать новые поля**

В `app/routes/users.py`, в `create_user`:

```python
update_data = {
    'first_name': data.get('first_name', ''),
    'last_name': data.get('last_name', ''),
    'patronymic': data.get('patronymic', ''),
    'username': data.get('username', ''),
    'name': data.get('name', ''),
    'tg_id': int(tg_id) if tg_id else None,
    'max_id': int(max_id) if max_id else None,
    'status': data.get('status', 'user'),
}
```

- [ ] **Step 6: Обновить update_user_handler — принимать новые поля**

В `app/routes/users.py`, в `update_user_handler`:

```python
update_data = {
    'first_name': data.get('first_name'),
    'last_name': data.get('last_name'),
    'patronymic': data.get('patronymic'),
    'username': data.get('username'),
    'name': data.get('name'),
    'tg_id': int(tg_id) if tg_id else None,
    'max_id': int(max_id) if max_id else None,
    'status': data.get('status'),
}
```

- [ ] **Step 7: Commit**

```bash
git add app/auth.py app/routes/users.py
git commit -m "feat: auth_required, роли admin/user, маршрут /me, новые поля User"
```

---

### Task 3: Backend — аудит изменений VKS

**Covers:** [S5]

**Files:**
- Modify: `app/routes/vks.py`

**Interfaces:**
- Consumes: `request['user']` из auth_required
- Produces: audit-поля заполняются при create/update/complete/delete

- [ ] **Step 1: Импортировать auth_required**

В `app/routes/vks.py`, в начале файла:

```python
from app.auth import auth_required
```

- [ ] **Step 2: Добавить audit в create_event_handler**

Найти функцию `create_event_handler` и добавить в данные события:

```python
user = request.get('user')
audit_data = {}
if user:
    audit_data = {
        'last_changed_by': user.id,
        'last_changed_at': datetime.utcnow(),
        'last_change_action': 'create',
    }
```

Передать `audit_data` в `add_event(**event_data, **audit_data)`.

- [ ] **Step 3: Добавить audit в update_event_handler**

Аналогично в `update_event_handler`:

```python
user = request.get('user')
if user:
    event_data['last_changed_by'] = user.id
    event_data['last_changed_at'] = datetime.utcnow()
    event_data['last_change_action'] = 'update'
```

- [ ] **Step 4: Добавить audit в toggle_complete**

В обработчике завершения события:

```python
user = request.get('user')
if user:
    update_data['last_changed_by'] = user.id
    update_data['last_changed_at'] = datetime.utcnow()
    update_data['last_change_action'] = 'complete'
```

- [ ] **Step 5: Добавить audit в delete_event_handler**

В `delete_event_handler`, перед удалением:

```python
user = request.get('user')
if user:
    # Сохраняем audit перед удалением (для логов)
    logger.info('Event {} deleted by user {} ({})', event_id, user.id, user.max_id)
```

- [ ] **Step 6: Добавить get_user_by_id импорт**

В `app/routes/vks.py` убедиться что `get_user_by_id` импортирован (если нужен для resolve.changed_by name).

- [ ] **Step 7: Commit**

```bash
git add app/routes/vks.py
git commit -m "feat: аудит изменений VKS — who/when/what"
```

---

### Task 4: Backend — разграничение прав маршрутов

**Covers:** [S4]

**Files:**
- Modify: `app/server.py`
- Modify: `app/routes/vks.py`
- Modify: `app/routes/documents.py`

**Interfaces:**
- Consumes: `admin_required`, `auth_required` из app/auth.py
- Produces: VKS/document маршруты доступны всем авторизованным, admin-only защищены

- [ ] **Step 1: В server.py — VKS/document маршруты на auth_required**

В `app/server.py`, найти подключение VKS маршрутов и заменить `@admin_required` на `@auth_required` в:
- `get_events_handler`
- `create_event_handler`
- `update_event_handler`
- `toggle_complete`
- `delete_event_handler`
- Document маршруты (upload, download, delete)

- [ ] **Step 2: Оставить admin_required для admin-маршрутов**

Убедиться что `@admin_required` остаётся на:
- `/admin/api/users` (CRUD)
- `/admin/api/organizers` (CRUD)
- `/admin/api/locations` (CRUD)
- `/admin/api/logs`

- [ ] **Step 3: Commit**

```bash
git add app/server.py app/routes/vks.py app/routes/documents.py
git commit -m "fix: VKS/document маршруты на auth_required, admin-only защищены"
```

---

### Task 5: Frontend — скрытие Администрирования

**Covers:** [S4]

**Files:**
- Modify: `app/static/js/auth.js`
- Modify: `app/static/js/navigation.js`

**Interfaces:**
- Consumes: `/admin/api/users/me` из Task 2
- Produces: скрытие nav-group для non-admin

- [ ] **Step 1: Сохранить роль пользователя при входе**

В `app/static/js/auth.js`, в `checkAuth`, после успешной проверки:

```javascript
async function checkAuth() {
    // ... существующий код ...
    const resp = await fetch(`${BASE_URL}/admin/api/users`);
    if (resp.status === 200) {
        isAuthenticated = true;
        // Получить роль текущего пользователя
        const meResp = await fetch(`${BASE_URL}/admin/api/users/me`);
        if (meResp.ok) {
            const me = await meResp.json();
            window.currentUserRole = me.status || 'user';
        } else {
            window.currentUserRole = 'admin'; // fallback
        }
        // ... навигация ...
    }
}
```

- [ ] **Step 2: Скрыть Администрирование для non-admin**

В `app/static/js/navigation.js`, добавить функцию:

```javascript
function applyRoleRestrictions() {
    if (window.currentUserRole !== 'admin') {
        // Скрыть nav-group "Администрирование"
        document.querySelectorAll('.nav-group').forEach(group => {
            const header = group.querySelector('.nav-group-header');
            if (header && header.textContent.includes('Администрирование')) {
                group.style.display = 'none';
            }
        });
        // Скрыть nav-group "Настройки" если не admin
        document.querySelectorAll('.nav-group').forEach(group => {
            const header = group.querySelector('.nav-group-header');
            if (header && header.textContent.includes('Настройки')) {
                group.style.display = 'none';
            }
        });
    }
}
```

Вызвать `applyRoleRestrictions()` после `switchPage()` в `checkAuth`.

- [ ] **Step 3: Commit**

```bash
git add app/static/js/auth.js app/static/js/navigation.js
git commit -m "feat: скрытие Администрирования для non-admin"
```

---

### Task 6: Frontend — аудит в модалке VKS

**Covers:** [S6]

**Files:**
- Modify: `app/static/js/vks.js`
- Modify: `app/static/css/vks.css`

**Interfaces:**
- Consumes: `last_changed_by`, `last_changed_at`, `last_change_action` из API
- Produces: строка аудита в модалке VKS

- [ ] **Step 1: Добавить audit-строку в модалку VKS**

В `app/static/js/vks.js`, в функции открытия модалки (после загрузки данных события), найти контейнер и добавить:

```javascript
// Показать информацию об последнем изменении
const auditEl = document.getElementById('event-modal-audit');
if (auditEl && event.last_changed_by) {
    const userName = event.last_changed_user || 'Неизвестно';
    const action = event.last_change_action || '';
    const date = event.last_changed_at ? new Date(event.last_changed_at).toLocaleString('ru-RU') : '';
    const actionText = {
        'create': 'создал',
        'update': 'изменил',
        'complete': 'завершил',
        'delete': 'удалил'
    }[action] || action;
    auditEl.textContent = `Последнее изменение: ${userName}, ${date} — ${actionText}`;
    auditEl.style.display = 'block';
} else if (auditEl) {
    auditEl.style.display = 'none';
}
```

- [ ] **Step 2: Добавить элемент audit в HTML модалки**

В `app/static/index.html`, в модалке `event-modal`, после `modal-event-actions`:

```html
<div class="event-modal-audit" id="event-modal-audit" style="display:none"></div>
```

- [ ] **Step 3: Добавить стили для audit-строки**

В `app/static/css/vks.css`:

```css
.event-modal-audit {
  font-size: 0.6875rem;
  color: var(--fg-muted);
  padding: 0.25rem 0.5rem;
  background: var(--surface);
  border-radius: var(--radius-sm);
  margin-bottom: 0.5rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/static/js/vks.js app/static/index.html app/static/css/vks.css
git commit -m "feat: отображение аудита в модалке VKS"
```

---

### Task 7: Frontend — новые поля пользователя

**Covers:** [S2]

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/js/users.js`

**Interfaces:**
- Consumes: API `/admin/api/users` с новыми полями
- Produces: форма создания/редактирования с ФИО

- [ ] **Step 1: Обновить модалку пользователя в HTML**

В `app/static/index.html`, в модалке `user-modal`, добавить поля:

```html
<div class="form-row">
  <div class="form-group flex-1">
    <label>Фамилия</label>
    <input type="text" id="f-user-last-name" placeholder="Иванов">
  </div>
  <div class="form-group flex-1">
    <label>Имя</label>
    <input type="text" id="f-user-first-name" placeholder="Иван">
  </div>
</div>
<div class="form-row">
  <div class="form-group flex-1">
    <label>Отчество</label>
    <input type="text" id="f-user-patronymic" placeholder="Иванович">
  </div>
  <div class="form-group flex-1">
    <label>Юзернейм</label>
    <input type="text" id="f-user-username" placeholder="ivanov">
  </div>
</div>
```

- [ ] **Step 2: Обновить users.js — отправка новых полей**

В `app/static/js/users.js`, в `saveUser`, добавить:

```javascript
const userData = {
    first_name: document.getElementById('f-user-first-name').value,
    last_name: document.getElementById('f-user-last-name').value,
    patronymic: document.getElementById('f-user-patronymic').value,
    username: document.getElementById('f-user-username').value,
    // ... остальные поля ...
};
```

- [ ] **Step 3: Обновить users.js — заполнение полей при редактировании**

В `app/static/js/users.js`, при открытии модалки для редактирования:

```javascript
document.getElementById('f-user-first-name').value = user.first_name || '';
document.getElementById('f-user-last-name').value = user.last_name || '';
document.getElementById('f-user-patronymic').value = user.patronymic || '';
document.getElementById('f-user-username').value = user.username || '';
```

- [ ] **Step 4: Commit**

```bash
git add app/static/index.html app/static/js/users.js
git commit -m "feat: новые поля ФИО и username в форме пользователя"
```

---

### Task 8: Финальная сборка и деплой

**Covers:** Все секции

- [ ] **Step 1: Проверить все изменения**

Убедиться что все файлы закоммичены, миграция применена.

- [ ] **Step 2: Деплой на test**

```bash
python deploy/deploy.py test
```

Expected: Деплой успешен, сайт доступен на http://45.90.217.225:8082/admin

- [ ] **Step 3: Верификация**

- Войти как admin — видно всё
- Создать пользователя с ролью user — войти под ним
- Убедиться что "Администрирование" скрыто
- Создать/отредактировать VKS — проверить audit в модалке
