// ─── SSE: реалтайм обновления ───────────────────────────────────────

let _eventSource = null;
let _sseDebounceTimer = null;

function connectSSE() {
    if (_eventSource) _eventSource.close();
    _eventSource = new EventSource('/admin/api/events/stream');

    _eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleSSEEvent(data);
        } catch (err) {}
    };

    _eventSource.onerror = () => {
        _eventSource.close();
        setTimeout(connectSSE, 5000);
    };
}

function handleSSEEvent(data) {
    const table = data.table_name;
    if (!table) return;

    if (table === 'events') {
        debounceRefreshEvents();
    } else if (table === 'locations') {
        _refreshLocations();
    } else if (table === 'organizers') {
        _refreshOrganizers();
    } else if (table === 'users') {
        _refreshUsers();
    }
}

function debounceRefreshEvents() {
    if (_sseDebounceTimer) clearTimeout(_sseDebounceTimer);
    _sseDebounceTimer = setTimeout(_refreshEvents, 200);
}

async function sseFetchEvents(params) {
    const { status, typeFilter, cacheKey, limit } = params;
    const fetchParams = new URLSearchParams({ status, limit: String(limit || 50) });
    if (typeFilter) fetchParams.set('type', typeFilter);
    else fetchParams.set('exclude_type', 'ВКС');
    const statsParams = new URLSearchParams({ status });
    if (typeFilter) statsParams.set('type', typeFilter);
    else statsParams.set('exclude_type', 'ВКС');

    const [eventsResp, statsResp] = await Promise.all([
        fetch(`/admin/api/events?${fetchParams}`, { credentials: 'same-origin' }),
        fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
    ]);

    let events = [], stats = null;
    if (eventsResp.ok) {
        const data = await eventsResp.json();
        events = data.events || [];
    }
    if (statsResp.ok) {
        stats = await statsResp.json();
    }
    cacheSet(cacheKey, { events, stats, loaded: true, hasMore: false });
    return { events, stats };
}

function _sseRefreshVks(boardId, filter) {
    const p = _vksPagination[boardId];
    if (!p) return;
    const cacheKey = filter === 'active' ? 'vksActive' : 'vksCompleted';
    const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
    const orgVal = document.getElementById(`${prefix}-org`)?.value;
    const locVal = document.getElementById(`${prefix}-loc`)?.value;
    const searchVal = document.getElementById(`${prefix}-desc`)?.value?.trim();
    const fetchParams = new URLSearchParams({ status: filter, type: 'ВКС', limit: String(p.events.length || 50) });
    if (orgVal) fetchParams.set('organizer_id', orgVal);
    if (locVal) fetchParams.set('location_id', locVal);
    if (searchVal) fetchParams.set('search', searchVal);
    const statsParams = new URLSearchParams({ status: filter, type: 'ВКС' });

    Promise.all([
        fetch(`/admin/api/events?${fetchParams}`, { credentials: 'same-origin' }),
        fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
    ]).then(([eventsResp, statsResp]) => {
        if (eventsResp.ok) {
            return eventsResp.json().then(data => {
                p.events = data.events || [];
                p.hasMore = !!data.has_more;
                p.cursorDate = data.next_cursor_date || null;
                p.cursorTime = data.next_cursor_time || null;
                p.cursorId = data.next_cursor_id || null;
                if (statsResp.ok) {
                    return statsResp.json().then(stats => {
                        _vksRenderStats(stats);
                        cacheSet(cacheKey, { events: p.events, stats, hasMore: p.hasMore, cursorDate: p.cursorDate, cursorTime: p.cursorTime, cursorId: p.cursorId });
                        _sseRerenderFromCache(boardId, filter);
                    });
                }
                _sseRerenderFromCache(boardId, filter);
            });
        }
    }).catch(() => {});
}

