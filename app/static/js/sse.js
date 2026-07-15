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
        // Если есть ID события — обновляем только одну карточку
        if (data.task_id) {
            _sseUpdateCard(data.task_id, data);
        } else {
            debounceRefreshEvents();
        }
    } else if (table === 'locations') {
        _refreshLocations();
    } else if (table === 'organizers') {
        _refreshOrganizers();
    } else if (table === 'users') {
        _refreshUsers();
    }
}

async function _sseUpdateCard(eventId, sseData) {
    // Пропускаем если модалка открыта
    const modal = document.getElementById('event-modal');
    if (modal && modal.classList.contains('show')) return;

    // Попробовать найти карточку по data-id
    const card = document.querySelector(`[data-event-id="${eventId}"]`);
    if (!card) return; // Карточка не на экране — ничего не делаем

    // Загрузить актуальные данные события
    try {
        const resp = await fetch(`/admin/api/events/${eventId}/single`, { credentials: 'same-origin' });
        if (!resp.ok) return;
        const result = await resp.json();
        if (!result.ok || !result.event) return;
        const e = result.event;

        // Обновить данные в пагинации
        const page = currentPage || '';
        if (page === 'vks-active' || page === 'vks-completed') {
            const boardId = page === 'vks-active' ? 'vks-board-active' : 'vks-board-completed';
            const p = _vksPagination[boardId];
            if (p) {
                const idx = p.events.findIndex(ev => ev.id === eventId);
                if (idx >= 0) p.events[idx] = e;
            }
        } else if (page === 'events-active' || page === 'events-completed') {
            const idx = _eventsPagination.events.findIndex(ev => ev.id === eventId);
            if (idx >= 0) _eventsPagination.events[idx] = e;
        }

        // Перерисовать доску (обновит все карточки, но без сброса скролла)
        if (page === 'vks-active') renderVksBoard('vks-board-active', 'active');
        else if (page === 'vks-completed') renderVksBoard('vks-board-completed', 'completed');
        else if (page === 'events-active' || page === 'events-completed') eventsRenderBoard();
        else if (page === 'dashboard') renderDashboard();
    } catch (err) {
        // Fallback — полная перерисовка
        debounceRefreshEvents();
    }
}

function debounceRefreshEvents() {
    if (_sseDebounceTimer) clearTimeout(_sseDebounceTimer);
    _sseDebounceTimer = setTimeout(_refreshEvents, 300);
}

function _refreshEvents() {
    // Пропускаем обновление если модалка открыта — lock/unlock триггерит SSE
    const modal = document.getElementById('event-modal');
    if (modal && modal.classList.contains('show')) return;

    const page = currentPage || '';

    if (page === 'vks-active') {
        _sseSoftRefreshBoard('vks-board-active', 'active');
        updateVksStats();
    } else if (page === 'vks-completed') {
        _sseSoftRefreshBoard('vks-board-completed', 'completed');
    } else if (page === 'events-active' || page === 'events-completed') {
        _eventsResetAndLoad();
    } else if (page === 'dashboard') {
        renderDashboard();
    } else if (page === 'calendar') {
        if (typeof _calEventsCache !== 'undefined') _calEventsCache = {};
        renderCalendar(false);
    }
}

async function _sseSoftRefreshBoard(boardId, filter) {
    // Перезагружаем данные текущего вида и перерисовываем доску
    // Пагинация сбрасывается, но renderVksBoard это делает сам
    const board = document.getElementById(boardId);
    if (board) renderVksBoard(boardId, filter);
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
        // Обновить кэш справочников
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
