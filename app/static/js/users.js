// ─── Пользователи ────────────────────────────────────────────────────

let allUsers = [];
let editingId = null;
let deletingId = null;

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Загрузка...</td></tr>';

    const resp = await fetch(`${BASE_URL}/admin/api/users`);
    if (resp.status === 401) { showLogin(); return; }
    allUsers = await resp.json();
    renderUsers(allUsers);
    updateStats(allUsers);
}

function updateStats(users) {
    document.getElementById('stat-total-users').textContent = users.length;
    document.getElementById('stat-admins').textContent = users.filter(u => u.status === 'admin').length;
    document.getElementById('stat-users').textContent = users.filter(u => u.status !== 'admin').length;
    document.getElementById('stat-shown').textContent = users.length;
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Пользователей нет</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr onclick="openEditModal('${u.id}')" style="cursor:pointer">
            <td data-label="Имя">${esc(u.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td data-label="Telegram ID" style="color:var(--muted);font-family:monospace">${u.tg_id || '—'}</td>
            <td data-label="MAX ID" style="color:var(--muted);font-family:monospace">${u.max_id || '—'}</td>
            <td data-label="Статус">
                <span class="badge ${u.status === 'admin' ? 'badge-admin' : 'badge-user'}">${u.status}</span>
            </td>
            <td data-label="Действия">
                <div class="actions">
                    <button class="btn-icon danger" onclick="event.stopPropagation();openConfirm('${u.id}', '${esc(u.name).replace(/'/g, "\\'")}')" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const name = (document.getElementById('f-user-name')?.value || '').toLowerCase();
    const tg = (document.getElementById('f-user-tg')?.value || '').toLowerCase();
    const max = (document.getElementById('f-user-max')?.value || '').toLowerCase();
    const status = document.getElementById('f-user-status')?.value || '';

    const filtered = allUsers.filter(u =>
        (u.name || '').toLowerCase().includes(name) &&
        String(u.tg_id || '').includes(tg) &&
        String(u.max_id || '').includes(max) &&
        (!status || u.status === status)
    );
    renderUsers(filtered);
    document.getElementById('stat-shown').textContent = filtered.length;
}

function resetUserFilters() {
    document.getElementById('f-user-name').value = '';
    document.getElementById('f-user-tg').value = '';
    document.getElementById('f-user-max').value = '';
    document.getElementById('f-user-status').value = '';
    filterUsers();
}

// ─── Модалка пользователя ────────────────────────────────────────────

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Добавить пользователя';
    document.getElementById('modal-save-btn').textContent = 'Добавить';
    document.getElementById('f-first-name').value = '';
    document.getElementById('f-last-name').value = '';
    document.getElementById('f-patronymic').value = '';
    document.getElementById('f-username').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-tg-id').value = '';
    document.getElementById('f-max-id').value = '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-status').value = 'user';
    document.getElementById('user-modal').classList.add('show');
}

function openEditModal(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    editingId = id;
    document.getElementById('modal-title').textContent = 'Редактировать пользователя';
    document.getElementById('modal-save-btn').textContent = 'Сохранить';
    document.getElementById('f-first-name').value = u.first_name || '';
    document.getElementById('f-last-name').value = u.last_name || '';
    document.getElementById('f-patronymic').value = u.patronymic || '';
    document.getElementById('f-username').value = u.username || '';
    document.getElementById('f-name').value = u.name || '';
    document.getElementById('f-tg-id').value = u.tg_id || '';
    document.getElementById('f-max-id').value = u.max_id || '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-status').value = u.status || 'user';
    document.getElementById('user-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('user-modal').classList.remove('show');
}

async function saveUser() {
    const btn = document.getElementById('modal-save-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    const origText = btn.textContent;
    btn.textContent = 'Сохранение...';

    const tgIdValue = document.getElementById('f-tg-id').value;
    const maxIdValue = document.getElementById('f-max-id').value;
    const password = document.getElementById('f-password').value;

    const payload = {
        first_name: document.getElementById('f-first-name').value.trim(),
        last_name: document.getElementById('f-last-name').value.trim(),
        patronymic: document.getElementById('f-patronymic').value.trim(),
        username: document.getElementById('f-username').value.trim(),
        name: document.getElementById('f-name').value.trim(),
        tg_id: tgIdValue ? parseInt(tgIdValue) : null,
        max_id: maxIdValue ? parseInt(maxIdValue) : null,
        status: document.getElementById('f-status').value,
    };
    if (password) payload.password = password;

    try {
        const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
        let resp;
        if (editingId) {
            resp = await fetch(`${BASE_URL}/admin/api/users/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) {
            await loadUsers();
            closeModal();
            showToast(editingId ? 'Пользователь обновлён' : 'Пользователь добавлен', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = origText;
}

// ─── Удаление пользователя ───────────────────────────────────────────

function openConfirm(id, name) {
    deletingId = id;
    deletingOrgId = null;
    deletingLocId = null;
    document.getElementById('confirm-text').textContent = `Пользователь «${name}» будет удалён безвозвратно.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

function closeConfirm() {
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.remove('show');
    // Восстановить оригинальные кнопки
    document.getElementById('confirm-actions').innerHTML = `
        <button class="btn btn-ghost" onclick="closeConfirm()">Отмена</button>
        <button class="btn btn-danger" onclick="confirmDelete()">Удалить</button>
    `;
    // Восстановить иконку и заголовок
    const icon = overlay.querySelector('.confirm-icon');
    const title = overlay.querySelector('h3');
    icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
    icon.style.background = '';
    icon.style.color = '';
    title.textContent = 'Подтвердите удаление';
    document.getElementById('confirm-text').textContent = 'Это действие нельзя отменить.';
    deletingId = null;
    deletingOrgId = null;
    deletingLocId = null;
    deletingEventId = null;
}

async function confirmDelete() {
    // Блокируем кнопки и показываем спиннер
    const overlay = document.getElementById('confirm-overlay');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    if (okBtn) {
        okBtn.disabled = true;
        okBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Выполняю...';
    }
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.pointerEvents = 'none';
        cancelBtn.style.opacity = '0.5';
    }
    overlay.querySelector('.confirm-icon').innerHTML = '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
    overlay.querySelector('h3').textContent = 'Выполняю...';
    overlay.querySelector('p').textContent = '';

    if (deletingEventId) { await confirmDeleteEvent(); return; }
    if (deletingOrgId) { await confirmDeleteOrg(); return; }
    if (deletingLocId) { await confirmDeleteLoc(); return; }
    if (!deletingId) return;
    try {
        const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
        const resp = await fetch(`${BASE_URL}/admin/api/users/${deletingId}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadUsers(); showToast('Пользователь удалён', 'success'); }
        else { closeConfirm(); showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { closeConfirm(); showToast('Ошибка сети', 'error'); }
}
