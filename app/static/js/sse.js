// ─── SSE: реалтайм обновления ───────────────────────────────────────

let _eventSource = null;

function connectSSE() {
    if (_eventSource) _eventSource.close();
    _eventSource = new EventSource('/admin/api/events/stream');

    _eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleSSEEvent(data);
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    };

    _eventSource.onerror = () => {
        _eventSource.close();
        setTimeout(connectSSE, 5000);
    };
}

function handleSSEEvent(data) {
    const table = data.table_name;
    if (!table) return;

    // Обновляем данные дашборда если открыт
    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }

    // Обновляем кэш для VKS
    if (table === 'events' && typeof allEvents !== 'undefined') {
        fetch('/admin/api/events', { credentials: 'same-origin' })
            .then(r => r.json())
            .then(events => {
                allEvents = events;
                localStorage.setItem('dash_cache_events', JSON.stringify(events));
            })
            .catch(() => {});
    }

    // Обновляем локации
    if (table === 'locations') {
        fetch('/admin/api/locations', { credentials: 'same-origin' })
            .then(r => r.json())
            .then(locs => {
                if (window) window.allLocations = locs;
                if (typeof _dashLocations !== 'undefined') {
                    _dashLocations = {};
                    locs.forEach(l => { _dashLocations[l.id] = l.name; });
                }
            })
            .catch(() => {});
    }

    // Обновляем организаторов
    if (table === 'organizers') {
        fetch('/admin/api/organizers', { credentials: 'same-origin' })
            .then(r => r.json())
            .then(orgs => {
                if (window) window.allOrganizers = orgs;
                if (typeof _dashOrganizers !== 'undefined') {
                    _dashOrganizers = {};
                    orgs.forEach(o => { _dashOrganizers[o.id] = o.name; });
                }
            })
            .catch(() => {});
    }
}

function initSSE() {
    connectSSE();
}
