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
        <tr>
            <td data-label="Имя">${esc(u.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td data-label="Telegram ID" style="color:var(--muted);font-family:monospace">${u.tg_id || '—'}</td>
            <td data-label="MAX ID" style="color:var(--muted);font-family:monospace">${u.max_id || '—'}</td>
            <td data-label="Статус">
                <span class="badge ${u.status === 'admin' ? 'badge-admin' : 'badge-user'}">${u.status}</span>
            </td>
            <td data-label="Действия">
                <div class="actions">
                    <button class="btn-icon danger" onclick="openConfirm('${u.id}', '${esc(u.name)}')" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const q = document.getElementById('search').value.toLowerCase();
    const filtered = allUsers.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        String(u.tg_id || '').includes(q) ||
        String(u.max_id || '').includes(q)
    );
    renderUsers(filtered);
    document.getElementById('stat-shown').textContent = filtered.length;
}

// ─── Модалка пользователя ────────────────────────────────────────────

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Добавить пользователя';
    document.getElementById('modal-save-btn').textContent = 'Добавить';
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

    const tgIdValue = document.getElementById('f-tg-id').value;
    const maxIdValue = document.getElementById('f-max-id').value;
    const password = document.getElementById('f-password').value;

    const payload = {
        name: document.getElementById('f-name').value.trim(),
        tg_id: tgIdValue ? parseInt(tgIdValue) : null,
        max_id: maxIdValue ? parseInt(maxIdValue) : null,
        status: document.getElementById('f-status').value,
    };
    if (password) payload.password = password;

    try {
        let resp;
        if (editingId) {
            resp = await fetch(`${BASE_URL}/admin/api/users/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) {
            closeModal();
            await loadUsers();
            showToast(editingId ? 'Пользователь обновлён' : 'Пользователь добавлен', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
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
    document.getElementById('confirm-overlay').classList.remove('show');
    deletingId = null;
    deletingOrgId = null;
    deletingLocId = null;
    deletingEventId = null;
}

async function confirmDelete() {
    if (deletingEventId) { await confirmDeleteEvent(); return; }
    if (deletingOrgId) { await confirmDeleteOrg(); return; }
    if (deletingLocId) { await confirmDeleteLoc(); return; }
    if (!deletingId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/users/${deletingId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadUsers(); showToast('Пользователь удалён', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
