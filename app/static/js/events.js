// ─── Страница мероприятий (VKS-style) ─────────────────────────────

let _eventsCompleted = false;
let _eventsTypeFilter = null;

const EVENT_TYPES = ['Совещание', 'Встреча', 'Заседание', 'Приём'];
const _eventsPagination = { events: [], cursorDate: null, cursorTime: null, hasMore: true, loading: false, total: 0 };
const EVENTS_PAGE_SIZE = 50;

function initEventsPage(completed = false) {
    _eventsCompleted = completed;
    _eventsTypeFilter = null;
    const title = document.getElementById('events-page-title');
    if (title) title.textContent = completed ? 'Завершённые мероприятия' : 'Текущие мероприятия';
    const statsRow = document.getElementById('events-stats');
    if (statsRow) statsRow.style.display = completed ? 'none' : '';
    _eventsPopulateFilters();

    const cacheKey = completed ? 'eventsCompleted' : 'eventsActive';
    pageInit(cacheKey, () => {
        const cached = cacheGet(cacheKey);
        if (cached?.data?.stats) _eventsRenderStats(cached.data.stats);
        eventsRenderBoard();
    }, () => _eventsFetch(completed ? 'completed' : 'active'));
}

function _eventsRenderStats(stats) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-evt-total', stats.total || 0);
    set('stat-evt-today', stats.today || 0);
    set('stat-evt-soon', stats.soon || 0);
    set('stat-evt-missed', stats.missed || 0);
}

async function _eventsFetch(status) {
    const cacheKey = status === 'active' ? 'eventsActive' : 'eventsCompleted';
    const isCompleted = status === 'completed';
    const limit = isCompleted ? 50 : 10000;
    const params = new URLSearchParams({ status, limit: String(limit), exclude_type: 'ВКС' });
    if (_eventsTypeFilter) params.set('type', _eventsTypeFilter);
    const statsParams = new URLSearchParams({ status });
    if (_eventsTypeFilter) statsParams.set('type', _eventsTypeFilter);
    else statsParams.set('exclude_type', 'ВКС');

    const [eventsResp, statsResp] = await Promise.all([
        fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' }),
        fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
    ]);

    const data = eventsResp.ok ? await eventsResp.json() : {};
    const events = data.events || [];
    const stats = statsResp.ok ? await statsResp.json() : null;

    cacheSet(cacheKey, {
        events,
        stats,
        loaded: true,
        hasMore: isCompleted ? (data.has_more ?? true) : false,
        cursorDate: data.next_cursor_date || null,
        cursorTime: data.next_cursor_time || null,
        cursorId: data.next_cursor_id || null,
    });
    return { events, stats };
}

function _eventsHardReset() {
    const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
    cacheInvalidate(cacheKey);
    _eventsPagination.events = [];
    _eventsPagination.cursorDate = null;
    _eventsPagination.cursorTime = null;
    _eventsPagination.cursorId = null;
    _eventsPagination.hasMore = true;
    _eventsPagination.loading = false;

    const board = document.getElementById('events-board');
    if (!board) return;
    board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';

    if (!_eventsCompleted) {
        _eventsLoadAll();
    } else {
        const scrollEl = _findScrollParent(board);
        if (scrollEl) {
            if (scrollEl._eventsScrollHandler) scrollEl.removeEventListener('scroll', scrollEl._eventsScrollHandler);
            scrollEl._eventsScrollHandler = () => {
                if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 300) _eventsLoadMore();
            };
            scrollEl.addEventListener('scroll', scrollEl._eventsScrollHandler);
        }
        _eventsLoadMore();
    }
}

