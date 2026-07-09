// ─── ВКС ─────────────────────────────────────────────────────────────

let allEvents = [];
let editingEventId = null;
let deletingEventId = null;
let pendingFiles = [];
let removedDocIds = [];
let _pendingVksFilter = null;

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function populateDateSelects(prefix) {
    const daySel = document.getElementById(`${prefix}-day`);
    const monthSel = document.getElementById(`${prefix}-month`);
    const yearSel = document.getElementById(`${prefix}-year`);
    if (!daySel || !monthSel || !yearSel) return;

    for (let d = 1; d <= 31; d++) {
        daySel.add(new Option(d, d));
    }
    MONTHS.forEach((m, i) => {
        monthSel.add(new Option(m, i + 1));
    });
    const curYear = new Date().getFullYear();
    for (let y = curYear - 2; y <= curYear + 1; y++) {
        yearSel.add(new Option(y, y));
    }
}

function getDateFilter(prefix) {
    const day = document.getElementById(`${prefix}-day`)?.value || '';
    const month = document.getElementById(`${prefix}-month`)?.value || '';
    const year = document.getElementById(`${prefix}-year`)?.value || '';
    return { day, month, year };
}

function matchDateFilter(eventDate, filter) {
    if (!eventDate) return !filter.day && !filter.month && !filter.year;
    const parts = eventDate.split('-');
    const eYear = parts[0];
    const eMonth = parseInt(parts[1]);
    const eDay = parseInt(parts[2]);
    if (filter.year && eYear !== filter.year) return false;
    if (filter.month && eMonth !== parseInt(filter.month)) return false;
    if (filter.day && eDay !== parseInt(filter.day)) return false;
    return true;
}

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
    populateDateSelects('f-vks-active');
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
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
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
    document.getElementById('f-vks-active-day').value = '';
    document.getElementById('f-vks-active-month').value = '';
    document.getElementById('f-vks-active-year').value = '';
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
    if (_quickFilter === type) {
        _quickFilter = '';
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
    } else {
        _quickFilter = type;
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
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
    populateDateSelects('f-vks-completed');
    populateVksFilters();
    const board = document.getElementById('vks-board-completed');
    if (board) renderVksBoard('vks-board-completed', 'completed');
}

function renderVksBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;

    const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
    const dateFilter = getDateFilter(prefix);
    const orgVal = document.getElementById(`${prefix}-org`)?.value || '';
    const locVal = document.getElementById(`${prefix}-loc`)?.value || '';
    const descVal = (document.getElementById(`${prefix}-desc`)?.value || '').toLowerCase();

    let events = [...allEvents];

    if (filter === 'active') {
        events = events.filter(e => !e.completed);
    } else if (filter === 'completed') {
        events = events.filter(e => e.completed);
    }

    if (dateFilter.day || dateFilter.month || dateFilter.year) {
        events = events.filter(e => matchDateFilter(e.date, dateFilter));
    }
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
    const sortByDateThenTime = (a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b);
    missed.sort(sortByDateThenTime);
    todayEvents.sort(sortByTime);
    tomorrowEvents.sort(sortByTime);
    dayAfterEvents.sort(sortByTime);
    soon.sort(sortByDateThenTime);

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
    const docs = e.documents || [];

    // Stripe class
    let stripeClass = 'active';
    if (blockType === 'missed' && !e.completed) stripeClass = 'missed';
    else if (e.completed) stripeClass = 'completed';

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" onclick="openEditEventModal('${e.id}')" style="cursor:pointer">`;

    // Stripe
    html += `<div class="vks-stripe ${stripeClass}"></div>`;

    html += `<div class="vks-card-content">`;

    // Time block
    html += `<div class="vks-time-block">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date);
        const day = d.getDate();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        html += `<div class="vks-card-date">${day} ${monthNames[d.getMonth()]}</div>`;
    }
    html += `</div>`;

    // Body
    html += `<div class="vks-card-body">`;
    if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;

    // Meta: tags + link
    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag org"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;
    if (e.url) html += `<a class="vks-link-icon" href="${esc(e.url)}" target="_blank" onclick="event.stopPropagation()" title="Открыть ссылку"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    html += `</div>`;

    // Documents: first 3 collapsed + "ещё N" + all expanded
    if (docs.length) {
        const SHOW_FIRST = 3;
        const remaining = docs.length - SHOW_FIRST;

        // Collapsed: first 3 + "ещё N"
        html += `<div class="vks-card-docs vks-docs-collapsed">`;
        docs.slice(0, SHOW_FIRST).forEach(d => {
            html += renderDocChip(d);
        });
        if (remaining > 0) {
            html += `<span class="vks-doc-more" onclick="event.stopPropagation();toggleVksDocs(this)">+${remaining} ещё</span>`;
        }
        html += `</div>`;

        // Expanded: all docs
        if (remaining > 0) {
            html += `<div class="vks-card-docs vks-docs-expanded">`;
            docs.forEach(d => {
                html += renderDocChip(d);
            });
            html += `</div>`;
        }
    }

    html += `</div>`; // vks-card-body

    // Actions
    html += `<div class="vks-card-actions">`;
    html += `<button class="${e.completed ? 'done' : ''}" onclick="event.stopPropagation();confirmCompleteEvent('${e.id}', ${!e.completed})" title="${e.completed ? 'Снять завершение' : 'Завершить'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
    html += `<button class="del" onclick="event.stopPropagation();openConfirmEvent('${e.id}')" title="Удалить"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
    html += `</div>`;

    html += `</div>`; // vks-card-content
    html += `</div>`; // vks-card
    return html;
}

