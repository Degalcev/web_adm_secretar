# Auth + SSE + Preloader Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить критичные проблемы аутентификации, SSE и предзагрузки данных для корректной работы сессий, выхода и входа пользователей.

**Architecture:** Минимальные изменения в существующих файлах. Backend: rolling session в auth middleware. Frontend: корректный logout, SSE после auth, preloader при старте. Не затрагивает существующую логику CRUD.

**Tech Stack:** Python aiohttp, vanilla JS, PostgreSQL (asyncpg)

---

## Global Constraints

- Язык коммитов и кода: русский
- Логирование: только `loguru.logger`
- Деплой: `python deploy/deploy.py test` → VPS
- Branch: `develop`
- Все изменения в `app/static/js/*.js`, `app/auth.py`, `app/static/index.html`, `database/sending.py`

---

## Файлы для изменений

| Файл | Ответственность |
|------|----------------|
| `app/static/js/auth.js` | Logout cleanup: SSE, timer, store, cache, preloaded |
| `app/static/js/app.js` | SSE после auth, initPreloader() |
| `app/static/js/sse.js` | Экспорт connectSSE/disconnectSSE |
| `app/static/js/preloader.js` | Экспорт _preloaded для сброса |
| `app/static/js/calendar.js` | calStopNowLineTimer доступен глобально |
| `app/auth.py` | Rolling session в middleware, remember_me |
| `database/sending.py` | update_session_expiry() |
| `app/static/index.html` | Checkbox "Запомнить меня" |

---

### Task 1: SSE — закрытие при logout + подключение после auth

**Files:**
- Modify: `app/static/js/sse.js` — добавить `disconnectSSE()`
- Modify: `app/static/js/auth.js` — вызов `disconnectSSE()` в `logout()`
- Modify: `app/static/js/app.js` — перенести `initSSE()` после `checkAuth()`

**Interfaces:**
- Produces: `disconnectSSE()` — глобальная функция
- Consumes: `connectSSE()` — уже существует

- [ ] **Step 1: Добавить disconnectSSE() в sse.js**

```js
// В конец sse.js, после handleSSEEvent
function disconnectSSE() {
    if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
    }
}
```

- [ ] **Step 2: Вызвать disconnectSSE() в logout()**

В `app/static/js/auth.js`, функция `logout()`, добавить после `store.allLocations = []`:
```js
    if (typeof disconnectSSE === 'function') disconnectSSE();
```

- [ ] **Step 3: Перенести initSSE() после checkAuth() в app.js**

В `app/static/js/app.js` заменить:
```js
// Было:
initTheme();
initRouter();
checkAuth();
initUpdater();
initSSE();

// Стало:
initTheme();
initRouter();
checkAuth().then(() => {
    initUpdater();
    initSSE();
});
```

- [ ] **Step 4: Коммит**

```bash
git add app/static/js/sse.js app/static/js/auth.js app/static/js/app.js
git commit -m "fix: SSE закрывается при logout, подключается после auth"
```

---

### Task 2: Logout — полная очистка состояния

**Files:**
- Modify: `app/static/js/auth.js` — расширить logout()
- Modify: `app/static/js/preloader.js` — экспорт _preloaded

**Interfaces:**
- Consumes: `disconnectSSE()` из Task 1

- [ ] **Step 1: Добавить сброс _preloaded в logout()**

В `app/static/js/auth.js`, функция `logout()`, добавить после `store.allLocations = []`:
```js
    if (typeof _preloaded !== 'undefined') _preloaded = false;
```

- [ ] **Step 2: Остановить now-line таймер**

В `app/static/js/auth.js`, функция `logout()`, добавить:
```js
    if (typeof calStopNowLineTimer === 'function') calStopNowLineTimer();
```

- [ ] **Step 3: Очистить dash_cache из localStorage**

В `app/static/js/auth.js`, функция `logout()`, добавить:
```js
    localStorage.removeItem('dash_cache');
```

- [ ] **Step 4: Коммит**

```bash
git add app/static/js/auth.js
git commit -m "fix: logout очищает SSE, таймер, кэш, _preloaded"
```

---

### Task 3: Rolling session — обновление TTL при активности

**Files:**
- Modify: `app/auth.py` — обновление expires_at в middleware
- Modify: `database/sending.py` — функция update_session_expiry()

**Interfaces:**
- Produces: `update_session_expiry(token: str, hours: int = 24)` — обновляет expires_at

- [ ] **Step 1: Добавить update_session_expiry() в sending.py**

В `database/sending.py`, после `cleanup_expired_sessions()`:
```python
async def update_session_expiry(token: str, hours: int = 24):
    """Обновить TTL сессии (rolling session)."""
    try:
        async with async_session() as session:
            await session.execute(
                update(Session)
                .where(Session.token == token)
                .values(expires_at=datetime.utcnow() + timedelta(hours=hours))
            )
            await session.commit()
    except Exception as e:
        logger.error('Ошибка update_session_expiry: {}', repr(e))
```

