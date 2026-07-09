// ─── Локации ─────────────────────────────────────────────────────────

const locations = createCrudModule({
    name: 'локацию',
    api: '/admin/api/locations',
    storeKey: 'allLocations',
    confirmType: 'location',
    modalId: 'location-modal',
    titleId: 'loc-modal-title',
    saveBtnId: 'loc-modal-save-btn',
    _items: [],
    fields: [
        { id: 'f-loc-name-modal', key: 'name', default: '' }
    ],
    stats(items) {
        document.getElementById('stat-total-loc').textContent = items.length;
        document.getElementById('stat-shown-loc').textContent = items.length;
    },
    filters: [
        { inputId: 'f-loc-name', key: 'name' }
    ],
    render(items) {
        const tbody = document.getElementById('locations-tbody');
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Нет локаций</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(l => `
            <tr onclick="locations.openEdit('${l.id}')" style="cursor:pointer">
                <td>${esc(l.name) || '<span style="color:var(--muted)">—</span>'}</td>
                <td class="col-actions">
                    <div class="actions">
                        <button class="btn-icon danger" onclick="event.stopPropagation();locations.openConfirm('${l.id}','${esc(l.name).replace(/'/g, "\\'")}')" title="Удалить">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
});

// Обратная совместимость — глобальные функции вызываются из HTML onclick
async function loadLocations() { return locations.load(); }
function renderLocations(items) { locations.render(items); }
function filterLocations() { locations.filter(); }
function resetLocFilters() { locations.resetFilters(); }
async function openAddLocationModal() { return locations.openAdd(); }
async function openEditLocationModal(id) { return locations.openEdit(id); }
function closeLocationModal() { locations.closeModal(); }
async function saveLocation() { return locations.save(); }
function openConfirmLoc(id, name) { locations.openConfirm(id, name); }
async function deleteLocation(id) { return locations.delete(id); }
