// ─── ВКС ─────────────────────────────────────────────────────────────

let allEvents = [];
let editingEventId = null;
let deletingEventId = null;
let pendingFiles = [];
let removedDocIds = [];
let _pendingVksFilter = null;

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
    if (!allEvents.length) {
        await loadAllEvents();
    }
    populateVksFilters();
    updateVksStats();
    const board = document.getElementById('vks-board-active');
    if (board) renderVksBoard('vks-board-active', 'active');

    // Apply pending filter from dashboard
    if (_pendingVksFilter) {
        const f = _pendingVksFilter;
        _pendingVksFilter = null;
        // Reset quick filter state first
        _quickFilter = '';
        const dateInput = document.getElementById('f-vks-active-date');
        if (dateInput) dateInput.value = '';
        document.getElementById('f-vks-active-org').value = '';
        document.getElementById('f-vks-active-loc').value = '';
        document.getElementById('f-vks-active-desc').value = '';

        const tryApply = (retries) => {
            const b = document.getElementById('vks-board-active');
            if (!b || !b.children.length || b.querySelector('.empty-state')) {
                if (retries > 0) { setTimeout(() => tryApply(retries - 1), 200); return; }
            }
            // Apply the filter
            if (f === 'active') {
                _quickFilter = 'active';
            } else if (f === 'missed') {
                _quickFilter = 'missed';
            } else if (f === 'today') {
                _quickFilter = 'today';
                if (dateInput) dateInput.value = _getLocalDateStr(new Date());
            } else if (f === 'soon') {
                _quickFilter = 'soon';
            }
            // Highlight the correct stat card
            document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
            if (_quickFilter) {
                const idx = { all: 0, today: 1, soon: 2, missed: 3, active: 4 }[_quickFilter];
                const cards = document.querySelectorAll('#vks-active-stats .stat-card');
                if (cards[idx]) cards[idx].classList.add('active');
            }
            // Handle location filter
            if (f.startsWith('location:')) {
                const locId = f.split(':')[1];
                const locSel = document.getElementById('f-vks-active-loc');
                if (locSel) locSel.value = locId;
            }
            renderVksBoard('vks-board-active', 'active');
            showFilterBanner(f);
        };
        setTimeout(() => tryApply(15), 300);
    }
}

function showFilterBanner(filter) {
    const existing = document.getElementById('vks-filter-banner');
    if (existing) existing.remove();
    if (!filter) return;

    const page = document.getElementById('page-vks-active');
    if (!page) return;

    let text = '';
    if (filter === 'active') text = 'Фильтр: Активные (без пропущенных)';
    else if (filter === 'today') text = 'Фильтр: Сегодня';
    else if (filter === 'soon') text = 'Фильтр: Скоро';
    else if (filter === 'missed') text = 'Фильтр: Пропущенные';
    else if (filter === 'all') text = 'Фильтр: Все';
    else if (filter.startsWith('location:')) {
        const locId = filter.split(':')[1];
        const loc = (window.allLocations || []).find(l => l.id === locId);
        text = `Фильтр: Локация — ${loc ? loc.name : locId}`;
    }
    if (!text) return;

    const banner = document.createElement('div');
    banner.id = 'vks-filter-banner';
    banner.className = 'vks-filter-banner';
    banner.innerHTML = `
        <span>${text}</span>
        <button onclick="clearVksFilter()" class="vks-filter-clear">&times;</button>
    `;
    page.querySelector('.page-header').after(banner);
}

function clearVksFilter() {
    const banner = document.getElementById('vks-filter-banner');
    if (banner) banner.remove();
    _quickFilter = '';
    const dateInput = document.getElementById('f-vks-active-date');
    if (dateInput) dateInput.value = '';
    document.getElementById('f-vks-active-org').value = '';
    document.getElementById('f-vks-active-loc').value = '';
    document.getElementById('f-vks-active-desc').value = '';
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
    renderVksBoard('vks-board-active', 'active');
}

function _getLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function updateVksStats() {
    const active = allEvents.filter(e => !e.completed);
    const now = new Date();
    const today = _getLocalDateStr(now);

    let total = active.length;
    let todayCount = 0;
    let soonCount = 0;
    let missedCount = 0;

    active.forEach(e => {
        if (!e.date) { missedCount++; return; }
        if (e.date < today) { missedCount++; }
        else if (e.date === today) { todayCount++; }
        else { soonCount++; }
    });

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-vks-total', total);
    set('stat-vks-today', todayCount);
    set('stat-vks-soon', soonCount);
    set('stat-vks-missed', missedCount);
}

