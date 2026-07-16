// ─── VKS: Фильтры и загрузка данных ──────────────────────────────────

let editingEventId = null;
let pendingFiles = [];
let removedDocIds = [];

function _vksRenderStats(stats) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-vks-total', stats.total || 0);
    set('stat-vks-today', stats.today || 0);
    set('stat-vks-soon', stats.soon || 0);
    set('stat-vks-missed', stats.missed || 0);
}
let _pendingVksFilter = null;

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function populateDateSelects(prefix) {
    const daySel = document.getElementById(`${prefix}-day`);
    const monthSel = document.getElementById(`${prefix}-month`);
    const yearSel = document.getElementById(`${prefix}-year`);
    if (!daySel || !monthSel || !yearSel) return;

    for (let d = 1; d <= 31; d++) {
        daySel.add(new Option(d, d));
    }
    MONTHS.forEach((m, i) => {
        monthSel.add(new Option(m, i + 1));
    });
    const curYear = new Date().getFullYear();
    for (let y = curYear - 2; y <= curYear + 1; y++) {
        yearSel.add(new Option(y, y));
    }
}

function getDateFilter(prefix) {
    const day = document.getElementById(`${prefix}-day`)?.value || '';
    const month = document.getElementById(`${prefix}-month`)?.value || '';
    const year = document.getElementById(`${prefix}-year`)?.value || '';
    return { day, month, year };
}

function matchDateFilter(eventDate, filter) {
    if (!eventDate) return !filter.day && !filter.month && !filter.year;
    const parts = eventDate.split('-');
    const eYear = parts[0];
    const eMonth = parseInt(parts[1]);
    const eDay = parseInt(parts[2]);
    if (filter.year && eYear !== filter.year) return false;
    if (filter.month && eMonth !== parseInt(filter.month)) return false;
    if (filter.day && eDay !== parseInt(filter.day)) return false;
    return true;
}

async function loadVksActive() {
    populateDateSelects('f-vks-active');
    populateVksFilters();
    const cached = cacheGet('vksActive');
    if (cached?.data?.stats) _vksRenderStats(cached.data.stats);
    const board = document.getElementById('vks-board-active');
    // Рендерить ТОЛЬКО если доска пуста (нет карточек) — иначе не моргать
    if (board && !board.querySelector('.vks-card')) renderVksBoard('vks-board-active', 'active');

    // Apply pending filter from dashboard
    if (_pendingVksFilter) {
        const f = _pendingVksFilter;
        _pendingVksFilter = null;
        // Reset quick filter state first
        _quickFilter = '';
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
        document.getElementById('f-vks-active-org').value = '';
        document.getElementById('f-vks-active-loc').value = '';
        document.getElementById('f-vks-active-desc').value = '';

        const tryApply = (retries) => {
            const b = document.getElementById('vks-board-active');
            if (!b || !b.children.length || b.querySelector('.empty-state')) {
                if (retries > 0) { setTimeout(() => tryApply(retries - 1), 200); return; }
            }
            // Apply the filter
            if (f === 'active') {
                _quickFilter = 'active';
            } else if (f === 'missed') {
                _quickFilter = 'missed';
            } else if (f === 'today') {
                _quickFilter = 'today';
                if (document.getElementById('f-vks-active-day')) document.getElementById('f-vks-active-day').value = localDateStr(new Date());
            } else if (f === 'soon') {
                _quickFilter = 'soon';
            }
            // Highlight the correct stat card
            document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
            if (_quickFilter) {
                const idx = { all: 0, today: 1, soon: 2, missed: 3, active: 4 }[_quickFilter];
                const cards = document.querySelectorAll('#vks-active-stats .stat-card');
                if (cards[idx]) cards[idx].classList.add('active');
            }
            // Handle location filter
            if (f.startsWith('location:')) {
                const locId = f.split(':')[1];
                const locSel = document.getElementById('f-vks-active-loc');
                if (locSel) locSel.value = locId;
            }
            renderVksBoard('vks-board-active', 'active', true);
            showFilterBanner(f);
        };
        setTimeout(() => tryApply(15), 300);
    }
}

