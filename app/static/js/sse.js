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
        renderVksBoard('vks-board-active', 'active');
        updateVksStats();
    } else if (page === 'vks-completed') {
        renderVksBoard('vks-board-completed', 'completed');
        updateVksStats();
    } else if (page === 'events-active' || page === 'events-completed') {
        _eventsResetAndLoad();
        eventsUpdateStats();
    } else if (page === 'dashboard') {
        renderDashboard();
    } else if (page === 'calendar') {
        _calEventsCache = {};
        _calLoadingRange = false;
        renderCalendar(false);
    }
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