async function _eventsLoadAll() {
    const p = _eventsPagination;
    if (p.loading) return;
    p.loading = true;

    const board = document.getElementById('events-board');
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка…</div>';

    try {
        const params = new URLSearchParams({
            status: 'active', limit: 10000, exclude_type: 'ВКС',
        });
        const orgVal = document.getElementById('f-events-org')?.value;
        const locVal = document.getElementById('f-events-loc')?.value;
        const searchVal = document.getElementById('f-events-desc')?.value?.trim();
        if (orgVal) params.set('organizer_id', orgVal);
        if (locVal) params.set('location_id', locVal);
        if (searchVal) params.set('search', searchVal);

        const dayVal = document.getElementById('f-events-day')?.value;
        const monthVal = document.getElementById('f-events-month')?.value;
        const yearVal = document.getElementById('f-events-year')?.value;
        if (yearVal || monthVal || dayVal) {
            const y = yearVal || new Date().getFullYear();
            const m = monthVal ? String(monthVal).padStart(2, '0') : '01';
            if (dayVal) {
                params.set('from', `${y}-${m}-${String(dayVal).padStart(2, '0')}`);
                params.set('to', `${y}-${m}-${String(dayVal).padStart(2, '0')}`);
            } else {
                const mEnd = monthVal ? String(monthVal).padStart(2, '0') : '12';
                const lastDay = new Date(y, monthVal ? Number(monthVal) : 12, 0).getDate();
                params.set('from', `${y}-${m}-01`);
                params.set('to', `${y}-${mEnd}-${lastDay}`);
            }
        }

        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events = data.events || [];
        p.hasMore = false;

        cacheSet('eventsActive', {
            events: p.events,
            loaded: true,
            hasMore: false,
        });

        eventsRenderBoard();
        eventsUpdateStats();
    } catch (e) {
        console.error('_eventsLoadAll error:', e);
    }
    p.loading = false;
    if (sentinel) sentinel.innerHTML = '';
}

async function _eventsLoadMore() {
    const p = _eventsPagination;
    if (p.loading || !p.hasMore) return;
    p.loading = true;

    const board = document.getElementById('events-board');
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка…</div>';

    try {
        const params = new URLSearchParams({
            status: _eventsCompleted ? 'completed' : 'active',
            limit: EVENTS_PAGE_SIZE,
            exclude_type: 'ВКС',
        });
        if (_eventsTypeFilter) params.set('type', _eventsTypeFilter);

        // Server-side filters from UI
        const orgVal = document.getElementById('f-events-org')?.value;
        const locVal = document.getElementById('f-events-loc')?.value;
        const searchVal = document.getElementById('f-events-desc')?.value?.trim();
        if (orgVal) params.set('organizer_id', orgVal);
        if (locVal) params.set('location_id', locVal);
        if (searchVal) params.set('search', searchVal);

        // Date filter
        const dayVal = document.getElementById('f-events-day')?.value;
        const monthVal = document.getElementById('f-events-month')?.value;
        const yearVal = document.getElementById('f-events-year')?.value;
        if (yearVal || monthVal || dayVal) {
            const y = yearVal || new Date().getFullYear();
            const m = monthVal ? String(monthVal).padStart(2, '0') : '01';
            if (dayVal) {
                params.set('from', `${y}-${m}-${String(dayVal).padStart(2, '0')}`);
                params.set('to', `${y}-${m}-${String(dayVal).padStart(2, '0')}`);
            } else {
                const mEnd = monthVal ? String(monthVal).padStart(2, '0') : '12';
                const lastDay = new Date(y, monthVal ? Number(monthVal) : 12, 0).getDate();
                params.set('from', `${y}-${m}-01`);
                params.set('to', `${y}-${mEnd}-${lastDay}`);
            }
        }

        // Cursor
        if (p.cursorDate) params.set('cursor_date', p.cursorDate);
        if (p.cursorTime) params.set('cursor_time', p.cursorTime);
        if (p.cursorId) params.set('cursor_id', p.cursorId);

        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events.push(...(data.events || []));
        p.cursorDate = data.next_cursor_date || null;
        p.cursorTime = data.next_cursor_time || null;
        p.cursorId = data.next_cursor_id || null;
        p.hasMore = !!data.has_more;

        cacheSet('eventsCompleted', {
            events: p.events,
            cursorDate: p.cursorDate,
            cursorTime: p.cursorTime,
            cursorId: p.cursorId,
            hasMore: p.hasMore,
            loaded: true,
        });

        eventsRenderBoard();
        eventsUpdateStats();
    } catch (e) {
        console.error('_eventsLoadMore error:', e);
    }
    p.loading = false;
    if (sentinel) sentinel.innerHTML = '';
}

let _eventsQuickFilter = '';