let _quickFilter = '';

function filterVksByQuick(type) {
    const dateInput = document.getElementById('f-vks-active-date');
    if (_quickFilter === type) {
        _quickFilter = '';
        dateInput.value = '';
    } else {
        _quickFilter = type;
        const now = new Date();
        if (type === 'today') {
            dateInput.value = _getLocalDateStr(now);
        } else if (type === 'soon') {
            dateInput.value = '';
        } else if (type === 'missed') {
            dateInput.value = '';
        } else {
            dateInput.value = '';
        }
    }
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(card => card.classList.remove('active'));
    if (_quickFilter) {
        const idx = { all: 0, today: 1, soon: 2, missed: 3 }[type];
        const cards = document.querySelectorAll('#vks-active-stats .stat-card');
        if (cards[idx]) cards[idx].classList.add('active');
    }
    renderVksBoard('vks-board-active', 'active');
}

async function loadVksCompleted() {
    if (!allEvents.length) {
        await loadAllEvents();
    }
    populateVksFilters();
    const board = document.getElementById('vks-board-completed');
    if (board) renderVksBoard('vks-board-completed', 'completed');
}

function renderVksBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;

    const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
    const dateVal = document.getElementById(`${prefix}-date`)?.value || '';
    const orgVal = document.getElementById(`${prefix}-org`)?.value || '';
    const locVal = document.getElementById(`${prefix}-loc`)?.value || '';
    const descVal = (document.getElementById(`${prefix}-desc`)?.value || '').toLowerCase();

    let events = [...allEvents];

    if (filter === 'active') {
        events = events.filter(e => !e.completed);
    } else if (filter === 'completed') {
        events = events.filter(e => e.completed);
    }

    if (dateVal) events = events.filter(e => e.date === dateVal);
    if (orgVal) events = events.filter(e => e.organizer_id === orgVal);
    if (locVal) events = events.filter(e => e.location_id === locVal);
    if (descVal) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(descVal) ||
            (e.url || '').toLowerCase().includes(descVal)
        );
    }

    if (_quickFilter && filter === 'active') {
        const now = new Date();
        const today = _getLocalDateStr(now);
        if (_quickFilter === 'today') {
            events = events.filter(e => e.date === today);
        } else if (_quickFilter === 'soon') {
            events = events.filter(e => e.date && e.date > today);
        } else if (_quickFilter === 'missed') {
            events = events.filter(e => !e.date || e.date < today);
        } else if (_quickFilter === 'active') {
            // Only non-missed, non-completed events
            events = events.filter(e => e.date && e.date >= today);
        }
    }

    if (!events.length) {
        board.innerHTML = '<div class="empty-state">Нет событий</div>';
        return;
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    const tomorrow = `${tmr.getFullYear()}-${String(tmr.getMonth()+1).padStart(2,'0')}-${String(tmr.getDate()).padStart(2,'0')}`;
    const da = new Date(now.getFullYear(), now.getMonth(), now.getDate()+2);
    const dayAfter = `${da.getFullYear()}-${String(da.getMonth()+1).padStart(2,'0')}-${String(da.getDate()).padStart(2,'0')}`;

    // Разделяем на блоки
    const missed = [];      // Пропущенные (прошедшие, не завершённые)
    const todayEvents = []; // Сегодня
    const tomorrowEvents = []; // Завтра
    const dayAfterEvents = []; // Послезавтра
    const soon = [];        // Остальные будущие

    events.forEach(e => {
        if (!e.date) {
            missed.push(e);
        } else if (e.date < today) {
            missed.push(e);
        } else if (e.date === today) {
            todayEvents.push(e);
        } else if (e.date === tomorrow) {
            tomorrowEvents.push(e);
        } else if (e.date === dayAfter) {
            dayAfterEvents.push(e);
        } else {
            soon.push(e);
        }
    });

    // Сортируем внутри каждого блока по времени
    const sortByTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    missed.sort(sortByTime);
    todayEvents.sort(sortByTime);
    tomorrowEvents.sort(sortByTime);
    dayAfterEvents.sort(sortByTime);
    soon.sort((a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b));

    let html = '';

    // Блок "Пропущенные"
    if (missed.length) {
        html += renderVksBlock('Пропущенные', missed, 'missed');
    }

    // Блок "Сегодня"
    if (todayEvents.length) {
        html += renderVksBlock('Сегодня', todayEvents, 'today');
    }

    // Блок "Завтра"
    if (tomorrowEvents.length) {
        html += renderVksBlock('Завтра', tomorrowEvents, 'tomorrow');
    }

    // Блок "Послезавтра"
    if (dayAfterEvents.length) {
        html += renderVksBlock('Послезавтра', dayAfterEvents, 'day-after');
    }

    // Блок "Скоро"
    if (soon.length) {
        html += renderVksBlock('Скоро', soon, 'soon');
    }

    board.innerHTML = html;
}

