// ─── SSE: реалтайм обновления ───────────────────────────────────────

let _eventSource = null;
let _sseDebounceTimer = null;
let _skipNextSSE = false;

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

function markSSESkipped() {
    _skipNextSSE = true;
}

function handleSSEEvent(data) {
    const table = data.table_name;
    if (!table) return;

    // Пропустить SSE если данные только что обновлены вручную
    if (_skipNextSSE) {
        _skipNextSSE = false;
        return;
    }

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
        _refreshEvents();
    }, 300);
}

async function _refreshEvents() {
    try {
        const resp = await fetch('/admin/api/events', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const events = await resp.json();
        if (typeof allEvents !== 'undefined') allEvents = events;
        if (typeof _dashEvents !== 'undefined') _dashEvents = events;

        // Перерисовать активную страницу
        const page = currentPage || '';
        if (page === 'vks-active') {
            renderVksBoard('vks-board-active', 'active');
            updateVksStats();
        } else if (page === 'vks-completed') {
            renderVksBoard('vks-board-completed', 'completed');
        } else if (page === 'dashboard') {
            renderDashboard();
        }
    } catch (e) {}
}

async function _refreshLocations() {
    try {
        const resp = await fetch('/admin/api/locations', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const locs = await resp.json();
        if (window) window.allLocations = locs;
        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            locs.forEach(l => { _dashLocations[l.id] = l.name; });
        }
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshOrganizers() {
    try {
        const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const orgs = await resp.json();
        if (window) window.allOrganizers = orgs;
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            orgs.forEach(o => { _dashOrganizers[o.id] = o.name; });
        }
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshUsers() {
    try {
        const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const users = await resp.json();
        allUsers = users;
        if ((currentPage || '') === 'users') {
            renderUsers(allUsers);
            updateStats(allUsers);
        }
    } catch (e) {}
}

function initSSE() {
    connectSSE();
}