function renderDocChip(d) {
    const ext = (d.name || '').split('.').pop().toLowerCase();
    const icon = getDocIcon(ext);
    return `<a class="vks-doc-chip" href="#" onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}');return false" title="Скачать ${esc(d.name)}">${icon}<span class="vks-doc-chip-name">${esc(d.name)}</span>${d.size ? '<span class="vks-doc-chip-size">' + formatSize(d.size) + '</span>' : ''}</a>`;
}

function toggleVksDocs(btn) {
    const card = btn.closest('.vks-card');
    if (card) card.classList.toggle('docs-expanded');
}

function getOrganizerName(id) {
    const o = (window.allOrganizers || []).find(x => x.id === id);
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (window.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}

function getDocCardMeta(ext) {
    const map = {
        pdf: { cls: 'pdf', label: 'PDF' },
        doc: { cls: 'doc', label: 'DOC' },
        docx: { cls: 'doc', label: 'DOC' },
        xls: { cls: 'xls', label: 'XLS' },
        xlsx: { cls: 'xls', label: 'XLS' },
        ppt: { cls: 'ppt', label: 'PPT' },
        pptx: { cls: 'ppt', label: 'PPT' },
        txt: { cls: 'txt', label: 'TXT' },
        zip: { cls: 'zip', label: 'ZIP' },
        rar: { cls: 'zip', label: 'RAR' },
        jpg: { cls: 'img', label: 'JPG' },
        jpeg: { cls: 'img', label: 'JPG' },
        png: { cls: 'img', label: 'PNG' },
    };
    return map[ext] || { cls: 'default', label: ext.toUpperCase() || 'FILE' };
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
    document.getElementById('f-vks-active-day').value = '';
    document.getElementById('f-vks-active-month').value = '';
    document.getElementById('f-vks-active-year').value = '';
    document.getElementById('f-vks-active-org').value = '';
    document.getElementById('f-vks-active-loc').value = '';
    document.getElementById('f-vks-active-desc').value = '';
    _quickFilter = '';
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
    filterVksListActive();
}

function resetVksCompletedFilters() {
    document.getElementById('f-vks-completed-day').value = '';
    document.getElementById('f-vks-completed-month').value = '';
    document.getElementById('f-vks-completed-year').value = '';
    document.getElementById('f-vks-completed-org').value = '';
    document.getElementById('f-vks-completed-loc').value = '';
    document.getElementById('f-vks-completed-desc').value = '';
    filterVksListCompleted();
}

// ─── Модалка события ──────────────────────────────────────────────────

async function openAddEventModal() {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    editingEventId = null;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Добавить ВКС';
    document.getElementById('event-modal-actions').style.display = 'none';
    document.getElementById('f-event-completed').checked = false;
    // Скрыть элементы режима редактирования
    document.getElementById('event-modal-status').style.display = 'none';
    document.getElementById('event-modal-delete-btn').style.display = 'none';
    document.getElementById('event-modal-audit-btn').style.display = 'none';
    document.getElementById('event-modal-complete-btn').style.display = 'none';
    document.getElementById('event-modal-audit').style.display = 'none';
    document.getElementById('event-url-go').style.display = 'none';
    // Accent bar — по умолчанию
    const accent = document.getElementById('vks-modal-accent');
    accent.className = 'vks-modal-accent';
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
    if (window._vksModalLoaded) await window._vksModalLoaded;
    const e = allEvents.find(x => x.id === id);
    if (!e) return;
    editingEventId = id;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Редактировать ВКС';

    // Показать элементы режима редактирования
    document.getElementById('event-modal-delete-btn').style.display = 'inline-flex';
    document.getElementById('event-modal-complete-btn').style.display = 'inline-flex';

    // Accent bar — цвет по статусу
    const accent = document.getElementById('vks-modal-accent');
    const today = _getLocalDateStr(new Date());
    if (e.completed) {
        accent.className = 'vks-modal-accent status-completed';
    } else if (!e.date || e.date < today) {
        accent.className = 'vks-modal-accent status-missed';
    } else {
        accent.className = 'vks-modal-accent';
    }

    // Статус-бейдж
    const statusEl = document.getElementById('event-modal-status');
    statusEl.style.display = 'inline-flex';
    if (e.completed) {
        statusEl.className = 'modal-event-status status-completed';
        statusEl.innerHTML = '<span class="status-dot"></span>Завершено';
    } else if (!e.date || e.date < today) {
        statusEl.className = 'modal-event-status status-missed';
        statusEl.innerHTML = '<span class="status-dot"></span>Пропущено';
    } else {
        statusEl.className = 'modal-event-status status-active';
        statusEl.innerHTML = '<span class="status-dot"></span>В работе';
    }

    // Кнопка «Завершить» — pill
    const completeBtn = document.getElementById('event-modal-complete-btn');
    const pillLabel = completeBtn.querySelector('.pill-label');
    if (e.completed) {
        completeBtn.classList.add('active');
        if (pillLabel) pillLabel.textContent = 'Завершено';
    } else {
        completeBtn.classList.remove('active');
        if (pillLabel) pillLabel.textContent = 'Завершить';
    }

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

    // Кнопка «Перейти» — показать если есть URL
    const urlGo = document.getElementById('event-url-go');
    if (e.url) {
        urlGo.href = e.url;
        urlGo.style.display = 'inline-flex';
    } else {
        urlGo.style.display = 'none';
    }

    // Кнопка «Инфо» (будущая история изменений)
    const auditBtn = document.getElementById('event-modal-audit-btn');
    if (e.last_changed_by) {
        auditBtn.style.display = 'inline-flex';
        const userName = e.last_changed_by || 'Неизвестно';
        const action = e.last_change_action || '';
        const date = e.last_changed_at ? new Date(e.last_changed_at).toLocaleString('ru-RU') : '';
        const actionText = {
            'create': 'создал',
            'update': 'изменил',
            'complete': 'завершил',
            'delete': 'удалил'
        }[action] || action;
        auditBtn.title = `Последнее изменение: ${userName}, ${date} — ${actionText}`;
    } else {
        auditBtn.style.display = 'none';
    }

    document.getElementById('event-modal').classList.add('show');
}

function closeEventModal() {
    document.getElementById('event-modal').classList.remove('show');
    document.getElementById('event-url-go').style.display = 'none';
    pendingFiles = [];
    removedDocIds = [];
}

function toggleEventComplete() {
    if (!editingEventId) return;
    const cb = document.getElementById('f-event-completed');
    cb.checked = !cb.checked;
    const btn = document.getElementById('event-modal-complete-btn');
    const statusEl = document.getElementById('event-modal-status');
    const pillLabel = btn.querySelector('.pill-label');
    const accent = document.getElementById('vks-modal-accent');
    if (cb.checked) {
        btn.classList.add('active');
        if (pillLabel) pillLabel.textContent = 'Завершено';
        statusEl.className = 'modal-event-status status-completed';
        statusEl.innerHTML = '<span class="status-dot"></span>Завершено';
        accent.className = 'vks-modal-accent status-completed';
    } else {
        btn.classList.remove('active');
        if (pillLabel) pillLabel.textContent = 'Завершить';
        const e = allEvents.find(x => x.id === editingEventId);
        const today = _getLocalDateStr(new Date());
        if (!e || !e.date || e.date < today) {
            statusEl.className = 'modal-event-status status-missed';
            statusEl.innerHTML = '<span class="status-dot"></span>Пропущено';
            accent.className = 'vks-modal-accent status-missed';
        } else {
            statusEl.className = 'modal-event-status status-active';
            statusEl.innerHTML = '<span class="status-dot"></span>В работе';
            accent.className = 'vks-modal-accent';
        }
    }
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
            const meta = getDocCardMeta(ext);
            const deleteBtn = d.pending
                ? `<button class="doc-card-delete" onclick="event.stopPropagation();removePendingFile('${d.id}')" title="Убрать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`
                : `<button class="doc-card-delete" onclick="event.stopPropagation();removeExistingDoc('${d.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`;
            const clickAttr = d.pending ? '' : `onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}')"`;
            const pendingBadge = d.pending ? '<span class="doc-card-pending">новый</span>' : '';
            const sizeText = d.size ? formatSize(d.size) : '';
            const metaParts = [sizeText, pendingBadge].filter(Boolean).join(' · ');
            return `<div class="doc-card-row"><div class="doc-card ${d.pending ? '' : 'event-doc-downloadable'}" ${clickAttr}><div class="doc-card-icon ${meta.cls}">${meta.label}</div><div class="doc-card-info"><div class="doc-card-name">${esc(d.name)}</div>${metaParts ? `<div class="doc-card-meta">${metaParts}</div>` : ''}</div></div>${deleteBtn}</div>`;
        }).join('');
    } else {
        docsContainer.innerHTML = '';
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
    btn.classList.add('loading');
    const origText = btn.textContent;
    btn.textContent = 'Сохранение...';

    const date = document.getElementById('f-event-date').value;
    const time = document.getElementById('f-event-time').value;
    const organizer = document.getElementById('f-event-organizer').value;
    const location = document.getElementById('f-event-location').value;

    if (!date) { showToast('Укажите дату', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!time) { showToast('Укажите время', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!organizer) { showToast('Выберите организатора', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!location) { showToast('Выберите локацию', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }

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
            closeEventModal();
            showToast(wasEditing ? 'ВКС обновлено' : 'ВКС добавлено', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = origText;
}

function confirmCompleteEvent(id, checked) {
    try {
        const e = allEvents.find(x => x.id === id);
        const desc = e ? (e.description || 'без описания') : '';
        const action = checked ? 'завершить' : 'снять завершение с';
        document.getElementById('confirm-text').textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} ВКС «${desc}»?`;
        document.getElementById('confirm-actions').innerHTML = `
            <button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>
            <button class="btn btn-primary" id="confirm-ok-btn">Подтвердить</button>
        `;
        document.getElementById('confirm-cancel-btn').onclick = closeConfirm;
        document.getElementById('confirm-ok-btn').onclick = async function () {
            this.disabled = true;
            const cancelBtn = document.getElementById('confirm-cancel-btn');
            cancelBtn.disabled = true;
            cancelBtn.style.pointerEvents = 'none';
            cancelBtn.style.opacity = '0.5';
            // Спиннер вместо иконки + текст
            const overlay = document.getElementById('confirm-overlay');
            overlay.querySelector('.confirm-icon').innerHTML = '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
            overlay.querySelector('h3').textContent = 'Выполняю...';
            overlay.querySelector('p').textContent = '';
            await completeEvent(id, checked);
            closeConfirm();
        };
        // Меняем заголовок и иконку
        const overlay = document.getElementById('confirm-overlay');
        const icon = overlay.querySelector('.confirm-icon');
        const title = overlay.querySelector('h3');
        const origIconHTML = icon.innerHTML;
        const origTitle = title.textContent;
        icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>';
        icon.style.background = 'rgba(74, 222, 128, 0.1)';
        icon.style.color = 'var(--success)';
        title.textContent = checked ? 'Завершить ВКС?' : 'Снять завершение?';
        overlay.classList.add('show');
        // Восстановить при закрытии
        const observer = new MutationObserver(() => {
            if (!overlay.classList.contains('show')) {
                icon.innerHTML = origIconHTML;
                icon.style.background = '';
                icon.style.color = '';
                title.textContent = origTitle;
                observer.disconnect();
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    } catch (err) {
        console.error('[VKS] confirmCompleteEvent error:', err);
        completeEvent(id, checked);
    }
}

async function completeEvent(id, checked) {
    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
    try {
        const formData = new FormData();
        formData.append('completed', checked ? 'true' : 'false');
        formData.append('csrf_token', csrfToken);
        const resp = await fetch(`${BASE_URL}/admin/api/events/${id}`, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken },
            body: formData
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
            headers: { 'X-CSRF-Token': csrfToken }
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
            closeConfirm();
            closeEventModal();
            showToast('Удалено', 'success');
        } else {
            closeConfirm();
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