function renderVksBlock(title, events, type) {
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">`;
    if (type === 'missed') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'today') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    } else if (type === 'tomorrow') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    } else if (type === 'day-after') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    } else {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    }
    html += `${title} <span class="vks-date-count">${events.length}</span>`;
    html += `</div>`;

    events.forEach(e => {
        html += renderVksCard(e, type);
    });

    html += `</div>`;
    return html;
}

function renderVksCard(e, blockType) {
    const time = e.time || '--:--';
    const date = e.date || '';
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const loc = e.location_id ? getLocationName(e.location_id) : '';
    const docCount = e.documents ? e.documents.length : 0;

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" onclick="openEditEventModal('${e.id}')" style="cursor:pointer">`;
    html += `<div class="vks-card-left">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date);
        const day = d.getDate();
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();
        html += `<div class="vks-card-date">${day} ${month} ${year}</div>`;
    }
    if (blockType === 'missed' && !e.completed) {
        html += `<div class="vks-card-status badge red"><span class="badge-dot"></span>Пропущено</div>`;
    } else if (e.completed) {
        html += `<div class="vks-card-status badge green"><span class="badge-dot"></span>Завершено</div>`;
    } else {
        html += `<div class="vks-card-status badge amber"><span class="badge-dot"></span>В работе</div>`;
    }
    html += `</div>`;
    html += `<div class="vks-card-body">`;
    if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;
    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;
    if (docCount > 0) html += `<span class="vks-tag"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${docCount} док.</span>`;
    html += `</div>`;
    if (e.url) html += `<a class="vks-card-url" href="${esc(e.url)}" target="_blank" onclick="event.stopPropagation()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Открыть ссылку</a>`;
    if (e.documents && e.documents.length) {
        html += `<div class="vks-card-docs">`;
        e.documents.forEach(d => {
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const icon = getDocIcon(ext);
            html += `<div class="vks-doc-item" onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}')" title="Скачать ${esc(d.name)}">${icon}<span>${esc(d.name)}</span>${d.size ? '<span class="vks-doc-size">' + formatSize(d.size) + '</span>' : ''}</div>`;
        });
        html += `</div>`;
    }
    html += `</div>`;
    html += `<div class="vks-card-actions">`;
    html += `<label class="vks-check" onclick="event.stopPropagation()" title="${e.completed ? 'Снять завершение' : 'Завершить'}">`;
    html += `<input type="checkbox" ${e.completed ? 'checked' : ''} onchange="completeEvent('${e.id}', this.checked)">`;
    html += `<span class="vks-check-mark"></span>`;
    html += `</label>`;
    html += `<button class="btn-icon danger" onclick="event.stopPropagation();openConfirmEvent('${e.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
    html += `</div>`;
    html += `</div>`;
    return html;
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
        pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        docx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        xls: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        xlsx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        ppt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 14 12 10 14 14 16 10"/></svg>',
        pptx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 14 12 10 14 14 16 10"/></svg>',
        txt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        zip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 3v6h6"/><rect x="10" y="14" width="4" height="2" rx="0.5"/></svg>',
        rar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 3v6h6"/><rect x="10" y="14" width="4" height="2" rx="0.5"/></svg>',
        jpg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        png: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    };
    return icons[ext] || icons.txt;
}

function filterVksListActive() {
    renderVksBoard('vks-board-active', 'active');
}

function filterVksListCompleted() {
    renderVksBoard('vks-board-completed', 'completed');
}

function resetVksActiveFilters() {
    document.getElementById('f-vks-active-date').value = '';
    document.getElementById('f-vks-active-org').value = '';
    document.getElementById('f-vks-active-loc').value = '';
    document.getElementById('f-vks-active-desc').value = '';
    _quickFilter = '';
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
    filterVksListActive();
}

function resetVksCompletedFilters() {
    document.getElementById('f-vks-completed-date').value = '';
    document.getElementById('f-vks-completed-org').value = '';
    document.getElementById('f-vks-completed-loc').value = '';
    document.getElementById('f-vks-completed-desc').value = '';
    filterVksListCompleted();
}

// ─── Модалка события ──────────────────────────────────────────────────

async function openAddEventModal() {
    editingEventId = null;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Добавить ВКС';
    document.getElementById('event-modal-delete-btn').style.display = 'none';
    document.getElementById('event-modal-completed-group').style.display = 'none';
    document.getElementById('f-event-completed').checked = false;
    const now = new Date();
    document.getElementById('f-event-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    document.getElementById('f-event-time').value = '';
    document.getElementById('f-event-url').value = '';
    document.getElementById('f-event-desc').value = '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = '';
    document.getElementById('f-event-location').value = '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();
    document.getElementById('event-modal').classList.add('show');
}

async function openEditEventModal(id) {
    const e = allEvents.find(x => x.id === id);
    if (!e) return;
    editingEventId = id;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Редактировать ВКС';
    document.getElementById('event-modal-delete-btn').style.display = 'inline-flex';
    document.getElementById('event-modal-completed-group').style.display = 'inline-flex';
    document.getElementById('f-event-completed').checked = e.completed;
    document.getElementById('f-event-date').value = e.date || '';
    document.getElementById('f-event-time').value = e.time || '';
    document.getElementById('f-event-url').value = e.url || '';
    document.getElementById('f-event-desc').value = e.description || '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = e.organizer_id || '';
    document.getElementById('f-event-location').value = e.location_id || '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();
    document.getElementById('event-modal').classList.add('show');
}

function closeEventModal() {
    document.getElementById('event-modal').classList.remove('show');
    pendingFiles = [];
    removedDocIds = [];
}

function confirmDeleteFromModal() {
    if (!editingEventId) return;
    const e = allEvents.find(x => x.id === editingEventId);
    const desc = e ? (e.description || 'без описания') : '';
    document.getElementById('confirm-text').textContent = `Удалить ВКС «${desc}»? Это действие нельзя отменить.`;
    deletingEventId = editingEventId;
    document.getElementById('confirm-overlay').classList.add('show');
}

function refreshEventDocs() {
    const docsContainer = document.getElementById('f-event-docs');

    const existing = (editingEventId)
        ? (allEvents.find(x => x.id === editingEventId)?.documents || [])
            .filter(d => !removedDocIds.includes(d.id))
        : [];

    const all = [
        ...existing.map(d => ({ id: d.id, name: d.name, size: d.size, pending: false })),
        ...pendingFiles.map((f, i) => ({ id: `pending-${i}`, name: f.name, size: f.size, pending: true }))
    ];

    if (all.length) {
        docsContainer.innerHTML = all.map(d => {
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const icon = getDocIcon(ext);
            const action = d.pending
                ? `<button class="event-doc-delete" onclick="event.stopPropagation();removePendingFile('${d.id}')" title="Убрать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`
                : `<button class="event-doc-delete" onclick="event.stopPropagation();removeExistingDoc('${d.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`;
            const clickAttr = d.pending ? '' : `onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}')"`;
            return `<div class="event-doc-item ${d.pending ? '' : 'event-doc-downloadable'}" ${clickAttr}>${icon}<span class="event-doc-name">${esc(d.name)}</span>${d.size ? '<span class="event-doc-size">' + formatSize(d.size) + '</span>' : ''}${d.pending ? '<span class="event-doc-pending">новый</span>' : ''}${action}</div>`;
        }).join('');
    } else {
        docsContainer.innerHTML = '<div class="event-docs-empty">Нет документов</div>';
    }
}

