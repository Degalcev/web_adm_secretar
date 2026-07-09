// ─── Локации ─────────────────────────────────────────────────────────

let allLocations = [];
let editingLocId = null;

async function loadLocations() {
    const tbody = document.getElementById('locations-tbody');
    tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Загрузка...</td></tr>';
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/locations`);
        if (resp.status === 401) { showLogin(); return; }
        allLocations = await resp.json();
        renderLocations(allLocations);
        document.getElementById('stat-total-loc').textContent = allLocations.length;
        document.getElementById('stat-shown-loc').textContent = allLocations.length;
    } catch (e) {
        showToast('Ошибка загрузки локаций', 'error');
    }
}

function renderLocations(items) {
    const tbody = document.getElementById('locations-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Нет локаций</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(l => `
        <tr onclick="openEditLocationModal('${l.id}')" style="cursor:pointer">
            <td>${esc(l.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td class="col-actions">
                <div class="actions">
                    <button class="btn-icon danger" onclick="event.stopPropagation();openConfirmLoc('${l.id}','${esc(l.name).replace(/'/g, "\\'")}')" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterLocations() {
    const name = (document.getElementById('f-loc-name')?.value || '').toLowerCase();
    const filtered = allLocations.filter(l =>
        (l.name || '').toLowerCase().includes(name)
    );
    renderLocations(filtered);
    document.getElementById('stat-shown-loc').textContent = filtered.length;
}

function resetLocFilters() {
    document.getElementById('f-loc-name').value = '';
    filterLocations();
}

async function openAddLocationModal() {
    if (window._modalsLoaded) await window._modalsLoaded;
    editingLocId = null;
    document.getElementById('loc-modal-title').textContent = 'Добавить локацию';
    document.getElementById('f-loc-name-modal').value = '';
    document.getElementById('location-modal').classList.add('show');
}

async function openEditLocationModal(id) {
    if (window._modalsLoaded) await window._modalsLoaded;
    const l = allLocations.find(x => x.id === id);
    if (!l) return;
    editingLocId = id;
    document.getElementById('loc-modal-title').textContent = 'Редактировать локацию';
    document.getElementById('f-loc-name-modal').value = l.name || '';
    document.getElementById('location-modal').classList.add('show');
}

function closeLocationModal() {
    document.getElementById('location-modal').classList.remove('show');
}

async function saveLocation() {
    const btn = document.getElementById('loc-modal-save-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    const origText = btn.textContent;
    btn.textContent = 'Сохранение...';
    const payload = { name: document.getElementById('f-loc-name-modal').value.trim() };
    try {
        const csrfToken = getCsrfToken();
        let resp;
        if (editingLocId) {
            resp = await fetch(`${BASE_URL}/admin/api/locations/${editingLocId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/locations`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) { await loadLocations(); closeLocationModal(); showToast(editingLocId ? 'Обновлено' : 'Добавлено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = origText;
}

function openConfirmLoc(id, name) {
    ConfirmManager.open('location', id, name, deleteLocation);
}

async function deleteLocation(id) {
    try {
        const csrfToken = getCsrfToken();
        const resp = await fetch(`${BASE_URL}/admin/api/locations/${id}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const data = await resp.json();
        if (data.ok) { ConfirmManager.close(); await loadLocations(); showToast('Удалено', 'success'); }
        else { ConfirmManager.close(); showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { ConfirmManager.close(); showToast('Ошибка сети', 'error'); }
}
