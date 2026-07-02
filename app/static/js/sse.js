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
        _refreshEvents();
    } else if (table === 'locations') {
        _refreshLocations();
    } else if (table === 'organizers') {
        _refreshOrganizers();
    }
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

function initSSE() {
    connectSSE();
}
