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
        if (data.task_id) {
            _sseProcessEvent(data.task_id, data.action);
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

async function _sseProcessEvent(eventId, action) {
    const page = currentPage || '';

    // DELETE — убрать из данных и перерисовать
    if (action === 'DELETE') {
        if (page === 'vks-active' || page === 'vks-completed') {
            const boardId = page === 'vks-active' ? 'vks-board-active' : 'vks-board-completed';
            const p = _vksPagination[boardId];
            if (p) p.events = p.events.filter(e => e.id !== eventId);
            _sseRerenderBoard();
        } else if (page === 'events-active' || page === 'events-completed') {
            _eventsPagination.events = _eventsPagination.events.filter(e => e.id !== eventId);
            eventsRenderBoard();
        }
        return;
    }

    // INSERT/UPDATE — загрузить событие и обновить данные в пагинации
    try {
        const resp = await fetch(`/admin/api/events/${eventId}/single`, { credentials: 'same-origin' });
        if (!resp.ok) return;
        const result = await resp.json();
        if (!result.ok || !result.event) return;
        const e = result.event;

        if (page === 'vks-active' || page === 'vks-completed') {
            const boardId = page === 'vks-active' ? 'vks-board-active' : 'vks-board-completed';
            const p = _vksPagination[boardId];
            if (!p) return;
            const idx = p.events.findIndex(ev => ev.id === eventId);
            if (idx >= 0) {
                p.events[idx] = e;
            } else if (data.action === 'INSERT') {
                p.events.push(e);
            }
            // Пересортировать после любого изменения
            p.events.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
            _sseRerenderBoard();
        } else if (page === 'events-active' || page === 'events-completed') {
            const idx = _eventsPagination.events.findIndex(ev => ev.id === eventId);
            if (idx >= 0) {
                _eventsPagination.events[idx] = e;
            } else if (data.action === 'INSERT') {
                _eventsPagination.events.push(e);
            }
            _eventsPagination.events.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
            eventsRenderBoard();
        } else if (page === 'dashboard') {
            renderDashboard();
        }
    } catch (err) {
        console.error('SSE process error:', err);
    }
}

function _sseRerenderBoard() {
    // Перерисовать доску из p.events без сброса пагинации и скролла
    const page = currentPage || '';
    if (page === 'vks-active') {
        const board = document.getElementById('vks-board-active');
        const p = _vksPagination['vks-board-active'];
        if (board && p) _softRenderBoard(board, p.events, 'active');
    } else if (page === 'vks-completed') {
        const board = document.getElementById('vks-board-completed');
        const p = _vksPagination['vks-board-completed'];
        if (board && p) _softRenderBoard(board, p.events, 'completed');
    }
}

function _softRenderBoard(board, events, filter) {
    // Тот же алгоритм группировки что в _vksRenderBoard, но без сброса sentinel/скролла
    const now = new Date();
    const today = localDateStr(now);
    const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfter = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    const missed = [], todayEvents = [], tomorrowEvents = [], dayAfterEvents = [], soon = [];
    events.forEach(e => {
        if (!e.date || e.date < today) missed.push(e);
        else if (e.date === today) todayEvents.push(e);
        else if (e.date === tomorrow) tomorrowEvents.push(e);
        else if (e.date === dayAfter) dayAfterEvents.push(e);
        else soon.push(e);
    });

    let html = '';
    if (!events.length) {
        html = '<div class="empty-state">Нет мероприятий</div>';
    } else {
        if (missed.length)       html += renderVksBlock('Пропущенные', missed, 'missed');
        if (todayEvents.length)  html += renderVksBlock('Сегодня', todayEvents, 'today');
        if (tomorrowEvents.length) html += renderVksBlock('Завтра', tomorrowEvents, 'tomorrow');
        if (dayAfterEvents.length) html += renderVksBlock('Послезавтра', dayAfterEvents, 'day-after');
        if (soon.length)         html += renderVksBlock('Скоро', soon, 'soon');
    }

    // Сохраняем sentinel, заменяем содержимое
    let sentinel = board.querySelector('.scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.style.height = '1px';
    }
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (board.firstChild) board.removeChild(board.firstChild);
    while (temp.firstChild) board.appendChild(temp.firstChild);
    board.appendChild(sentinel);
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
