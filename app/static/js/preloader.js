// ─── Preloader: предзагрузка всех данных при старте ──────────────────

let _preloaded = false;

function restoreFromCache() {
    const cached = localStorage.getItem('dash_cache');
    if (!cached) return false;
    try {
        const c = JSON.parse(cached);
        if (typeof allEvents !== 'undefined' && c.events) allEvents = c.events;
        if (typeof _dashEvents !== 'undefined') _dashEvents = c.events || [];
        if (typeof _dashLocations !== 'undefined') _dashLocations = c.locations || {};
        if (typeof _dashOrganizers !== 'undefined') _dashOrganizers = c.organizers || {};
        if (window) {
            window.allLocations = c.locations_raw || [];
            window.allOrganizers = c.organizers_raw || [];
        }
        return true;
    } catch (e) { return false; }
}

async function preloadAllData() {
    if (_preloaded) return;
    try {
        const resp = await fetch('/admin/api/preload', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const data = await resp.json();

        if (typeof allEvents !== 'undefined') allEvents = data.events || [];
        if (typeof _dashEvents !== 'undefined') _dashEvents = data.events || [];
        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            (data.locations || []).forEach(l => { _dashLocations[l.id] = l.name; });
        }
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            (data.organizers || []).forEach(o => { _dashOrganizers[o.id] = o.name; });
        }
        if (window) {
            window.allLocations = data.locations || [];
            window.allOrganizers = data.organizers || [];
        }

        localStorage.setItem('dash_cache', JSON.stringify({
            events: data.events || [],
            locations: _dashLocations || {},
            organizers: _dashOrganizers || {},
            locations_raw: data.locations || [],
            organizers_raw: data.organizers || [],
        }));

        _preloaded = true;
    } catch (e) {
        console.error('Preload error:', e);
    }
}

function initPreloader() {
    restoreFromCache();
    preloadAllData();
}
