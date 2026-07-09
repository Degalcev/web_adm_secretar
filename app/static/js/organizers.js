// ─── Организаторы ────────────────────────────────────────────────────

let allOrganizers = [];
let editingOrgId = null;
let deletingOrgId = null;

async function loadOrganizers() {
    const tbody = document.getElementById('organizers-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Загрузка...</td></tr>';
    const resp = await fetch(`${BASE_URL}/admin/api/organizers`);
    if (resp.status === 401) { showLogin(); return; }
    allOrganizers = await resp.json();
    renderOrganizers(allOrganizers);
    document.getElementById('stat-total-org').textContent = allOrganizers.length;
    document.getElementById('stat-shown-org').textContent = allOrganizers.length;
}

function renderOrganizers(items) {
    const tbody = document.getElementById('organizers-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет организаторов</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(o => `
        <tr onclick="openEditOrganizerModal('${o.id}')" style="cursor:pointer">
            <td>${esc(o.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td class="col-mono">${esc(o.short_name) || '—'}</td>
            <td class="col-mono" style="font-size:0.75rem">${esc(o.base_url) || '—'}</td>
            <td class="col-actions">
                <div class="actions">
                    <button class="btn-icon danger" onclick="event.stopPropagation();openConfirmOrg('${o.id}','${esc(o.name).replace(/'/g, "\\'")}')" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterOrganizers() {
    const name = (document.getElementById('f-org-name')?.value || '').toLowerCase();
    const short = (document.getElementById('f-org-short')?.value || '').toLowerCase();
    const url = (document.getElementById('f-org-url')?.value || '').toLowerCase();

    const filtered = allOrganizers.filter(o =>
        (o.name || '').toLowerCase().includes(name) &&
        (o.short_name || '').toLowerCase().includes(short) &&
        (o.base_url || '').toLowerCase().includes(url)
    );
    renderOrganizers(filtered);
    document.getElementById('stat-shown-org').textContent = filtered.length;
}

function resetOrgFilters() {
    document.getElementById('f-org-name').value = '';
    document.getElementById('f-org-short').value = '';
    document.getElementById('f-org-url').value = '';
    filterOrganizers();
}

async function openAddOrganizerModal() {
    if (window._modalsLoaded) await window._modalsLoaded;
    editingOrgId = null;
    document.getElementById('org-modal-title').textContent = 'Добавить организатора';
    document.getElementById('f-org-name-modal').value = '';
    document.getElementById('f-org-short-name').value = '';
    document.getElementById('f-org-base-url').value = '';
    document.getElementById('organizer-modal').classList.add('show');
}

async function openEditOrganizerModal(id) {
    if (window._modalsLoaded) await window._modalsLoaded;
    const o = allOrganizers.find(x => x.id === id);
    if (!o) return;
    editingOrgId = id;
    document.getElementById('org-modal-title').textContent = 'Редактировать организатора';
    document.getElementById('f-org-name-modal').value = o.name || '';
    document.getElementById('f-org-short-name').value = o.short_name || '';
    document.getElementById('f-org-base-url').value = o.base_url || '';
    document.getElementById('organizer-modal').classList.add('show');
}

function closeOrganizerModal() {
    document.getElementById('organizer-modal').classList.remove('show');
}

async function saveOrganizer() {
    const btn = document.getElementById('org-modal-save-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    const origText = btn.textContent;
    btn.textContent = 'Сохранение...';
    const payload = {
        name: document.getElementById('f-org-name-modal').value.trim(),
        short_name: document.getElementById('f-org-short-name').value.trim(),
        base_url: document.getElementById('f-org-base-url').value.trim(),
    };
    try {
        const csrfToken = getCsrfToken();
        let resp;
        if (editingOrgId) {
            resp = await fetch(`${BASE_URL}/admin/api/organizers/${editingOrgId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/organizers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) { await loadOrganizers(); closeOrganizerModal(); showToast(editingOrgId ? 'Обновлено' : 'Добавлено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = origText;
}

function openConfirmOrg(id, name) {
    deletingOrgId = id;
    deletingId = null;
    deletingLocId = null;
    document.getElementById('confirm-text').textContent = `Организатор «${name}» будет удалён.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

async function confirmDeleteOrg() {
    if (!deletingOrgId) return;
    try {
        const csrfToken = getCsrfToken();
        const resp = await fetch(`${BASE_URL}/admin/api/organizers/${deletingOrgId}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadOrganizers(); showToast('Удалено', 'success'); }
        else { closeConfirm(); showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { closeConfirm(); showToast('Ошибка сети', 'error'); }
}
