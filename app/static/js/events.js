// ─── Страница мероприятий (VKS-style) ─────────────────────────────

let _eventsCompleted = false;
let _eventsTypeFilter = null;

const EVENT_TYPES = ['Совещание', 'Встреча', 'Заседание', 'Приём'];

function initEventsPage(completed = false) {
    _eventsCompleted = completed;
    _eventsTypeFilter = null;

    const title = document.getElementById('events-page-title');
    if (title) title.textContent = completed ? 'Завершённые мероприятия' : 'Текущие мероприятия';

    _eventsPopulateFilters();
    eventsRenderBoard();
    eventsUpdateStats();
}

let _eventsQuickFilter = '';

function eventsUpdateStats() {
    const active = (store?.allEvents || []).filter(e => !e.completed && e.type !== 'ВКС');
    const now = new Date();
    const today = localDateStr(now);

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
    set('stat-evt-total', total);
    set('stat-evt-today', todayCount);
    set('stat-evt-soon', soonCount);
    set('stat-evt-missed', missedCount);
}

function _eventsPopulateFilters() {
    const orgSel = document.getElementById('f-events-org');
    const locSel = document.getElementById('f-events-loc');
    if (orgSel && store?.allOrganizers) {
        orgSel.innerHTML = '<option value="">Все</option>' +
            store.allOrganizers.map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');
    }
    if (locSel && store?.allLocations) {
        locSel.innerHTML = '<option value="">Все</option>' +
            store.allLocations.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    }

    // Populate date selects (day 1-31, month names, years)
    const daySel = document.getElementById('f-events-day');
    const monthSel = document.getElementById('f-events-month');
    const yearSel = document.getElementById('f-events-year');
    if (daySel && daySel.options.length <= 1) {
        for (let i = 1; i <= 31; i++) daySel.innerHTML += `<option value="${i}">${i}</option>`;
    }
    if (monthSel && monthSel.options.length <= 1) {
        const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        months.forEach((m, i) => { monthSel.innerHTML += `<option value="${i + 1}">${m}</option>`; });
    }
    if (yearSel && yearSel.options.length <= 1) {
        const curYear = new Date().getFullYear();
        for (let y = curYear; y >= curYear - 3; y--) yearSel.innerHTML += `<option value="${y}">${y}</option>`;
    }
}

function eventsFilterType(type) {
    _eventsTypeFilter = type;
    _eventsQuickFilter = '';
    const typeSelect = document.getElementById('f-events-type');
    if (typeSelect) typeSelect.value = type || '';
    _eventsUpdateCardActive();
    eventsRenderBoard();
    eventsUpdateStats();
}

function eventsFilterQuick(type) {
    if (type === 'all') {
        _eventsQuickFilter = '';
    } else {
        _eventsQuickFilter = (_eventsQuickFilter === type) ? '' : type;
    }
    _eventsUpdateCardActive();
    eventsRenderBoard();
}

function _eventsUpdateCardActive() {
    const cards = { all: 'stat-evt-total-card', today: 'stat-evt-today-card', soon: 'stat-evt-soon-card', missed: 'stat-evt-missed-card' };
    Object.values(cards).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    if (_eventsQuickFilter) {
        const activeCard = document.getElementById(cards[_eventsQuickFilter]);
        if (activeCard) activeCard.classList.add('active');
    }
}

function eventsApplyFilters() {
    eventsRenderBoard();
}

function eventsResetFilters() {
    document.getElementById('f-events-type').value = '';
    document.getElementById('f-events-org').value = '';
    document.getElementById('f-events-loc').value = '';
    document.getElementById('f-events-desc').value = '';
    document.getElementById('f-events-day').value = '';
    document.getElementById('f-events-month').value = '';
    document.getElementById('f-events-year').value = '';
    _eventsTypeFilter = null;
    _eventsQuickFilter = '';
    _eventsUpdateCardActive();
    eventsRenderBoard();
    eventsUpdateStats();
}

