// ─── Организаторы ────────────────────────────────────────────────────

const organizers = createCrudModule({
    name: 'организатора',
    api: '/admin/api/organizers',
    storeKey: 'allOrganizers',
    confirmType: 'organizer',
    modalId: 'organizer-modal',
    titleId: 'org-modal-title',
    saveBtnId: 'org-modal-save-btn',
    _items: [],
    fields: [
        { id: 'f-org-name-modal', key: 'name', default: '' },
        { id: 'f-org-short-name', key: 'short_name', default: '' },
        { id: 'f-org-base-url', key: 'base_url', default: '' }
    ],
    stats(items) {
        document.getElementById('stat-total-org').textContent = items.length;
        document.getElementById('stat-shown-org').textContent = items.length;
    },
    filters: [
        { inputId: 'f-org-name', key: 'name' },
        { inputId: 'f-org-short', key: 'short_name' },
        { inputId: 'f-org-url', key: 'base_url' }
    ],
    render(items) {
        const tbody = document.getElementById('organizers-tbody');
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет организаторов</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(o => `
            <tr onclick="organizers.openEdit('${o.id}')" style="cursor:pointer">
                <td>${esc(o.name) || '<span style="color:var(--muted)">—</span>'}</td>
                <td class="col-mono">${esc(o.short_name) || '—'}</td>
                <td class="col-mono" style="font-size:0.75rem">${esc(o.base_url) || '—'}</td>
                <td class="col-actions">
                    <div class="actions">
                        <button class="btn-icon danger" onclick="event.stopPropagation();organizers.openConfirm('${o.id}','${esc(o.name).replace(/'/g, "\\'")}')" title="Удалить">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
});

// Обратная совместимость — глобальные функции
async function loadOrganizers() { return organizers.load(); }
function renderOrganizers(items) { organizers.render(items); }
function filterOrganizers() { organizers.filter(); }
function resetOrgFilters() { organizers.resetFilters(); }
async function openAddOrganizerModal() { return organizers.openAdd(); }
async function openEditOrganizerModal(id) { return organizers.openEdit(id); }
function closeOrganizerModal() { organizers.closeModal(); }
async function saveOrganizer() { return organizers.save(); }
function openConfirmOrg(id, name) { organizers.openConfirm(id, name); }
async function deleteOrganizer(id) { return organizers.delete(id); }
