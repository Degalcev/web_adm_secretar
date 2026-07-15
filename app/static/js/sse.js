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

function _refreshEvents() {
    const modal = document.getElementById('event-modal');
    if (modal && modal.classList.contains('show')) return;

    const page = currentPage || '';

    if (page === 'vks-active') {
        _sseUpdateAndRender('vks-board-active', 'active');
    } else if (page === 'vks-completed') {
        _sseUpdateAndRender('vks-board-completed', 'completed');
    } else if (page === 'events-active' || page === 'events-completed') {
        eventsRenderBoard();
    } else if (page === 'dashboard') {
        renderDashboard();
    } else if (page === 'calendar') {
        _calEventsCache = {};
        _calLoadingRange = false;
        renderCalendar(false);
    }
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
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('stat-vks-total', stats.total || 0);
            set('stat-vks-today', stats.today || 0);
            set('stat-vks-soon', stats.soon || 0);
            set('stat-vks-missed', stats.missed || 0);
        }
    } catch (e) {}

    _sseRerenderFromCache(boardId, filter);
}

function _sseRerenderFromCache(boardId, filter) {
    // Рендер из уже загруженных данных — без fetch, мгновенно
    const board = document.getElementById(boardId);
    const p = _vksPagination[boardId];
    if (!board || !p) return;

    const events = p.events;
    const now = new Date();
    const today = localDateStr(now);
    const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfter = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    let filtered = events;
    if (filter === 'active') filtered = events.filter(e => !e.completed);
    else if (filter === 'completed') filtered = events.filter(e => e.completed);

    const missed = [], todayE = [], tomorrowE = [], dayAfterE = [], soon = [];
    filtered.forEach(e => {
        if (!e.date || e.date < today) missed.push(e);
        else if (e.date === today) todayE.push(e);
        else if (e.date === tomorrow) tomorrowE.push(e);
        else if (e.date === dayAfter) dayAfterE.push(e);
        else soon.push(e);
    });

    let html = '';
    if (!filtered.length) {
        html = '<div class="empty-state">Нет мероприятий</div>';
    } else {
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
        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            locs.forEach(l => { _dashLocations[l.id] = l.name; });
        }
        _saveRefCache();

        if ((currentPage || '') === 'locations') {
            renderLocations(store.allLocations);
            document.getElementById('stat-total-loc').textContent = store.allLocations.length;
            document.getElementById('stat-shown-loc').textContent = store.allLocations.length;
        }
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshOrganizers() {
    try {
        const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const orgs = await resp.json();
        store.allOrganizers = orgs;
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            orgs.forEach(o => { _dashOrganizers[o.id] = o.name; });
        }
        _saveRefCache();

        if ((currentPage || '') === 'organizers') {
            renderOrganizers(store.allOrganizers);
            document.getElementById('stat-total-org').textContent = store.allOrganizers.length;
            document.getElementById('stat-shown-org').textContent = store.allOrganizers.length;
        }
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshUsers() {
    try {
        const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const users = await resp.json();
        store.allUsers = users;
        if ((currentPage || '') === 'users') {
            renderUsers(store.allUsers);
            updateStats(store.allUsers);
        }
    } catch (e) {}
}

function _saveRefCache() {
    try {
        localStorage.setItem('dash_cache', JSON.stringify({
            locations: store.allLocations,
            organizers: store.allOrganizers,
        }));
    } catch (e) {}
}

function initSSE() { connectSSE(); }
function disconnectSSE() {
    if (_eventSource) { _eventSource.close(); _eventSource = null; }
}
