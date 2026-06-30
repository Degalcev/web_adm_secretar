// ─── ВКС ─────────────────────────────────────────────────────────────

let allEvents = [];
let editingEventId = null;
let deletingEventId = null;

async function ensureOrgsAndLocs() {
    if (!window.allOrganizers || !window.allOrganizers.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/organizers`);
            if (resp.ok) window.allOrganizers = await resp.json();
        } catch (e) { window.allOrganizers = []; }
    }
    if (!window.allLocations || !window.allLocations.length) {
        try {
            const resp = await fetch(`${BASE_URL}/admin/api/locations`);
            if (resp.ok) window.allLocations = await resp.json();
        } catch (e) { window.allLocations = []; }
    }
}

async function loadAllEvents() {
    await ensureOrgsAndLocs();
    const resp = await fetch(`${BASE_URL}/admin/api/events`);
    if (resp.status === 401) { showLogin(); return; }
    allEvents = await resp.json();
}

async function loadVksActive() {
    await loadAllEvents();
    const board = document.getElementById('vks-board-active');
    if (board) renderVksBoard('vks-board-active', 'active');
}

async function loadVksCompleted() {
    await loadAllEvents();
    const board = document.getElementById('vks-board-completed');
    if (board) renderVksBoard('vks-board-completed', 'completed');
}

function renderVksBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;

    const searchId = boardId === 'vks-board-active' ? 'search-vks-active' : 'search-vks-completed';
    const q = (document.getElementById(searchId)?.value || '').toLowerCase();

    let events = [...allEvents];

    if (filter === 'active') {
        events = events.filter(e => !e.completed);
    } else if (filter === 'completed') {
        events = events.filter(e => e.completed);
    }

    if (q) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(q) ||
            (e.url || '').toLowerCase().includes(q)
        );
    }

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
        return filter === 'completed' ? b.localeCompare(a) : a.localeCompare(b);
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

            html += `<div class="vks-card ${e.completed ? 'completed' : ''}" onclick="openEditEventModal('${e.id}')" style="cursor:pointer">`;
            html += `<div class="vks-card-time">${time}</div>`;
            html += `<div class="vks-card-body">`;
            if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;
            if (org || loc) html += `<div class="vks-card-meta">${org ? '<span class="vks-tag">' + esc(org) + '</span>' : ''}${loc ? '<span class="vks-tag">' + esc(loc) + '</span>' : ''}</div>`;
            if (e.url) html += `<a class="vks-card-url" href="${esc(e.url)}" target="_blank" onclick="event.stopPropagation()">Ссылка</a>`;
            if (e.documents && e.documents.length) {
                html += `<div class="vks-card-docs">`;
                e.documents.forEach(d => {
                    const ext = (d.name || '').split('.').pop().toLowerCase();
                    const icon = getDocIcon(ext);
                    html += `<span class="vks-tag">${icon} ${esc(d.name)}${d.size ? ' (' + formatSize(d.size) + ')' : ''}</span>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
            html += `<div class="vks-card-actions">`;
            if (!e.completed) {
                html += `<button class="btn-icon" onclick="event.stopPropagation();completeEvent('${e.id}')" title="Завершить" style="color:var(--success)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
            }
            html += `<button class="btn-icon danger" onclick="event.stopPropagation();openConfirmEvent('${e.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
            html += `</div>`;
            html += `</div>`;
        });

        html += `</div>`;
    });

    board.innerHTML = html;
}

function getOrganizerName(id) {
    const o = (window.allOrganizers || []).find(x => x.id === id);
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (window.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}

function getDocIcon(ext) {
    const icons = {
        pdf: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        doc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        docx: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        xls: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        xlsx: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        ppt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        pptx: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        txt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        zip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 3v6h6"/></svg>',
    };
    return icons[ext] || icons.txt;
}

function filterVksListActive() {
    renderVksBoard('vks-board-active', 'active');
}

function filterVksListCompleted() {
    renderVksBoard('vks-board-completed', 'completed');
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

    // Загрузка документов
    const docsGroup = document.getElementById('f-event-docs-group');
    const docsContainer = document.getElementById('f-event-docs');
    if (e.documents && e.documents.length) {
        docsGroup.style.display = 'block';
        docsContainer.innerHTML = e.documents.map(d => {
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const icon = getDocIcon(ext);
            return `<div class="event-doc-item">${icon}<span class="event-doc-name">${esc(d.name)}</span>${d.size ? '<span class="event-doc-size">' + formatSize(d.size) + '</span>' : ''}</div>`;
        }).join('');
    } else {
        docsGroup.style.display = 'none';
        docsContainer.innerHTML = '';
    }

    document.getElementById('event-modal').classList.add('show');
}

function closeEventModal() {
    document.getElementById('event-modal').classList.remove('show');
}

async function loadEventSelects() {
    await ensureOrgsAndLocs();

    const orgSelect = document.getElementById('f-event-organizer');
    const locSelect = document.getElementById('f-event-location');

    orgSelect.innerHTML = '<option value="">Не указан</option>' +
        (window.allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');

    locSelect.innerHTML = '<option value="">Не указана</option>' +
        (window.allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
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
            await loadAllEvents();
            const activeBoard = document.getElementById('vks-board-active');
            const completedBoard = document.getElementById('vks-board-completed');
            if (activeBoard) renderVksBoard('vks-board-active', 'active');
            if (completedBoard) renderVksBoard('vks-board-completed', 'completed');
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
            await loadAllEvents();
            renderVksBoard('vks-board-active', 'active');
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

async function confirmDeleteEvent() {
    if (!deletingEventId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${deletingEventId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) {
            closeConfirm();
            await loadAllEvents();
            renderVksBoard('vks-board-active', 'active');
            renderVksBoard('vks-board-completed', 'completed');
            showToast('Удалено', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
