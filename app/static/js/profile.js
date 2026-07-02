// ─── Profile / Пользователь ──────────────────────────────────────────

function initProfile() {
    document.getElementById('profile-old-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    document.getElementById('profile-error').style.display = 'none';
    document.getElementById('profile-success').style.display = 'none';
}

async function changeMyPassword() {
    const errEl = document.getElementById('profile-error');
    const okEl = document.getElementById('profile-success');
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    const oldPwd = document.getElementById('profile-old-password').value;
    const newPwd = document.getElementById('profile-new-password').value;
    const confirmPwd = document.getElementById('profile-confirm-password').value;

    if (!oldPwd || !newPwd) {
        errEl.textContent = 'Заполните все поля';
        errEl.style.display = 'block';
        return;
    }

    if (newPwd !== confirmPwd) {
        errEl.textContent = 'Пароли не совпадают';
        errEl.style.display = 'block';
        return;
    }

    if (newPwd.length < 4) {
        errEl.textContent = 'Минимум 4 символа';
        errEl.style.display = 'block';
        return;
    }

    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';

    try {
        const resp = await fetch('/admin/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ old_password: oldPwd, new_password: newPwd, csrf_token: csrfToken })
        });
        const data = await resp.json();
        if (data.ok) {
            okEl.textContent = 'Пароль успешно изменён';
            okEl.style.display = 'block';
            document.getElementById('profile-old-password').value = '';
            document.getElementById('profile-new-password').value = '';
            document.getElementById('profile-confirm-password').value = '';
            showToast('Пароль изменён', 'success');
        } else {
            errEl.textContent = data.error || 'Ошибка';
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = 'Ошибка сети';
        errEl.style.display = 'block';
    }
}
