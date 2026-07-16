// --- Авторизация ---

let isAuthenticated = false;

/**
 * Проверка авторизации — ЕДИНСТВЕННЫЙ источник правды.
 * Возвращает true если авторизован, false если нет.
 */
async function checkAuth() {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
        if (resp.ok) {
            isAuthenticated = true;
            await loadCurrentUser();
            showMain();
            if (typeof applyRoleRestrictions === 'function') {
                applyRoleRestrictions();
            }
            // Навигация: при входе — на главную, при загрузке страницы — по URL
            const route = getRouteFromURL();
            if (route && typeof ROUTES !== 'undefined' && ROUTES[route]) {
                navigateTo(route, false);
            }
            return true;
        }
    } catch (e) { /* ignore network errors */ }

    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    window.currentUser = null;
    showLogin();
    return false;
}

/**
 * Загрузка данных текущего пользователя.
 */
async function loadCurrentUser() {
    try {
        const meResp = await fetch(`${BASE_URL}/admin/api/users/me`);
        if (meResp.ok) {
            const me = await meResp.json();
            window.currentUserRole = me.status || 'user';
            window.currentUser = me;
            const lastName = me.last_name || '';
            const firstName = me.first_name || '';
            if (lastName && firstName) {
                window.currentUserName = `${lastName} ${firstName.charAt(0)}.`;
            } else if (me.name) {
                window.currentUserName = me.name;
            } else if (me.username) {
                window.currentUserName = me.username;
            } else {
                window.currentUserName = `User #${me.max_id || ''}`;
            }
            const userEl = document.getElementById('topbar-user');
            if (userEl && window.currentUserName) {
                userEl.textContent = window.currentUserName;
                userEl.style.display = 'inline';
            }
        } else {
            window.currentUserRole = 'admin';
        }
    } catch (e) {
        window.currentUserRole = 'admin';
    }
}

/**
 * Вход — доверяет checkAuth() для финальной проверки.
 */
async function login() {
    const loginValue = document.getElementById('login-max-id').value.trim();
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.display = 'none';

    if (!loginValue || !password) {
        err.textContent = 'Введите логин и пароль';
        err.style.display = 'block';
        return;
    }

    const btn = document.querySelector('#login-screen .btn-primary');
    if (btn) btn.disabled = true;

    try {
        const rememberMe = document.getElementById('login-remember')?.checked || false;
        const resp = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginValue, password, remember_me: rememberMe })
        });
        const data = await resp.json();

        if (data.ok) {
            // НЕ ставим isAuthenticated = true
            // НЕ показываем main-screen
            // Доверяем только checkAuth()
            await checkAuth();
        } else {
            err.textContent = data.error || 'Неверный логин или пароль';
            err.style.display = 'block';
        }
    } catch (e) {
        err.textContent = 'Ошибка сети';
        err.style.display = 'block';
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Выход.
 */
async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, { method: 'POST' });
    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    window.currentUser = null;
    store.allUsers = [];
    store.allOrganizers = [];
    store.allLocations = [];
    cacheInvalidateAll();
    const userEl = document.getElementById('topbar-user');
    if (userEl) userEl.style.display = 'none';
    // Сброс раскрытия меню
    document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
    // Остановка SSE, таймеров, очистка кэша
    if (typeof disconnectSSE === 'function') disconnectSSE();
    if (typeof calStopNowLineTimer === 'function') calStopNowLineTimer();
    if (typeof _preloaded !== 'undefined') _preloaded = false;
    showLogin();
    window.history.replaceState(null, '', '/');
}

function showMain() {
    document.getElementById('login-screen').classList.remove('show');
    document.getElementById('main-screen').style.display = 'flex';
}

function showLogin() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').classList.add('show');
}