function addPendingFiles(fileList) {
    for (const f of fileList) {
        pendingFiles.push(f);
    }
    refreshEventDocs();
}

function removePendingFile(id) {
    const idx = parseInt(id.replace('pending-', ''), 10);
    pendingFiles.splice(idx, 1);
    refreshEventDocs();
}

function removeExistingDoc(docId) {
    removedDocIds.push(docId);
    refreshEventDocs();
}

async function downloadDoc(docId, fileName) {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/documents/${docId}/download`);
        if (!resp.ok) { showToast('Ошибка скачивания', 'error'); return; }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function loadEventSelects() {
    await ensureOrgsAndLocs();

    const orgSelect = document.getElementById('f-event-organizer');
    const locSelect = document.getElementById('f-event-location');

    orgSelect.innerHTML = '<option value="">Не указан</option>' +
        (window.allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');

    locSelect.innerHTML = '<option value="">Не указана</option>' +
        (window.allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

    // Заполнить фильтры VKS
    populateVksFilters();
}

function populateVksFilters() {
    const orgOptions = '<option value="">Все</option>' +
        (window.allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');
    const locOptions = '<option value="">Все</option>' +
        (window.allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

    ['f-vks-active-org', 'f-vks-completed-org'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = orgOptions;
    });
    ['f-vks-active-loc', 'f-vks-completed-loc'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = locOptions;
    });
}

async function saveEvent() {
    const btn = document.getElementById('event-modal-save-btn');
    btn.disabled = true;

    const date = document.getElementById('f-event-date').value;
    const time = document.getElementById('f-event-time').value;
    const organizer = document.getElementById('f-event-organizer').value;
    const location = document.getElementById('f-event-location').value;

    if (!date) { showToast('Укажите дату', 'error'); btn.disabled = false; return; }
    if (!time) { showToast('Укажите время', 'error'); btn.disabled = false; return; }
    if (!organizer) { showToast('Выберите организатора', 'error'); btn.disabled = false; return; }
    if (!location) { showToast('Выберите локацию', 'error'); btn.disabled = false; return; }

    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
    const formData = new FormData();
    formData.append('date', date);
    formData.append('time', time);
    formData.append('organizer_id', organizer);
    formData.append('location_id', location);
    formData.append('url', document.getElementById('f-event-url').value.trim());
    formData.append('description', document.getElementById('f-event-desc').value.trim());
    formData.append('completed', document.getElementById('f-event-completed').checked ? 'true' : 'false');
    formData.append('csrf_token', csrfToken);

    if (editingEventId) {
        const existing = allEvents.find(x => x.id === editingEventId)?.documents || [];
        const keepIds = existing.filter(d => !removedDocIds.includes(d.id)).map(d => d.id);
        formData.append('keep_doc_ids', keepIds.join(','));
    }

    for (const f of pendingFiles) {
        formData.append('files', f, f.name);
    }

    try {
        let resp;
        if (editingEventId) {
            resp = await fetch(`${BASE_URL}/admin/api/events/${editingEventId}`, {
                method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, body: formData
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/events`, {
                method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData
            });
        }
        const data = await resp.json();
        if (data.ok) {
            const wasEditing = !!editingEventId;
            closeEventModal();
            await loadAllEvents();
            const activeBoard = document.getElementById('vks-board-active');
            const completedBoard = document.getElementById('vks-board-completed');
            if (activeBoard) renderVksBoard('vks-board-active', 'active');
            if (completedBoard) renderVksBoard('vks-board-completed', 'completed');
            // Refresh dashboard if visible
            if (typeof _dashEvents !== 'undefined' && document.getElementById('page-dashboard')?.classList.contains('active')) {
                _dashEvents = [...allEvents];
                try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, locations: _dashLocations, organizers: _dashOrganizers })); } catch(e) {}
                renderDashboard();
            }
            showToast(wasEditing ? 'ВКС обновлено' : 'ВКС добавлено', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
}

