// ─── Preloader: предзагрузка справочников при старте ─────────────────
//
// События больше не грузятся здесь — каждая страница сама запрашивает
// нужный срез через /admin/api/events с серверной фильтрацией/пагинацией.
// store.allEvents убран намеренно.

let _preloaded = false;

function restoreFromCache() {
    const cached = localStorage.getItem('dash_cache');
    if (!cached) return false;
    try {
        const c = JSON.parse(cached);
        store.allLocations = c.locations || [];
        store.allOrganizers = c.organizers || [];
        // Обратная совместимость со старым кэшем
        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            store.allLocations.forEach(l => { _dashLocations[l.id] = l.name; });
        }
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            store.allOrganizers.forEach(o => { _dashOrganizers[o.id] = o.name; });
        }
        return store.allLocations.length > 0 || store.allOrganizers.length > 0;
    } catch (e) { return false; }
}

async function preloadAllData() {
    if (_preloaded) return;
    try {
        const resp = await fetch('/admin/api/preload', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const data = await resp.json();

        store.allLocations = data.locations || [];
        store.allOrganizers = data.organizers || [];

        if (typeof _dashLocations !== 'undefined') {
            _dashLocations = {};
            store.allLocations.forEach(l => { _dashLocations[l.id] = l.name; });
        }
        if (typeof _dashOrganizers !== 'undefined') {
            _dashOrganizers = {};
            store.allOrganizers.forEach(o => { _dashOrganizers[o.id] = o.name; });
        }

        // Кэшируем только справочники — они небольшие и редко меняются
        try {
            localStorage.setItem('dash_cache', JSON.stringify({
                locations: store.allLocations,
                organizers: store.allOrganizers,
            }));
        } catch (e) { /* квота превышена — игнорируем */ }

        _preloaded = true;
    } catch (e) {
        console.error('Preload error:', e);
    }
}

function initPreloader() {
    restoreFromCache();   // сразу показываем из кэша
    preloadAllData();     // затем обновляем с сервера в фоне
}
