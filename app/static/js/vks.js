// ─── ВКС ─────────────────────────────────────────────────────────────

let allEvents = [];
let editingEventId = null;
let currentVksFilter = '';

async function loadEvents() {
    const board = document.getElementById('vks-board');
    board.innerHTML = '<div class="empty-state">Загрузка...</div>';

    const resp = await fetch(`${BASE_URL}/admin/api/events`);
    if (resp.status === 401) { showLogin(); return; }
    allEvents = await resp.json();
    updateVksStats();
    renderVksBoard();
}

function updateVksStats() {
    const active = allEvents.filter(e => !e.completed);
    const completed = allEvents.filter(e => e.completed);
    document.getElementById('stat-total-vks').textContent = allEvents.length;
    document.getElementById('stat-active-vks').textContent = active.length;
    document.getElementById('stat-completed-vks').textContent = completed.length;
}

function renderVksBoard() {
    const board = document.getElementById('vks-board');
    const q = (document.getElementById('search-vks')?.value || '').toLowerCase();

    let events = [...allEvents];

    if (currentVksFilter === 'active') {
        events = events.filter(e => !e.completed);
    } else if (currentVksFilter === 'completed') {
        events = events.filter(e => e.completed);
    }

    if (q) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(q) ||
            (e.url || '').toLowerCase().includes(q)
        );
    }

    // Группировка по дате
    const grouped = {};
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    events.forEach(e => {
        const dateKey = e.date || 'Без даты';
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(e);
    });

    if (!events.length) {
        board.innerHTML = '<div class="empty-state">Нет событий</div>';
        return;
    }

    let html = '';
    const sortedDates = Object.keys(grouped).sort((a, b) => {
        if (a === 'Без даты') return 1;
        if (b === 'Без даты') return -1;
        return currentVksFilter === 'completed' ? b.localeCompare(a) : a.localeCompare(b);
    });

    sortedDates.forEach(dateKey => {
        let label = dateKey;
        if (dateKey === today) label = 'Сегодня';
        else if (dateKey === tomorrow) label = 'Завтра';

        html += `<div class="vks-date-group">`;
        html += `<div class="vks-date-header">${label} <span class="vks-date-count">${grouped[dateKey].length}</span></div>`;

        grouped[dateKey].forEach(e => {
            const time = e.time || '--:--';
            const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
            const loc = e.location_id ? getLocationName(e.location_id) : '';

            html += `<div class="vks-card ${e.completed ? 'completed' : ''}">`;
            html += `<div class="vks-card-time">${time}</div>`;
            html += `<div class="vks-card-body">`;
            if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;
            if (org || loc) html += `<div class="vks-card-meta">${org ? '<span class="vks-tag">' + esc(org) + '</span>' : ''}${loc ? '<span class="vks-tag">' + esc(loc) + '</span>' : ''}</div>`;
            if (e.url) html += `<a class="vks-card-url" href="${esc(e.url)}" target="_blank">Ссылка</a>`;
            html += `</div>`;
            html += `<div class="vks-card-actions">`;
            html += `<button class="btn-icon" onclick="openEditEventModal('${e.id}')" title="Изменить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
            if (!e.completed) {
                html += `<button class="btn-icon" onclick="completeEvent('${e.id}')" title="Завершить" style="color:var(--success)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
            }
            html += `<button class="btn-icon danger" onclick="openConfirmEvent('${e.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
            html += `</div>`;
            html += `</div>`;
        });

        html += `</div>`;
    });

    board.innerHTML = html;
}

function getOrganizerName(id) {
    const o = (typeof allOrganizers !== 'undefined') ? allOrganizers.find(x => x.id === id) : null;
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (typeof allLocations !== 'undefined') ? allLocations.find(x => x.id === id) : null;
    return l ? l.name : '';
}

function filterVksEvents(status) {
    currentVksFilter = status;
    document.querySelectorAll('#page-vks .stat-card').forEach(c => c.classList.remove('active'));
    if (status && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    renderVksBoard();
}

function filterVksList() {
    renderVksBoard();
}

// ─── Модалка события ──────────────────────────────────────────────────

async function openAddEventModal() {
    editingEventId = null;
    document.getElementById('event-modal-title').textContent = 'Добавить ВКС';
    document.getElementById('f-event-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('f-event-time').value = '';
    document.getElementById('f-event-url').value = '';
    document.getElementById('f-event-desc').value = '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = '';
    document.getElementById('f-event-location').value = '';
    document.getElementById('event-modal').classList.add('show');
}

async function openEditEventModal(id) {
    const e = allEvents.find(x => x.id === id);
    if (!e) return;
    editingEventId = id;
    document.getElementById('event-modal-title').textContent = 'Редактировать ВКС';
    document.getElementById('f-event-date').value = e.date || '';
    document.getElementById('f-event-time').value = e.time || '';
    document.getElementById('f-event-url').value = e.url || '';
    document.getElementById('f-event-desc').value = e.description || '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = e.organizer_id || '';
    document.getElementById('f-event-location').value = e.location_id || '';
    document.getElementById('event-modal').classList.add('show');
}

function closeEventModal() {
    document.getElementById('event-modal').classList.remove('show');
}

async function loadEventSelects() {
    if (typeof allOrganizers === 'undefined' || !allOrganizers.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/organizers`);
            if (resp.ok) window.allOrganizers = await resp.json();
        } catch (e) { /* ignore */ }
    }
    if (typeof allLocations === 'undefined' || !allLocations.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/locations`);
            if (resp.ok) window.allLocations = await resp.json();
        } catch (e) { /* ignore */ }
    }

    const orgSelect = document.getElementById('f-event-organizer');
    const locSelect = document.getElementById('f-event-location');

    orgSelect.innerHTML = '<option value="">Не указан</option>' +
        (allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');

    locSelect.innerHTML = '<option value="">Не указана</option>' +
        (allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
}

async function saveEvent() {
    const btn = document.getElementById('event-modal-save-btn');
    btn.disabled = true;

    const payload = {
        date: document.getElementById('f-event-date').value,
        time: document.getElementById('f-event-time').value || null,
        organizer_id: document.getElementById('f-event-organizer').value || null,
        location_id: document.getElementById('f-event-location').value || null,
        url: document.getElementById('f-event-url').value.trim(),
        description: document.getElementById('f-event-desc').value.trim(),
    };

    try {
        let resp;
        if (editingEventId) {
            resp = await fetch(`${BASE_URL}/admin/api/events/${editingEventId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/events`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) {
            closeEventModal();
            await loadEvents();
            showToast(editingEventId ? 'ВКС обновлено' : 'ВКС добавлено', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
}

async function completeEvent(id) {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true })
        });
        const data = await resp.json();
        if (data.ok) {
            await loadEvents();
            showToast('ВКС завершено', 'success');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

function openConfirmEvent(id) {
    deletingId = null;
    deletingOrgId = null;
    deletingLocId = null;
    deletingEventId = id;
    document.getElementById('confirm-text').textContent = 'Событие ВКС будет удалено.';
    document.getElementById('confirm-overlay').classList.add('show');
}

let deletingEventId = null;

async function confirmDeleteEvent() {
    if (!deletingEventId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${deletingEventId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadEvents(); showToast('Удалено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