function showFilterBanner(filter) {
    const existing = document.getElementById('vks-filter-banner');
    if (existing) existing.remove();
    if (!filter) return;

    const page = document.getElementById('page-vks-active');
    if (!page) return;

    let text = '';
    if (filter === 'active') text = 'Фильтр: Активные (без пропущенных)';
    else if (filter === 'today') text = 'Фильтр: Сегодня';
    else if (filter === 'soon') text = 'Фильтр: Скоро';
    else if (filter === 'missed') text = 'Фильтр: Пропущенные';
    else if (filter === 'all') text = 'Фильтр: Все';
    else if (filter.startsWith('location:')) {
        const locId = filter.split(':')[1];
        const loc = (store.allLocations || []).find(l => l.id === locId);
        text = `Фильтр: Локация — ${loc ? loc.name : locId}`;
    }
    if (!text) return;

    const banner = document.createElement('div');
    banner.id = 'vks-filter-banner';
    banner.className = 'vks-filter-banner';
    banner.innerHTML = `
        <span>${text}</span>
        <button onclick="clearVksFilter()" class="vks-filter-clear">&times;</button>
    `;
    page.querySelector('.page-header').after(banner);
}

function clearVksFilter() {
    const banner = document.getElementById('vks-filter-banner');
    if (banner) banner.remove();
    _quickFilter = '';
    document.getElementById('f-vks-active-day').value = '';
    document.getElementById('f-vks-active-month').value = '';
    document.getElementById('f-vks-active-year').value = '';
    document.getElementById('f-vks-active-org').value = '';
    document.getElementById('f-vks-active-loc').value = '';
    document.getElementById('f-vks-active-desc').value = '';
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
    renderVksBoard('vks-board-active', 'active', true);
}

async function updateVksStats() {
    try {
        const isCompleted = (currentPage || '').includes('completed');
        const status = isCompleted ? 'completed' : 'active';
        const resp = await fetch(`/admin/api/events/stats?status=${status}&type=ВКС`, { credentials: 'same-origin' });
        if (!resp.ok) return;
        const stats = await resp.json();
        _vksRenderStats(stats);
        const cacheKey = status === 'active' ? 'vksActive' : 'vksCompleted';
        const existing = cacheGet(cacheKey);
        if (existing) {
            existing.data.stats = stats;
            cacheSet(cacheKey, existing.data);
        }
    } catch (e) {}
}

let _quickFilter = '';

function filterVksByQuick(type) {
    if (_quickFilter === type) {
        _quickFilter = '';
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
    } else {
        _quickFilter = type;
        document.getElementById('f-vks-active-day').value = '';
        document.getElementById('f-vks-active-month').value = '';
        document.getElementById('f-vks-active-year').value = '';
    }
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(card => card.classList.remove('active'));
    if (_quickFilter) {
        const idx = { all: 0, today: 1, soon: 2, missed: 3 }[type];
        const cards = document.querySelectorAll('#vks-active-stats .stat-card');
        if (cards[idx]) cards[idx].classList.add('active');
    }
    renderVksBoard('vks-board-active', 'active', true);
}

async function loadVksCompleted() {
    populateDateSelects('f-vks-completed');
    populateVksFilters();
    const cached = cacheGet('vksCompleted');
    if (cached?.data?.stats) _vksRenderStats(cached.data.stats);
    const board = document.getElementById('vks-board-completed');
    // Рендерить ТОЛЬКО если доска пуста (нет карточек) — иначе не моргать
    if (board && !board.querySelector('.vks-card')) renderVksBoard('vks-board-completed', 'completed');
}

function filterVksListActive() {
    renderVksBoard('vks-board-active', 'active', true);
}

function filterVksListCompleted() {
    renderVksBoard('vks-board-completed', 'completed', true);
}

function resetVksActiveFilters() {
    document.getElementById('f-vks-active-day').value = '';
    document.getElementById('f-vks-active-month').value = '';
    document.getElementById('f-vks-active-year').value = '';
    document.getElementById('f-vks-active-org').value = '';
    document.getElementById('f-vks-active-loc').value = '';
    document.getElementById('f-vks-active-desc').value = '';
    _quickFilter = '';
    document.querySelectorAll('#vks-active-stats .stat-card').forEach(c => c.classList.remove('active'));
    filterVksListActive();
}

function resetVksCompletedFilters() {
    document.getElementById('f-vks-completed-day').value = '';
    document.getElementById('f-vks-completed-month').value = '';
    document.getElementById('f-vks-completed-year').value = '';
    document.getElementById('f-vks-completed-org').value = '';
    document.getElementById('f-vks-completed-loc').value = '';
    document.getElementById('f-vks-completed-desc').value = '';
    filterVksListCompleted();
}

function populateVksFilters() {
    const orgOptions = '<option value="">Все</option>' +
        (store.allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');
    const locOptions = '<option value="">Все</option>' +
        (store.allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

    ['f-vks-active-org', 'f-vks-completed-org'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = orgOptions;
    });
    ['f-vks-active-loc', 'f-vks-completed-loc'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = locOptions;
    });
}
