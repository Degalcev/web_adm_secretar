// ─── Авторизация ─────────────────────────────────────────────────────

let isAuthenticated = false;

async function login() {
    const maxId = document.getElementById('login-max-id').value;
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.display = 'none';

    if (!maxId || !password) {
        err.textContent = 'Введите MAX ID и пароль';
        err.style.display = 'block';
        return;
    }

    const resp = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_id: parseInt(maxId), password })
    });
    const data = await resp.json();

    if (data.ok) {
        isAuthenticated = true;
        showMain();
        window.history.replaceState(null, '', '/');
        // Подождать установки cookie и загрузить данные
        await new Promise(r => setTimeout(r, 100));
        await checkAuth(true);
    } else {
        err.textContent = data.error || 'Неверный логин или пароль';
        err.style.display = 'block';
    }
}

async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, { method: 'POST' });
    isAuthenticated = false;
    window.currentUserRole = null;
    window.currentUserName = '';
    // Очистить кэш данных
    if (typeof allUsers !== 'undefined') allUsers = [];
    if (typeof allEvents !== 'undefined') allEvents = [];
    if (typeof allOrganizers !== 'undefined') allOrganizers = [];
    if (typeof allLocations !== 'undefined') allLocations = [];
    // Скрыть имя в хедере
    const userEl = document.getElementById('topbar-user');
    if (userEl) userEl.style.display = 'none';
    // Показать логин
    showLogin();
    window.history.replaceState(null, '', '/');
}

async function checkAuth(silent) {
    try {
        if (window.WebApp && window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user) {
            const maxId = window.WebApp.initDataUnsafe.user.user_id;
            if (maxId) document.getElementById('login-max-id').value = maxId;
        }
    } catch (e) { /* ignore */ }

    // Если авторизован — показать дашборд, иначе — логин
    const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
    if (resp.status === 200) {
        isAuthenticated = true;

        // Получить данные текущего пользователя
        try {
            const meResp = await fetch(`${BASE_URL}/admin/api/users/me`);
            if (meResp.ok) {
                const me = await meResp.json();
                window.currentUserRole = me.status || 'user';
                const displayName = me.name || me.username || '';
                const lastName = me.last_name || '';
                const firstName = me.first_name || '';
                if (lastName && firstName) {
                    window.currentUserName = `${lastName} ${firstName.charAt(0)}.`;
                } else if (displayName) {
                    window.currentUserName = displayName;
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

        if (!silent) showMain();
        console.log('[auth] role:', window.currentUserRole, 'name:', window.currentUserName);
        if (typeof applyRoleRestrictions === 'function') {
            applyRoleRestrictions();
        }
        // Preload данных
        _preloaded = false;
        if (typeof initPreloader === 'function') initPreloader();
    } else if (!silent) {
        showLogin();
    }
}
    } catch (e) { /* ignore */ }

    // Если авторизован — показать дашборд, иначе — логин
    const resp = await fetch(`${BASE_URL}/admin/api/auth/check`);
    if (resp.status === 200) {
        isAuthenticated = true;

        // Получить данные текущего пользователя
        try {
            const meResp = await fetch(`${BASE_URL}/admin/api/users/me`);
            if (meResp.ok) {
                const me = await meResp.json();
                window.currentUserRole = me.status || 'user';
                // Имя для хедера: приоритет name, потом ФИО
                const displayName = me.name || me.username || '';
                const lastName = me.last_name || '';
                const firstName = me.first_name || '';
                if (lastName && firstName) {
                    window.currentUserName = `${lastName} ${firstName.charAt(0)}.`;
                } else if (displayName) {
                    window.currentUserName = displayName;
                } else {
                    window.currentUserName = `User #${me.max_id || ''}`;
                }
                // Показать имя в хедере
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

        showMain();
        // Применить ограничения ролей
        console.log('[auth] role:', window.currentUserRole, 'name:', window.currentUserName);
        if (typeof applyRoleRestrictions === 'function') {
            applyRoleRestrictions();
        }
        // Загрузить данные после авторизации
        _preloaded = false;
        if (typeof initPreloader === 'function') initPreloader();
    } else {
        // Не авторизован — показать логин
        showLogin();
    }
    // Если не авторизован — показать логин (по умолчанию)
}

function showMain() {
    document.getElementById('login-screen').classList.remove('show');
    document.getElementById('main-screen').style.display = 'flex';
}

function showLogin() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').classList.add('show');
}