function eventsRenderBoard() {
    const board = document.getElementById('events-board');
    if (!board) return;

    const orgVal = document.getElementById('f-events-org')?.value || '';
    const locVal = document.getElementById('f-events-loc')?.value || '';
    const descVal = (document.getElementById('f-events-desc')?.value || '').toLowerCase();

    let events = [...(store?.allEvents || [])];

    // Исключаем ВКС — у них своя страница
    events = events.filter(e => e.type !== 'ВКС');

    // Filter by status
    if (_eventsCompleted) {
        events = events.filter(e => e.completed);
    } else {
        events = events.filter(e => !e.completed);
    }

    // Filter by type
    if (_eventsTypeFilter) {
        events = events.filter(e => e.type === _eventsTypeFilter);
    }

    // Quick filter (today/soon/missed)
    if (_eventsQuickFilter) {
        const today = localDateStr(new Date());
        if (_eventsQuickFilter === 'today') {
            events = events.filter(e => e.date === today);
        } else if (_eventsQuickFilter === 'soon') {
            events = events.filter(e => e.date && e.date > today);
        } else if (_eventsQuickFilter === 'missed') {
            events = events.filter(e => !e.date || e.date < today);
        }
    }

    // Date filter (day/month/year)
    const dayVal = document.getElementById('f-events-day')?.value || '';
    const monthVal = document.getElementById('f-events-month')?.value || '';
    const yearVal = document.getElementById('f-events-year')?.value || '';
    if (dayVal || monthVal || yearVal) {
        events = events.filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date + 'T00:00:00');
            if (dayVal && d.getDate() !== parseInt(dayVal)) return false;
            if (monthVal && (d.getMonth() + 1) !== parseInt(monthVal)) return false;
            if (yearVal && d.getFullYear() !== parseInt(yearVal)) return false;
            return true;
        });
    }

    // Apply filters
    if (orgVal) events = events.filter(e => e.organizer_id === orgVal);
    if (locVal) events = events.filter(e => e.location_id === locVal);
    if (descVal) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(descVal) ||
            (e.url || '').toLowerCase().includes(descVal)
        );
    }

    if (!events.length) {
        board.innerHTML = '<div class="empty-state">Нет мероприятий</div>';
        return;
    }

    // Group by date blocks
    const now = new Date();
    const today = localDateStr(now);
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = localDateStr(tmr);
    const da = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const dayAfter = localDateStr(da);

    const missed = [];
    const todayEvents = [];
    const tomorrowEvents = [];
    const dayAfterEvents = [];
    const soon = [];

    events.forEach(e => {
        if (!e.date || e.date < today) missed.push(e);
        else if (e.date === today) todayEvents.push(e);
        else if (e.date === tomorrow) tomorrowEvents.push(e);
        else if (e.date === dayAfter) dayAfterEvents.push(e);
        else soon.push(e);
    });

    const sortByTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    const sortByDateThenTime = (a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b);
    missed.sort(sortByDateThenTime);
    todayEvents.sort(sortByTime);
    tomorrowEvents.sort(sortByTime);
    dayAfterEvents.sort(sortByTime);
    soon.sort(sortByDateThenTime);

    let html = '';

    if (missed.length) html += _eventsRenderBlock('Пропущенные', missed, 'missed');
    if (todayEvents.length) html += _eventsRenderBlock('Сегодня', todayEvents, 'today');
    if (tomorrowEvents.length) html += _eventsRenderBlock('Завтра', tomorrowEvents, 'tomorrow');
    if (dayAfterEvents.length) html += _eventsRenderBlock('Послезавтра', dayAfterEvents, 'day-after');
    if (soon.length) html += _eventsRenderBlock('Скоро', soon, 'soon');

    board.innerHTML = html;
}

function _eventsRenderBlock(title, events, type) {
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">`;

    const icons = {
        missed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        today: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        tomorrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        'day-after': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        soon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    };

    html += icons[type] || icons.soon;
    html += `${title} <span class="vks-date-count">${events.length}</span>`;
    html += `</div>`;

    events.forEach(e => {
        html += _eventsRenderCard(e, type);
    });

    html += `</div>`;
    return html;
}

function _eventsRenderCard(e, blockType) {
    const time = e.time || '--:--';
    const date = e.date || '';
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const loc = e.location_id ? getLocationName(e.location_id) : '';
    const typeClass = _eventsGetTypeClass(e.type);

    let stripeClass = 'active';
    if (blockType === 'missed' && !e.completed) stripeClass = 'missed';
    else if (e.completed) stripeClass = 'completed';

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" onclick="evtOpenEditModal('${e.id}')" style="cursor:pointer">`;

    html += `<div class="vks-stripe ${stripeClass}"></div>`;

    html += `<div class="vks-card-content">`;

    // Time block
    html += `<div class="vks-time-block">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date + 'T00:00:00');
        const day = d.getDate();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        html += `<div class="vks-card-date">${day} ${monthNames[d.getMonth()]}</div>`;
    }
    html += `</div>`;

    // Body
    html += `<div class="vks-card-body">`;

    // Type badge + description
    html += `<div class="vks-card-desc">`;
    html += `<span class="events-type-badge ${typeClass}">${esc(e.type || 'ВКС')}</span> `;
    if (e.description) html += esc(e.description);
    html += `</div>`;

    // Meta: tags
    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag org"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;

    // Duration
    if (e.duration && e.duration !== 60) {
        html += `<span class="vks-tag">${e.duration} мин</span>`;
    }

    // Lock indicator
    if (e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id)) {
        html += `<div class="vks-card-lock">
            ${typeof LOCK_SVG !== 'undefined' ? LOCK_SVG : ''}
            <span>${esc(e.locked_by)}</span>
        </div>`;
    }

    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    return html;
}

function _eventsGetTypeClass(type) {
    const map = {
        'ВКС': 'type-vks',
        'Совещание': 'type-meeting',
        'Встреча': 'type-session',
        'Заседание': 'type-board',
        'Приём': 'type-reception',
    };
    return map[type] || 'type-vks';
}

// ─── Thin wrappers to unified modal ──────────────────────────────────

function evtOpenAddModal() { openAddEventModal('events'); }
function evtOpenEditModal(eventId) { openEditEventModal(eventId, 'events'); }
function evtCloseModal() { closeEventModal(); }
