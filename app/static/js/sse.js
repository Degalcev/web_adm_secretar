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
    _sseDebounceTimer = setTimeout(() => {
        console.log('[SSE] debounce fired');
        sseRefreshPage();
    }, 200);
}

// ─── Единая функция SSE обновления ─────────────────────────────────

async function sseRefreshPage() {
    const page = currentPage;
    if (!page) { console.log('[SSE] no currentPage'); return; }

    const modal = document.getElementById('event-modal');
    const modalOpen = modal && modal.classList.contains('show');
    if (modalOpen) { console.log('[SSE] modal still open, skip'); return; }

    console.log('[SSE] sseRefreshPage →', page);

    // ── VKS / Мероприятия: один fetch events + stats ──
    if (page === 'vks-active' || page === 'vks-completed' ||
        page === 'events-active' || page === 'events-completed') {

        const isVks = page.startsWith('vks-');
        const filter = page.endsWith('-active') ? 'active' : 'completed';
        const cacheKey = isVks
            ? (filter === 'active' ? 'vksActive' : 'vksCompleted')
            : (filter === 'active' ? 'eventsActive' : 'eventsCompleted');

        // Параметры запроса
        const params = new URLSearchParams({ status: filter, limit: '10000' });
        const statsParams = new URLSearchParams({ status: filter });
        if (isVks) {
            params.set('type', 'ВКС');
            statsParams.set('type', 'ВКС');
        } else {
            params.set('exclude_type', 'ВКС');
            if (_eventsTypeFilter) {
                params.set('type', _eventsTypeFilter);
                statsParams.set('type', _eventsTypeFilter);
            } else {
                statsParams.set('exclude_type', 'ВКС');
            }
        }

        const [eventsResp, statsResp] = await Promise.all([
            fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' }),
            fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
        ]);

        const events = eventsResp.ok ? (await eventsResp.json()).events || [] : [];
        const stats = statsResp.ok ? await statsResp.json() : null;

        cacheSet(cacheKey, { events, stats, loaded: true, hasMore: false });

        if (isVks) {
            renderVksBoard(filter === 'active' ? 'vks-board-active' : 'vks-board-completed', filter);
        } else {
            eventsRenderBoard();
        }
        return;
    }

    // ── Dashboard ──
    if (page === 'dashboard') {
        try {
            const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
            if (resp.ok) cacheSet('dashboard', await resp.json());
        } catch (e) {}
        renderDashboard();
        return;
    }

    // ── Calendar ──
    if (page === 'calendar') {
        cacheInvalidate('calendar');
        _calLoadingRange = false;
        renderCalendar(false);
        return;
    }
}

// ─── VKS hash check + render ──────────────────────────────────────

let _sseLastHash = {};

function _sseRerenderFromCache(boardId, filter, force) {
    const board = document.getElementById(boardId);
    const p = _vksPagination[boardId];
    if (!board || !p) return;

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

// ─── Справочники (locations, organizers, users) ────────────────────

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