async function completeEvent(id, checked) {
    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ completed: checked, csrf_token: csrfToken })
        });
        const data = await resp.json();
        if (data.ok) {
            await loadAllEvents();
            renderVksBoard('vks-board-active', 'active');
            renderVksBoard('vks-board-completed', 'completed');
            if (typeof _dashEvents !== 'undefined' && document.getElementById('page-dashboard')?.classList.contains('active')) {
                _dashEvents = [...allEvents];
                try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, locations: _dashLocations, organizers: _dashOrganizers })); } catch(e) {}
                renderDashboard();
            }
            showToast(checked ? 'ВКС завершено' : 'ВКС восстановлено', 'success');
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
    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${deletingEventId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csrf_token: csrfToken })
        });
        const data = await resp.json();
        if (data.ok) {
            closeConfirm();
            closeEventModal();
            await loadAllEvents();
            renderVksBoard('vks-board-active', 'active');
            renderVksBoard('vks-board-completed', 'completed');
            if (typeof _dashEvents !== 'undefined' && document.getElementById('page-dashboard')?.classList.contains('active')) {
                _dashEvents = [...allEvents];
                try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, locations: _dashLocations, organizers: _dashOrganizers })); } catch(e) {}
                renderDashboard();
            }
            showToast('Удалено', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