- [ ] **Step 2: Импортировать в auth.py**

В `app/auth.py`, добавить в импорт из `database.sending`:
```python
from database.sending import (
    create_session as db_create_session,
    delete_session as db_delete_session,
    cleanup_expired_sessions,
    update_session_expiry,
)
```

- [ ] **Step 3: Вызывать update_session_expiry в middleware**

В `app/auth.py`, функция `auth_middleware()`, после `request['user'] = user`:
```python
    # Rolling session — обновить TTL при каждом запросе
    await update_session_expiry(token)
```

- [ ] **Step 4: Коммит**

```bash
git add app/auth.py database/sending.py
git commit -m "fix: rolling session — TTL обновляется при каждом запросе"
```

---

### Task 4: initPreloader() — вызов при старте

**Files:**
- Modify: `app/static/js/app.js` — вызов initPreloader()

**Interfaces:**
- Consumes: `initPreloader()` из preloader.js

- [ ] **Step 1: Добавить initPreloader() в app.js**

В `app/static/js/app.js`, перед `checkAuth()`:
```js
initTheme();
initPreloader();
initRouter();
checkAuth().then(() => {
    initUpdater();
    initSSE();
});
```

- [ ] **Step 2: Коммит**

```bash
git add app/static/js/app.js
git commit -m "fix: initPreloader() вызывается при старте для кэшированных данных"
```

---

### Task 5: "Запомнить меня" — чекбокс + долгая сессия

**Files:**
- Modify: `app/static/index.html` — checkbox на форме логина
- Modify: `app/static/js/auth.js` — передача remember_me в login()
- Modify: `app/auth.py` — обработка remember_me, TTL сессии + cookie

**Interfaces:**
- Consumes: `create_session()` из database/sending.py (expires_hours параметр)

- [ ] **Step 1: Добавить checkbox в index.html**

В форме логина, перед кнопкой "Войти" (после строки 53):
```html
    <label class="login-remember">
        <input type="checkbox" id="login-remember"> Запомнить меня
    </label>
```

- [ ] **Step 2: Добавить CSS для checkbox**

В `app/static/css/base.css`, после стилей логина:
```css
.login-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    color: var(--fg-muted);
    cursor: pointer;
    margin-bottom: 12px;
}
.login-remember input { cursor: pointer; }
```

- [ ] **Step 3: Передать remember_me в login()**

В `app/static/js/auth.js`, функция `login()`, заменить fetch:
```js
        const rememberMe = document.getElementById('login-remember')?.checked || false;
        const resp = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_id: parseInt(maxId), password, remember_me: rememberMe })
        });
```

- [ ] **Step 4: Обработать remember_me на сервере**

В `app/auth.py`, функция `admin_login()`, после `data = await resp.json()`:
```python
    remember_me = data.get('remember_me', False)
    expires_hours = 720 if remember_me else 24  # 30 дней или 24 часа
```

Далее при создании сессии и cookie:
```python
    session_id = await create_session(token, user.id, request)
    response = web.json_response({'ok': True})
    _set_cookie(response, 'admin_token', token, max_age=expires_hours * 3600)
    _set_cookie(response, 'csrf_token', csrf_token, httponly=False, max_age=expires_hours * 3600)
```

- [ ] **Step 5: Коммит**

```bash
git add app/static/index.html app/static/css/base.css app/static/js/auth.js app/auth.py
git commit -m "feat: checkbox 'Запомнить меня' — сессия 30 дней вместо 24ч"
```

---

### Task 6: Деплой и тестирование

**Files:**
- Deploy: `python deploy/deploy.py test`

- [ ] **Step 1: Задеплоить на test**

```bash
python deploy/deploy.py test
```

- [ ] **Step 2: Проверить вход с "Запомнить меня"**

- Войти с checkbox → cookie max-age = 2592000 (30 дней)
- Войти без checkbox → cookie max-age = 86400 (24 часа)

- [ ] **Step 3: Проверить logout**

- После logout: SSE закрыт, store пуст, localStorage без dash_cache
- При повторном входе: данные загружаются заново

- [ ] **Step 4: Проверить rolling session**

- Войти, подождать > 1 минуты, сделать запрос
- Проверить что `expires_at` обновился в БД

- [ ] **Step 5: Проверить кэш при повторном входе**

- Войти → данные загружены → выйти → войти снова
- Данные мгновенно из кэша + фоновое обновление

- [ ] **Step 6: Коммит**

```bash
git commit --allow-empty -m "test: проверка auth/sse/preloader fixes на test сервере"
```