const _sseRefreshMap = {
    'vks-active':     () => _sseRefreshVks('vks-board-active', 'active'),
    'vks-completed':  () => _sseRefreshVks('vks-board-completed', 'completed'),
    'events-active':  () => sseFetchEvents({ status: 'active', cacheKey: 'eventsActive', limit: 10000, typeFilter: _eventsTypeFilter }).then(() => eventsRenderBoard()),
    'events-completed': () => sseFetchEvents({ status: 'completed', cacheKey: 'eventsCompleted', limit: 10000, typeFilter: _eventsTypeFilter }).then(() => eventsRenderBoard()),
    'dashboard':      () => sseFetchDashboard(),
    'calendar':       () => sseFetchCalendar(),
};

async function sseFetchDashboard() {
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (resp.ok) cacheSet('dashboard', await resp.json());
    } catch (e) {}
    renderDashboard();
}

function sseFetchCalendar() {
    cacheInvalidate('calendar');
    _calLoadingRange = false;
    renderCalendar(false);
}

function _refreshEvents() {
    const modal = document.getElementById('event-modal');
    if (modal && modal.classList.contains('show')) return;
    const page = currentPage || '';
    const handler = _sseRefreshMap[page];
    if (handler) handler();
}

async function _sseUpdateAndRender(boardId, filter) {
    const p = _vksPagination[boardId];
    if (!p) return;

    // Загрузить события И stats параллельно
    const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
    const params = new URLSearchParams({ status: filter, type: 'ВКС', limit: String(p.events.length || 50) });
    const orgVal = document.getElementById(`${prefix}-org`)?.value;
    const locVal = document.getElementById(`${prefix}-loc`)?.value;
    const searchVal = document.getElementById(`${prefix}-desc`)?.value?.trim();
    if (orgVal) params.set('organizer_id', orgVal);
    if (locVal) params.set('location_id', locVal);
    if (searchVal) params.set('search', searchVal);

    const statsParams = new URLSearchParams({ status: filter, type: 'ВКС' });

    try {
        const [eventsResp, statsResp] = await Promise.all([
            fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' }),
            fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
        ]);

        if (eventsResp.ok) {
            const data = await eventsResp.json();
            p.events = data.events || [];
            p.hasMore = !!data.has_more;
            p.cursorDate = data.next_cursor_date || null;
            p.cursorTime = data.next_cursor_time || null;
            p.cursorId = data.next_cursor_id || null;
        }

        if (statsResp.ok) {
            const stats = await statsResp.json();
            _vksRenderStats(stats);
            const cacheKey = filter === 'active' ? 'vksActive' : 'vksCompleted';
            cacheSet(cacheKey, {
                events: p.events,
                stats: stats,
                hasMore: p.hasMore,
                cursorDate: p.cursorDate,
                cursorTime: p.cursorTime,
                cursorId: p.cursorId,
            });
        }
    } catch (e) {}

    _sseRerenderFromCache(boardId, filter);
}

let _sseLastHash = {};