async function eventsUpdateStats() {
    try {
        const status = _eventsCompleted ? 'completed' : 'active';
        const params = new URLSearchParams({ status });
        if (_eventsTypeFilter) params.set('type', _eventsTypeFilter);
        else params.set('exclude_type', 'ВКС');
        const resp = await fetch(`/admin/api/events/stats?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) return;
        const stats = await resp.json();
        _eventsRenderStats(stats);
        const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
        const existing = cacheGet(cacheKey);
        if (existing) {
            existing.data.stats = stats;
            cacheSet(cacheKey, existing.data);
        } else {
            cacheSet(cacheKey, { events: [], stats, loaded: true, hasMore: true });
        }
    } catch (e) {}
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
    if (_eventsCompleted) {
        _eventsHardReset();
    } else {
        eventsRenderBoard();
    }
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
    if (_eventsCompleted) {
        _eventsHardReset();
    } else {
        eventsRenderBoard();
    }
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
    if (_eventsCompleted) {
        _eventsHardReset();
    } else {
        eventsRenderBoard();
    }
    eventsUpdateStats();
}

function eventsRenderBoard() {
    try {
    const board = document.getElementById('events-board');
    if (!board) return;

    const orgVal = document.getElementById('f-events-org')?.value || '';
    const locVal = document.getElementById('f-events-loc')?.value || '';
    const descVal = (document.getElementById('f-events-desc')?.value || '').toLowerCase();

    const cacheKey = _eventsCompleted ? 'eventsCompleted' : 'eventsActive';
    const cached = cacheGet(cacheKey);
    let events = [...(cached?.data?.events || [])];

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

    let html = '';

    if (_eventsCompleted) {
        // Завершённые — единый список без группировки по датам
        const sortByDateThenTime = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '');
        events.sort(sortByDateThenTime);
        const stats = cacheGet('eventsCompleted')?.data?.stats;
        const totalCount = stats?.total ?? events.length;
        html += _eventsRenderBlock('Завершённые', events, 'completed', totalCount);
    } else {
        // Текущие — группировка по датам
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
        const sortByDateThenTime2 = (a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b);
        missed.sort(sortByDateThenTime2);
        todayEvents.sort(sortByTime);
        tomorrowEvents.sort(sortByTime);
        dayAfterEvents.sort(sortByTime);
        soon.sort(sortByDateThenTime2);

        if (missed.length) html += _eventsRenderBlock('Пропущенные', missed, 'missed');
        if (todayEvents.length) html += _eventsRenderBlock('Сегодня', todayEvents, 'today');
        if (tomorrowEvents.length) html += _eventsRenderBlock('Завтра', tomorrowEvents, 'tomorrow');
        if (dayAfterEvents.length) html += _eventsRenderBlock('Послезавтра', dayAfterEvents, 'day-after');
        if (soon.length) html += _eventsRenderBlock('Скоро', soon, 'soon');
    }

    // Preserve sentinel — don't use innerHTML
    let sentinel = board.querySelector('.scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.style.height = '1px';
    }
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (board.firstChild) board.removeChild(board.firstChild);
    while (temp.firstChild) board.appendChild(temp.firstChild);
    board.appendChild(sentinel);

    // Scroll listener для пагинации Завершённых
    if (_eventsCompleted) {
        const scrollEl = _findScrollParent(board);
        if (scrollEl) {
            if (scrollEl._eventsScrollHandler) scrollEl.removeEventListener('scroll', scrollEl._eventsScrollHandler);
            scrollEl._eventsScrollHandler = () => {
                if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 300) _eventsLoadMore();
            };
            scrollEl.addEventListener('scroll', scrollEl._eventsScrollHandler);
        }
    }
    } catch (e) {
        console.error('eventsRenderBoard error:', e);
        const board = document.getElementById('events-board');
        if (board) board.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
}

function _eventsRenderBlock(title, events, type, totalCount) {
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">`;

    const icons = {
        missed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        today: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        tomorrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        'day-after': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        soon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        completed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    };

    const count = totalCount !== undefined ? totalCount : events.length;
    html += icons[type] || icons.soon;
    html += `${title} <span class="vks-date-count">${count}</span>`;
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

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" data-event-id="${e.id}" onclick="evtOpenEditModal('${e.id}')" style="cursor:pointer">`;

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
