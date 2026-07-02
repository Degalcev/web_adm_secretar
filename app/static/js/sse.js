// ─── SSE: реалтайм обновления ───────────────────────────────────────

let _eventSource = null;

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
        _updateEventsCache();
    } else if (table === 'locations') {
        _updateLocationsCache();
    } else if (table === 'organizers') {
        _updateOrganizersCache();
    } else if (table === 'users') {
        _updateUsersCache();
    }

    // Перерисовать дашборд если открыт
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

async function _updateEventsCache() {
    try {
        const resp = await fetch('/admin/api/events', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const events = await resp.json();
        if (typeof allEvents !== 'undefined') allEvents = events;
        if (typeof _dashEvents !== 'undefined') _dashEvents = events;
        _saveCache();
    } catch (e) {}
}

async function _updateLocationsCache() {
    try {
        const resp = await fetch('/admin/api/locations', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const locs = await resp.json();
        if (typeof window !== 'undefined') window.allLocations = locs;
        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            locs.forEach(l => { _dashLocations[l.id] = l.name; });
        }
        _saveCache();
    } catch (e) {}
}

async function _updateOrganizersCache() {
    try {
        const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const orgs = await resp.json();
        if (typeof window !== 'undefined') window.allOrganizers = orgs;
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            orgs.forEach(o => { _dashOrganizers[o.id] = o.name; });
        }
        _saveCache();
    } catch (e) {}
}

async function _updateUsersCache() {
    try {
        const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
        if (!resp.ok) return;
        if (typeof loadUsers === 'function') loadUsers();
    } catch (e) {}
}

function _saveCache() {
    try {
        localStorage.setItem('dash_cache', JSON.stringify({
            events: _dashEvents || [],
            locations: _dashLocations || {},
            organizers: _dashOrganizers || {},
        }));
    } catch (e) {}
}

function initSSE() {
    connectSSE();
}