function _sseRerenderFromCache(boardId, filter, force) {
    const board = document.getElementById(boardId);
    const p = _vksPagination[boardId];
    if (!board || !p) return;

    // Проверить изменились ли данные — пропустить рендер если нет
    // force=true пропускает проверку (вызывается при смене фильтра)
    if (!force) {
        const hash = p.events.map(e => e.id + (e.completed ? '1' : '0') + (e.locked_by || '') + (e.date || '') + (e.time || '') + (e.description || '')).join(',');
        if (_sseLastHash[boardId] === hash) return;
    }
    _sseLastHash[boardId] = p.events.map(e => e.id + (e.completed ? '1' : '0') + (e.locked_by || '') + (e.date || '') + (e.time || '') + (e.description || '')).join(',');

    const events = p.events;
    const now = new Date();
    const today = localDateStr(now);
    const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfter = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    let filtered = events;
    if (filter === 'active') {
        filtered = events.filter(e => !e.completed);

        // Quick filter (today/soon/missed/active)
        if (typeof _quickFilter !== 'undefined' && _quickFilter) {
            if (_quickFilter === 'today') {
                filtered = filtered.filter(e => e.date === today);
            } else if (_quickFilter === 'soon') {
                filtered = filtered.filter(e => e.date && e.date > today);
            } else if (_quickFilter === 'missed') {
                filtered = filtered.filter(e => !e.date || e.date < today);
            } else if (_quickFilter === 'active') {
                filtered = filtered.filter(e => e.date && e.date >= today);
            }
        }

        // Date filter (day/month/year)
        const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
        const dayVal = document.getElementById(`${prefix}-day`)?.value || '';
        const monthVal = document.getElementById(`${prefix}-month`)?.value || '';
        const yearVal = document.getElementById(`${prefix}-year`)?.value || '';
        if (dayVal || monthVal || yearVal) {
            filtered = filtered.filter(e => {
                if (!e.date) return false;
                const d = new Date(e.date + 'T00:00:00');
                if (dayVal && d.getDate() !== parseInt(dayVal)) return false;
                if (monthVal && (d.getMonth() + 1) !== parseInt(monthVal)) return false;
                if (yearVal && d.getFullYear() !== parseInt(yearVal)) return false;
                return true;
            });
        }

        // Org / loc / desc filters
        const orgVal = document.getElementById(`${prefix}-org`)?.value || '';
        const locVal = document.getElementById(`${prefix}-loc`)?.value || '';
        const descVal = (document.getElementById(`${prefix}-desc`)?.value || '').toLowerCase();
        if (orgVal) filtered = filtered.filter(e => e.organizer_id === orgVal);
        if (locVal) filtered = filtered.filter(e => e.location_id === locVal);
        if (descVal) {
            filtered = filtered.filter(e =>
                (e.description || '').toLowerCase().includes(descVal) ||
                (e.url || '').toLowerCase().includes(descVal)
            );
        }
    } else if (filter === 'completed') {
        filtered = events.filter(e => e.completed);
    }

    let html = '';
    if (!filtered.length) {
        html = '<div class="empty-state">Нет мероприятий</div>';
    } else if (filter === 'completed') {
        // Завершённые — единый список, count из stats
        const stats = cacheGet('vksCompleted')?.data?.stats;
        const totalCount = stats?.total ?? filtered.length;
        html += renderVksBlock('Завершённые', filtered, 'completed', totalCount);
    } else {
        const missed = [], todayE = [], tomorrowE = [], dayAfterE = [], soon = [];
        filtered.forEach(e => {
            if (!e.date || e.date < today) missed.push(e);
            else if (e.date === today) todayE.push(e);
            else if (e.date === tomorrow) tomorrowE.push(e);
            else if (e.date === dayAfter) dayAfterE.push(e);
            else soon.push(e);
        });
        if (missed.length) html += renderVksBlock('Пропущенные', missed, 'missed');
        if (todayE.length) html += renderVksBlock('Сегодня', todayE, 'today');
        if (tomorrowE.length) html += renderVksBlock('Завтра', tomorrowE, 'tomorrow');
        if (dayAfterE.length) html += renderVksBlock('Послезавтра', dayAfterE, 'day-after');
        if (soon.length) html += renderVksBlock('Скоро', soon, 'soon');
    }

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
}

async function _refreshLocations() {
    try {
        const resp = await fetch('/admin/api/locations', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const locs = await resp.json();
        store.allLocations = locs;
        cacheSet('locations', locs);
        if ((currentPage || '') === 'locations') renderLocations(store.allLocations);
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshOrganizers() {
    try {
        const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const orgs = await resp.json();
        store.allOrganizers = orgs;
        cacheSet('organizers', orgs);
        if ((currentPage || '') === 'organizers') renderOrganizers(store.allOrganizers);
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshUsers() {
    try {
        const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const users = await resp.json();
        store.allUsers = users;
        cacheSet('users', users);
        if ((currentPage || '') === 'users') renderUsers(store.allUsers);
    } catch (e) {}
}

function initSSE() { connectSSE(); }
function disconnectSSE() {
    if (_eventSource) { _eventSource.close(); _eventSource = null; }
}
