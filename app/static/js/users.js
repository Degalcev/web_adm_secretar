// ─── Пользователи ────────────────────────────────────────────────────

let allUsers = [];

const users = createCrudModule({
    name: 'пользователя',
    api: '/admin/api/users',
    confirmType: 'user',
    modalId: 'user-modal',
    titleId: 'modal-title',
    saveBtnId: 'modal-save-btn',
    _items: [],
    fields: [
        { id: 'f-last-name', key: 'last_name', default: '' },
        { id: 'f-first-name', key: 'first_name', default: '' },
        { id: 'f-patronymic', key: 'patronymic', default: '' },
        { id: 'f-username', key: 'username', default: '' },
        { id: 'f-name', key: 'name', default: '' },
        { id: 'f-tg-id', key: 'tg_id', default: '' },
        { id: 'f-max-id', key: 'max_id', default: '' },
        { id: 'f-status', key: 'status', default: 'user' }
    ],
    buildPayload() {
        const tgId = document.getElementById('f-tg-id').value;
        const maxId = document.getElementById('f-max-id').value;
        const password = document.getElementById('f-password').value;
        const payload = {
            first_name: document.getElementById('f-first-name').value.trim(),
            last_name: document.getElementById('f-last-name').value.trim(),
            patronymic: document.getElementById('f-patronymic').value.trim(),
            username: document.getElementById('f-username').value.trim(),
            name: document.getElementById('f-name').value.trim(),
            tg_id: tgId ? parseInt(tgId) : null,
            max_id: maxId ? parseInt(maxId) : null,
            status: document.getElementById('f-status').value,
        };
        if (password) payload.password = password;
        return payload;
    },
    messages: { created: 'Пользователь добавлен', updated: 'Пользователь обновлён' },
    stats(items) {
        document.getElementById('stat-total-users').textContent = items.length;
        document.getElementById('stat-admins').textContent = items.filter(u => u.status === 'admin').length;
        document.getElementById('stat-users').textContent = items.filter(u => u.status !== 'admin').length;
        document.getElementById('stat-shown').textContent = items.length;
    },
    render(items) {
        const tbody = document.getElementById('users-tbody');
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Пользователей нет</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(u => `
            <tr onclick="users.openEdit('${u.id}')" style="cursor:pointer">
                <td>${esc(u.name) || '<span style="color:var(--muted)">—</span>'}</td>
                <td class="col-center col-mono">${u.tg_id || '—'}</td>
                <td class="col-center col-mono">${u.max_id || '—'}</td>
                <td class="col-center">
                    <span class="badge ${u.status === 'admin' ? 'badge-admin' : 'badge-user'}">${u.status}</span>
                </td>
                <td class="col-actions">
                    <div class="actions">
                        <button class="btn-icon danger" onclick="event.stopPropagation();users.openConfirm('${u.id}','${esc(u.name).replace(/'/g, "\\'")}')" title="Удалить">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
});

// Кастомный фильтр users (status — exact match)
users._baseFilter = users.filter;
users.filter = function() {
    const items = users._items || [];
    const name = (document.getElementById('f-user-name')?.value || '').toLowerCase();
    const tg = (document.getElementById('f-user-tg')?.value || '').toLowerCase();
    const max = (document.getElementById('f-user-max')?.value || '').toLowerCase();
    const status = document.getElementById('f-user-status')?.value || '';
    const filtered = items.filter(u =>
        (u.name || '').toLowerCase().includes(name) &&
        String(u.tg_id || '').includes(tg) &&
        String(u.max_id || '').includes(max) &&
        (!status || u.status === status)
    );
    users.render(filtered);
    document.getElementById('stat-shown').textContent = filtered.length;
};

// Обратная совместимость
async function loadUsers() { return users.load(); }
function renderUsers(items) { users.render(items); }
function updateStats(items) { users.stats(items); }
function filterUsers() { users.filter(); }
function resetUserFilters() {
    ['f-user-name', 'f-user-tg', 'f-user-max', 'f-user-status'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    users.filter();
}
async function openAddModal() { return users.openAdd(); }
async function openEditModal(id) { return users.openEdit(id); }
function closeModal() { users.closeModal(); }
async function saveUser() { return users.save(); }
function openConfirm(id, name) { users.openConfirm(id, name); }
async function deleteUser(id) { return users.delete(id); }
