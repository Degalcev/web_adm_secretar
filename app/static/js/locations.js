// ─── Локации ─────────────────────────────────────────────────────────

let allLocations = [];
let editingLocId = null;
let deletingLocId = null;

async function loadLocations() {
    const tbody = document.getElementById('locations-tbody');
    tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Загрузка...</td></tr>';
    const resp = await fetch(`${BASE_URL}/admin/api/locations`);
    if (resp.status === 401) { showLogin(); return; }
    allLocations = await resp.json();
    renderLocations(allLocations);
    document.getElementById('stat-total-loc').textContent = allLocations.length;
    document.getElementById('stat-shown-loc').textContent = allLocations.length;
}

function renderLocations(items) {
    const tbody = document.getElementById('locations-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Нет локаций</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(l => `
        <tr>
            <td>${esc(l.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td>
                <div class="actions">
                    <button class="btn-icon" onclick="openEditLocationModal('${l.id}')" title="Изменить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon danger" onclick="openConfirmLoc('${l.id}','${esc(l.name)}')" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterLocations() {
    const q = document.getElementById('search-loc').value.toLowerCase();
    const filtered = allLocations.filter(l =>
        (l.name || '').toLowerCase().includes(q)
    );
    renderLocations(filtered);
    document.getElementById('stat-shown-loc').textContent = filtered.length;
}

function openAddLocationModal() {
    editingLocId = null;
    document.getElementById('loc-modal-title').textContent = 'Добавить локацию';
    document.getElementById('f-loc-name').value = '';
    document.getElementById('location-modal').classList.add('show');
}

function openEditLocationModal(id) {
    const l = allLocations.find(x => x.id === id);
    if (!l) return;
    editingLocId = id;
    document.getElementById('loc-modal-title').textContent = 'Редактировать локацию';
    document.getElementById('f-loc-name').value = l.name || '';
    document.getElementById('location-modal').classList.add('show');
}

function closeLocationModal() {
    document.getElementById('location-modal').classList.remove('show');
}

async function saveLocation() {
    const btn = document.getElementById('loc-modal-save-btn');
    btn.disabled = true;
    const payload = { name: document.getElementById('f-loc-name').value.trim() };
    try {
        let resp;
        if (editingLocId) {
            resp = await fetch(`${BASE_URL}/admin/api/locations/${editingLocId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/locations`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) { closeLocationModal(); await loadLocations(); showToast(editingLocId ? 'Обновлено' : 'Добавлено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
    btn.disabled = false;
}

function openConfirmLoc(id, name) {
    deletingLocId = id;
    deletingId = null;
    deletingOrgId = null;
    document.getElementById('confirm-text').textContent = `Локация «${name}» будет удалена.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

async function confirmDeleteLoc() {
    if (!deletingLocId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/locations/${deletingLocId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadLocations(); showToast('Удалено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
