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
        // Заменить историю, чтобы кнопка "назад" не возвращала на логин
        window.history.replaceState(null, '', '/panel/');
        navigateTo('/panel/');
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
    // Очистить историю и перейти на логин
    window.history.replaceState(null, '', '/');
    navigateTo('/');
}

async function checkAuth() {
    try {
        if (window.WebApp && window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user) {
            const maxId = window.WebApp.initDataUnsafe.user.user_id;
            if (maxId) document.getElementById('login-max-id').value = maxId;
        }
    } catch (e) { /* ignore */ }

    // Проверка авторизации через /auth/check (доступно всем ролям)
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

        // Авторизован — перейти на текущий URL или conferences
        const path = getRouteFromURL();
        if (path === '/') {
            window.history.replaceState(null, '', '/panel/');
            navigateTo('/panel/', false);
        } else {
            navigateTo(path, false);
        }
        // Применить ограничения ролей
        console.log('[auth] role:', window.currentUserRole, 'name:', window.currentUserName);
        if (typeof applyRoleRestrictions === 'function') {
            applyRoleRestrictions();
        }
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
