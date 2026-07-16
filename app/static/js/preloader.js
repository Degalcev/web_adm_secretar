// ─── Preloader: предзагрузка справочников при старте ─────────────────
//
// События больше не грузятся здесь — каждая страница сама запрашивает
// нужный срез через /admin/api/events с серверной фильтрацией/пагинацией.
// store.allEvents убран намеренно.

let _preloaded = false;

async function preloadAllData() {
    if (_preloaded) return;
    try {
        const resp = await fetch('/admin/api/preload', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const data = await resp.json();

        store.allLocations = data.locations || [];
        store.allOrganizers = data.organizers || [];

        cacheSet('locations', store.allLocations);
        cacheSet('organizers', store.allOrganizers);

        _preloaded = true;
    } catch (e) {
        console.error('Preload error:', e);
    }
}

function initPreloader() {
    preloadAllData();
}
