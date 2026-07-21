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
    _sseDebounceTimer = setTimeout(sseRefreshPage, 200);
}

// ─── Единая функция SSE обновления ─────────────────────────────────

async function sseRefreshPage() {
    // Пока открыта модалка — НЕ трогаем кэш/доску (данные модалки берутся отдельно)
    const modal = document.getElementById('event-modal');
    if (modal && modal.classList.contains('show')) return;
    await refreshCurrentBoard();
}

// Явное обновление текущей доски из БД с перезаписью кэша (без гейта на модалку).
// Страницы по-прежнему рендерятся из кэша — здесь мы лишь обновляем кэш после мутации.
async function refreshCurrentBoard() {
    const page = currentPage;
    if (!page) return;

    // Инвалидировать все кэши событий — при переходе на другую страницу
    // pageInit увидит пустой кэш и загрузит свежие данные
    cacheInvalidate('vksActive');
    cacheInvalidate('vksCompleted');
    cacheInvalidate('eventsActive');
    cacheInvalidate('eventsCompleted');
    cacheInvalidate('dashboard');
    cacheInvalidate('calendar');

    // ── VKS / Мероприятия: один fetch events + stats ──
    if (page === 'vks-active' || page === 'vks-completed' ||
        page === 'events-active' || page === 'events-completed') {

        const isVks = page.startsWith('vks-');
        const filter = page.endsWith('-active') ? 'active' : 'completed';
        const cacheKey = isVks
            ? (filter === 'active' ? 'vksActive' : 'vksCompleted')
            : (filter === 'active' ? 'eventsActive' : 'eventsCompleted');

        // Параметры запроса
        const params = new URLSearchParams({ status: filter, limit: '200' });
        const statsParams = new URLSearchParams({ status: filter });
        if (isVks) {
            params.set('type', 'ВКС');
            statsParams.set('type', 'ВКС');
        } else {
            params.set('exclude_type', 'ВКС');
            if (_eventsTypeFilter) {
                params.set('type', _eventsTypeFilter);
                statsParams.set('type', _eventsTypeFilter);
            } else {
                statsParams.set('exclude_type', 'ВКС');
            }
        }

        const [eventsResp, statsResp] = await Promise.all([
            fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' }),
            fetch(`/admin/api/events/stats?${statsParams}`, { credentials: 'same-origin' }),
        ]);

        const events = eventsResp.ok ? (await eventsResp.json()).events || [] : [];
        const stats = statsResp.ok ? await statsResp.json() : null;

        cacheSet(cacheKey, { events, stats, loaded: true, hasMore: false });

        // Перерисовать СЧЁТЧИКИ (карточки статистики) — иначе доска обновится, а счётчики нет
        if (isVks) {
            if (stats) _vksRenderStats(stats);
            const boardId = filter === 'active' ? 'vks-board-active' : 'vks-board-completed';
            renderVksBoard(boardId, filter, true);
        } else {
            if (stats) _eventsRenderStats(stats);
            eventsRenderBoard();
        }
        return;
    }

    // ── Dashboard ──
    if (page === 'dashboard') {
        try {
            const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
            if (resp.ok) cacheSet('dashboard', await resp.json());
        } catch (e) {}
        renderDashboard();
        return;
    }

    // ── Calendar ──
    if (page === 'calendar') {
        cacheInvalidate('calendar');
        _calLoadingRange = false;
        const rangeStart = new Date(calWeekStart);
        rangeStart.setDate(rangeStart.getDate() - 14);
        const rangeEnd = new Date(calWeekStart);
        rangeEnd.setDate(rangeEnd.getDate() + 20);
        await _calLoadRange(localDateStr(rangeStart), localDateStr(rangeEnd));
        renderCalendar(false);
        return;
    }
}

// ─── VKS hash check + render ──────────────────────────────────────

let _sseLastHash = {};

function _sseRerenderFromCache(boardId, filter, force) {
    const board = document.getElementById(boardId);
    const p = _vksPagination[boardId];
    if (!board || !p) return;

    if (!force) {
        const hash = p.events.map(e => e.id + (e.completed ? '1' : '0') + (e.locked_by || '') + (e.date || '') + (e.time || '') + (e.description || '')).join(',');
        if (_sseLastHash[boardId] === hash) return;
    }
    _sseLastHash[boardId] = p.events.map(e => e.id + (e.completed ? '1' : '0') + (e.locked_by || '') + (e.date || '') + (e.time || '') + (e.description || '')).join(',');

    // Развёртка/фильтрация/группировка — через общее ядро (event-board-core.js)
    const filters = readBoardFilters(
        boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed',
        { statusFilter: filter, quickFilter: (typeof _quickFilter !== 'undefined' ? _quickFilter : '') }
    );
    const { list, buckets } = processBoardEvents(p.events, filters);

    let html = '';
    if (!list.length) {
        html = '<div class="empty-state">Нет мероприятий</div>';
    } else if (filter === 'completed') {
        const stats = cacheGet('vksCompleted')?.data?.stats;
        const totalCount = stats?.total ?? list.length;
        html += renderVksBlock('Завершённые', list, 'completed', totalCount);
    } else {
        html += renderActiveBoardBlocks(buckets, renderVksBlock);
    }

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

// ─── Справочники (locations, organizers, users) ────────────────────

async function _refreshLocations() {
    try {
        const resp = await fetch('/admin/api/locations', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const locs = await resp.json();
        store.allLocations = locs;
        cacheSet('locations', locs);
        if ((currentPage || '') === 'locations') renderLocations(store.allLocations);
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshOrganizers() {
    try {
        const resp = await fetch('/admin/api/organizers', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const orgs = await resp.json();
        store.allOrganizers = orgs;
        cacheSet('organizers', orgs);
        if ((currentPage || '') === 'organizers') renderOrganizers(store.allOrganizers);
        if ((currentPage || '') === 'dashboard') renderDashboard();
    } catch (e) {}
}

async function _refreshUsers() {
    try {
        const resp = await fetch('/admin/api/users', { credentials: 'same-origin' });
        if (!resp.ok) return;
        const users = await resp.json();
        store.allUsers = users;
        cacheSet('users', users);
        if ((currentPage || '') === 'users') renderUsers(store.allUsers);
    } catch (e) {}
}

function initSSE() { connectSSE(); }
function disconnectSSE() {
    if (_eventSource) { _eventSource.close(); _eventSource = null; }
}
