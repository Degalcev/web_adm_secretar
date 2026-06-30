// ─── Авторизация ─────────────────────────────────────────────────────

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
        navigateTo('/conferences/');
    } else {
        err.textContent = data.error || 'Неверный логин или пароль';
        err.style.display = 'block';
    }
}

async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, { method: 'POST' });
    navigateTo('/');
}

async function checkAuth() {
    try {
        if (window.WebApp && window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user) {
            const maxId = window.WebApp.initDataUnsafe.user.user_id;
            if (maxId) document.getElementById('login-max-id').value = maxId;
        }
    } catch (e) { /* ignore */ }
    const resp = await fetch(`${BASE_URL}/admin/api/users`);
    if (resp.status === 200) {
        // Авторизован — перейти на текущий URL или conferences
        const path = getRouteFromURL();
        if (path === '/') {
            navigateTo('/conferences/', false);
        } else {
            navigateTo(path, false);
        }
    }
}

function showMain() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'flex';
}

function showLogin() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}
