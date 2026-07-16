// ─── Единый in-memory кэш всех данных ──────────────────────────────

const _dataCache = {
    vksActive:       null,
    vksCompleted:    null,
    eventsActive:    null,
    eventsCompleted: null,
    dashboard:       null,
    locations:       null,
    organizers:      null,
    users:           null,
    calendar:        null,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

function cacheGet(page) {
    return _dataCache[page];
}

function cacheSet(page, data) {
    _dataCache[page] = { data, ts: Date.now() };
}

function cacheInvalidate(page) {
    _dataCache[page] = null;
}

function cacheIsValid(page, ttl) {
    const entry = _dataCache[page];
    if (!entry || !entry.data) return false;
    if (Array.isArray(entry.data) && entry.data.length === 0) return false;
    if (ttl === undefined) ttl = CACHE_TTL;
    return (Date.now() - entry.ts) < ttl;
}

function cacheInvalidateAll() {
    Object.keys(_dataCache).forEach(k => { _dataCache[k] = null; });
}

// ─── Единый паттерн инициализации страниц ─────────────────────────
// Кэш свежий → render мгновенно + background fetch → re-render
// Кэш пустой → fetch → render

async function pageInit(pageKey, renderFn, fetchFn) {
    if (cacheIsValid(pageKey)) {
        renderFn();
        return;
    }
    await fetchFn();
    renderFn();
}
