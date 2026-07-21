// ─── Dashboard / Обзор (combo: операционный + аналитика · ВКС и Мероприятия) ───

let _dashPeriod = 'week';
let _dashMonth = new Date().getMonth();
let _dashYear = new Date().getFullYear();
let _locPeriod = 'today';      // загрузка залов: today | month | year
let _dashRoomFilter = 'all';   // сегодня по залам: all | vks | events
let _dashLastSyncAt = 0;
let _dashSyncState = 'syncing';
let _dashScrollResizeBound = false;
let _dashScrollObserver = null;

const DASH_REPEAT_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
const DASH_USER_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
const DASH_LINK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const DASH_DOC_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

function setDashboardSyncStatus(state, syncedAt) {
    _dashSyncState = state;
    if (syncedAt) _dashLastSyncAt = syncedAt;
    const el = document.getElementById('dash-sync-status');
    if (!el) return;

    const labels = {
        syncing: 'Обновление…',
        stale: 'Есть обновления',
        offline: 'Нет соединения',
        error: 'Не удалось обновить',
    };
    let label = labels[state] || labels.syncing;
    if (state === 'ok') {
        const ts = _dashLastSyncAt || Date.now();
        const time = new Intl.DateTimeFormat('ru-RU', {
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(ts));
        label = 'Данные актуальны · ' + time;
        el.title = 'Последнее успешное обновление: ' + new Date(ts).toLocaleString('ru-RU');
    } else {
        el.title = label;
    }
    el.className = 'dash-sync-status is-' + state;
    el.dataset.state = state;
    const text = el.querySelector('span');
    if (text) text.textContent = label;
}

function dashboardSseConnected() {
    const cached = cacheGet('dashboard');
    if (_dashSyncState === 'stale') return;
    if (cached && cached.data) setDashboardSyncStatus('ok', cached.ts || Date.now());
    else setDashboardSyncStatus('syncing');
}

function dashboardSseDisconnected() {
    setDashboardSyncStatus('offline');
}

function _dashUpdateScrollHint(scroller) {
    if (!scroller) return;
    const shell = scroller.closest('[data-scroll-shell]');
    if (!shell) return;
    const epsilon = 3;
    const overflow = scroller.scrollHeight - scroller.clientHeight > epsilon;
    shell.classList.toggle('can-scroll-up', overflow && scroller.scrollTop > epsilon);
    shell.classList.toggle('can-scroll-down', overflow && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - epsilon);
}

function updateDashboardScrollHints() {
    document.querySelectorAll('#page-dashboard [data-dash-scroll]').forEach(_dashUpdateScrollHint);
}

function _dashScheduleScrollHints() {
    requestAnimationFrame(updateDashboardScrollHints);
}

function setupDashboardScrollHints() {
    document.querySelectorAll('#page-dashboard [data-dash-scroll]').forEach(scroller => {
        if (!scroller.dataset.scrollHintBound) {
            scroller.dataset.scrollHintBound = '1';
            scroller.addEventListener('scroll', () => _dashUpdateScrollHint(scroller), { passive: true });
            if (typeof ResizeObserver !== 'undefined') {
                if (!_dashScrollObserver) _dashScrollObserver = new ResizeObserver(entries => entries.forEach(entry => _dashUpdateScrollHint(entry.target)));
                _dashScrollObserver.observe(scroller);
            }
        }
        _dashUpdateScrollHint(scroller);
    });
    if (!_dashScrollResizeBound) {
        window.addEventListener('resize', _dashScheduleScrollHints, { passive: true });
        _dashScrollResizeBound = true;
    }
}

async function _fetchDashboardToCache() {
    setDashboardSyncStatus('syncing');
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (!resp.ok) throw new Error('Dashboard HTTP ' + resp.status);
        cacheSet('dashboard', await resp.json());
        const cached = cacheGet('dashboard');
        setDashboardSyncStatus('ok', cached ? cached.ts : Date.now());
        return true;
    } catch (e) {
        setDashboardSyncStatus('error');
        return false;
    }
}

async function initDashboard() {
    setupDashboardQuickNav();
    setupRoomToggle();
    setupChartToggle();
    setupLocToggle();
    setupDashboardScrollHints();
    const cached = cacheGet('dashboard');
    if (cacheIsValid('dashboard')) setDashboardSyncStatus('ok', cached.ts);
    else setDashboardSyncStatus('syncing');
    await pageInit('dashboard', renderDashboard, _fetchDashboardToCache);
}

async function refreshDashboard() {
    await _fetchDashboardToCache();
    renderDashboard();
}

// ─── Быстрые переходы ───
function setupDashboardQuickNav() {
    document.querySelectorAll('#dash-quicknav [data-qaction]').forEach(btn => {
        btn.onclick = () => {
            const a = btn.dataset.qaction;
            if (a === 'new-vks') {
                if (typeof openAddEventModal === 'function') openAddEventModal('vks');
            } else if (a === 'new-event') {
                if (typeof openAddEventModal === 'function') openAddEventModal('events');
            } else if (a === 'calendar') {
                navigateTo('/calendar/');
            } else if (a === 'vks') {
                navigateTo('/conferences/');
            } else if (a === 'events') {
                navigateTo('/events/');
            }
        };
    });
}

// ─── Хелперы ───
function _dashIsVks(e) { return (e.type || 'ВКС') === 'ВКС'; }

function _dashEndTime(time, duration) {
    if (!time) return '';
    const m = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!m) return '';
    let total = (+m[1]) * 60 + (+m[2]) + (duration || 0);
    total = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// ─── Главный рендер ───
function _dashRenderHeader() {
    const greeting = document.getElementById('dash-greeting');
    const dateEl = document.getElementById('dash-current-date');
    const user = window.currentUser || {};
    const firstName = user.first_name || '';
    greeting.textContent = firstName ? ('Добрый день, ' + firstName) : 'Обзор';
    if (dateEl) {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('ru-RU', {
            weekday: 'long', day: 'numeric', month: 'long'
        }).format(now);
        dateEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
}

function _dashEventWord(count) {
    const n10 = count % 10, n100 = count % 100;
    if (n10 === 1 && n100 !== 11) return 'событие';
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'события';
    return 'событий';
}

// ─── Главный рендер ───
function renderDashboard() {
    const cached = cacheGet('dashboard');
    if (!cached || !cached.data) return;
    const d = cached.data;
    if (_dashSyncState !== 'offline' && _dashSyncState !== 'error' && _dashSyncState !== 'stale') {
        setDashboardSyncStatus('ok', cached.ts || Date.now());
    }
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const vks = d.vks || {}, evt = d.events || {}, sum = d.summary || {};
    const vksActive = vks.active || 0;
    const evtActive = evt.active || 0;
    const vksOverall = vksActive + (vks.completed || 0);
    const evtOverall = evtActive + (evt.completed || 0);

    _dashRenderHeader();
    set('dash-kpi-total', sum.total || (vksOverall + evtOverall));
    set('dash-hero-vks', vksOverall);
    set('dash-hero-events', evtOverall);
    set('dash-kpi-vks', vksActive);
    set('dash-kpi-events', evtActive);
    set('dash-kpi-missed', sum.missed || 0);
    set('dash-kpi-vks-sub', (vks.today || 0) + ' сегодня · ' + (vks.soon || 0) + ' скоро');
    set('dash-kpi-events-sub', (evt.today || 0) + ' сегодня · ' + (evt.soon || 0) + ' скоро');

    const todayEvents = d.today || [];
    const soonEvents = d.soon || [];
    set('dash-today-subtitle', todayEvents.length ? (todayEvents.length + ' ' + _dashEventWord(todayEvents.length)) : 'Нет событий');
    set('dash-soon-subtitle', soonEvents.length ? (soonEvents.length + ' ближайших · следующие 60 дней') : 'Следующие 60 дней');

    renderDashRooms(todayEvents);
    renderDashSoon(soonEvents);
    renderDashRing(sum.completed || 0, sum.total || 0);
    _renderDashLocationsFromCache(d);
    drawChart();
    _dashScheduleScrollHints();
}

function _dashSparkline(elId, arr) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!arr || !arr.length || arr.every(v => !v)) { el.innerHTML = ''; return; }
    const max = Math.max.apply(null, arr.concat([1]));
    const n = arr.length;
    const pts = arr.map((v, i) => {
        const x = n === 1 ? 50 : (i / (n - 1)) * 100;
        const y = 26 - (v / max) * 23;
        return x.toFixed(1) + ',' + y.toFixed(1);
    });
    const area = '0,28 ' + pts.join(' ') + ' 100,28';
    el.innerHTML = '<polygon class="dash-spark-area" points="' + area + '"></polygon>' +
                   '<polyline class="dash-spark-line" points="' + pts.join(' ') + '"></polyline>';
}

// ─── Сегодня по залам ───
function setupRoomToggle() {
    document.querySelectorAll('#dash-room-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-room-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _dashRoomFilter = btn.dataset.rfilter;
            const d = cacheGet('dashboard');
            if (d && d.data) renderDashRooms(d.data.today || []);
            _dashScheduleScrollHints();
        };
    });
}

function renderDashRooms(events) {
    const el = document.getElementById('dash-rooms');
    if (!el) return;
    let list = events.slice();
    if (_dashRoomFilter === 'vks') list = list.filter(_dashIsVks);
    else if (_dashRoomFilter === 'events') list = list.filter(e => !_dashIsVks(e));
    if (!list.length) {
        el.innerHTML = '<div class="dash-empty">Нет мероприятий на сегодня</div>';
        return;
    }
    const groups = {};
    list.forEach(e => {
        const key = (e.location_id == null) ? '__none__' : String(e.location_id);
        (groups[key] = groups[key] || []).push(e);
    });
    const timeVal = e => e.time ? parseInt(e.time.replace(':', ''), 10) : 99999;
    const keys = Object.keys(groups).sort((a, b) => {
        const ma = Math.min.apply(null, groups[a].map(timeVal));
        const mb = Math.min.apply(null, groups[b].map(timeVal));
        return ma - mb;
    });
    el.innerHTML = keys.map(k => {
        const evs = groups[k].sort((a, b) => timeVal(a) - timeVal(b));
        const roomName = (k === '__none__') ? 'Онлайн / без зала' : (getLocationName(k) || 'Зал');
        return '<div class="dash-room">' +
            '<div class="dash-room-head"><span class="dash-room-name">' + esc(roomName) + '</span><span class="dash-room-cnt">' + evs.length + '</span></div>' +
            '<div class="dash-room-evs">' + evs.map(_dashEventChip).join('') + '</div>' +
            '</div>';
    }).join('');
}

function _dashEventChip(e) {
    const isVks = _dashIsVks(e);
    const mode = isVks ? 'vks' : 'events';
    const end = _dashEndTime(e.time, e.duration);
    const timeStr = (e.time || '--:--') + (end ? '<span class="dash-ev-end">–' + end + '</span>' : '');
    const isSeries = e.series_id != null;
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const docs = e.documents || [];
    const cls = ['dash-ev', isVks ? 'vks' : 'evt', e.completed ? 'completed' : '', isSeries ? 'series' : ''].filter(Boolean).join(' ');
    let meta = '';
    if (isSeries) meta += '<span class="dash-ev-chip series">' + DASH_REPEAT_SVG + 'Серия</span>';
    if (org) meta += '<span class="dash-ev-chip">' + DASH_USER_SVG + esc(org) + '</span>';
    let icons = '';
    if (e.url) icons += '<a class="dash-ev-ic" href="' + esc(e.url) + '" target="_blank" onclick="event.stopPropagation()" title="Открыть ссылку">' + DASH_LINK_SVG + '</a>';
    if (docs.length) icons += '<span class="dash-ev-ic doc" title="Документов: ' + docs.length + '">' + DASH_DOC_SVG + (docs.length > 1 ? '<b>' + docs.length + '</b>' : '') + '</span>';
    return '<div class="' + cls + '" onclick="openEditEventModal(\'' + e.id + '\', \'' + mode + '\')">' +
        '<span class="dash-ev-time">' + timeStr + '</span>' +
        '<span class="dash-ev-body">' +
            '<span class="dash-ev-desc">' + esc(e.description || '(без описания)') + '</span>' +
            (meta ? '<span class="dash-ev-meta">' + meta + '</span>' : '') +
        '</span>' +
        (icons ? '<span class="dash-ev-icons">' + icons + '</span>' : '') +
        '<span class="dash-ev-tag">' + (isVks ? 'ВКС' : 'Мер.') + '</span>' +
        '<button class="dash-ev-done ' + (e.completed ? 'active' : '') + '" onclick="event.stopPropagation();dashConfirmCompleteEvent(\'' + e.id + '\', ' + (!e.completed) + ')" title="' + (e.completed ? 'Снять завершение' : 'Завершить') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg></button>' +
        '</div>';
}

// ─── Скоро ───
function renderDashSoon(events) {
    const el = document.getElementById('dash-soon');
    if (!el) return;
    if (!events.length) { el.innerHTML = '<div class="dash-empty">Нет ближайших</div>'; return; }
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    el.innerHTML = events.map(e => {
        const isVks = _dashIsVks(e);
        const mode = isVks ? 'vks' : 'events';
        const d = e.date ? new Date(e.date + 'T00:00:00') : null;
        const dateStr = d ? (dayNames[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1)) : '';
        const isSeries = e.series_id != null;
        return '<div class="dash-soon-item ' + (isVks ? 'vks' : 'evt') + ' ' + (e.completed ? 'completed' : '') + '" onclick="openEditEventModal(\'' + e.id + '\', \'' + mode + '\')">' +
            '<span class="dash-soon-when"><b>' + dateStr + '</b>' + (e.time || '--:--') + '</span>' +
            '<span class="dash-soon-desc">' + (isSeries ? DASH_REPEAT_SVG : '') + esc(e.description || '(без описания)') + '</span>' +
            '<span class="dash-ev-tag">' + (isVks ? 'ВКС' : 'Мер.') + '</span>' +
            '</div>';
    }).join('');
}

// ─── Кольцо завершённости ───
function renderDashRing(completed, total) {
    const el = document.getElementById('dash-ring');
    if (!el) return;
    const pct = total > 0 ? Math.round(completed / total * 100) : 0;
    const rest = Math.max(total - completed, 0);
    el.innerHTML = '<div class="dash-ring" style="--pct:' + pct + '">' +
            '<div class="dash-ring-hole"><span class="dash-ring-pct">' + pct + '%</span><span class="dash-ring-sub">' + completed + ' из ' + total + '</span></div>' +
        '</div>' +
        '<div class="dash-ring-legend">' +
            '<span><i class="lg done"></i>Завершено ' + completed + '</span>' +
            '<span><i class="lg rest"></i>Осталось ' + rest + '</span>' +
        '</div>';
}

// ─── Рейтинг залов ───
function renderDashLocations() {
    const c = cacheGet('dashboard');
    _renderDashLocationsFromCache(c && c.data);
}

function _renderDashLocationsFromCache(data) {
    if (!data) return;
    const periods = data.locations || {
        today: data.locations_today || {},
        month: data.locations_month || {},
        year: data.locations_year || data.locations_total || {},
    };
    const src = periods[_locPeriod] || {};
    const entries = Object.keys(src)
        .map(id => ({ name: getLocationName(id) || 'Зал', count: src[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);

    const subtitle = document.getElementById('dash-loc-subtitle');
    if (subtitle) {
        const period = data.location_period || {};
        const monthNames = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
        if (_locPeriod === 'today') subtitle.textContent = 'Фактические occurrences сегодня';
        else if (_locPeriod === 'month') subtitle.textContent = 'Фактические occurrences за ' + (monthNames[(period.month || (new Date().getMonth() + 1)) - 1] || 'месяц');
        else subtitle.textContent = 'Фактические occurrences за ' + (period.year || new Date().getFullYear()) + ' год';
    }
    renderBarList('dash-loc-total', entries, 'accent');
}

function setupLocToggle() {
    document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _locPeriod = btn.dataset.locp;
            renderDashLocations();
            _dashScheduleScrollHints();
        };
    });
}

function renderBarList(elId, entries, colorVar) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) {
        el.innerHTML = '<div class="dash-empty">Нет данных за выбранный период</div>';
        return;
    }
    const max = entries[0].count || 1;
    el.innerHTML = entries.map(e => {
        const pct = Math.round(e.count / max * 100);
        return '<div class="dash-bar-row">' +
            '<div class="dash-bar-name">' + esc(e.name) + '</div>' +
            '<div class="dash-bar-count">' + e.count + ' · ' + pct + '%</div>' +
            '<div class="dash-bar-wrap"><div class="dash-bar" style="width:' + pct + '%; background: var(--' + colorVar + ');"></div></div>' +
        '</div>';
    }).join('');
}

// ─── График (две серии) ───
function setupChartToggle() {
    document.querySelectorAll('#dash-chart-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-chart-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _dashPeriod = btn.dataset.period;
            drawChart();
        };
    });
}

function _dashRenderChart(labels, vks, events) {
    const el = document.getElementById('dash-chart');
    if (!el) return;
    if (!labels.length) { el.innerHTML = '<div class="dash-empty">Нет данных</div>'; return; }
    const max = Math.max.apply(null, vks.concat(events).concat([1]));
    const showVals = labels.length <= 13;   // чтобы цифры не налезали друг на друга в плотных режимах
    el.innerHTML = '<div class="dash-chart-bars">' + labels.map((lb, i) => {
        const v = vks[i] || 0, m = events[i] || 0;
        const vals = showVals
            ? '<div class="dash-chart-vals"><span class="cv vks">' + (v || '') + '</span><span class="cv evt">' + (m || '') + '</span></div>'
            : '';
        return '<div class="dash-chart-col">' +
            vals +
            '<div class="dash-chart-pair">' +
                '<div class="dash-chart-bar vks" style="height:' + (v / max * 100) + '%" title="ВКС: ' + v + '"></div>' +
                '<div class="dash-chart-bar evt" style="height:' + (m / max * 100) + '%" title="Мероприятия: ' + m + '"></div>' +
            '</div>' +
            '<div class="dash-chart-label">' + lb + '</div>' +
        '</div>';
    }).join('') + '</div>';
}

function drawChart() {
    const c = cacheGet('dashboard');
    if (!c || !c.data) return;
    const d = c.data;
    const monthNav = document.getElementById('dash-month-nav');
    const monthLabel = document.getElementById('dash-chart-month-label');
    const showMonthNav = _dashPeriod === 'month';
    if (monthNav) monthNav.style.display = showMonthNav ? 'flex' : 'none';
    if (_dashPeriod === 'week') {
        _dashRenderChart(['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], (d.chart_week && d.chart_week.vks) || [], (d.chart_week && d.chart_week.events) || []);
    } else if (_dashPeriod === 'year') {
        _dashRenderChart(['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'], (d.chart_year && d.chart_year.vks) || [], (d.chart_year && d.chart_year.events) || []);
    } else if (_dashPeriod === 'month') {
        _drawChartRemote('month', monthLabel);
    } else if (_dashPeriod === 'all') {
        _drawChartRemote('all', null);
    }
}

async function _drawChartRemote(period, monthLabel) {
    const el = document.getElementById('dash-chart');
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    let url = '/admin/api/dashboard/chart?period=' + period;
    if (period === 'month') {
        url += '&year=' + _dashYear + '&month=' + (_dashMonth + 1);
        if (monthLabel) monthLabel.textContent = monthNames[_dashMonth] + ' ' + _dashYear;
    }
    try {
        const resp = await fetch(url, { credentials: 'same-origin' });
        const data = await resp.json();
        _dashRenderChart(data.labels || [], data.vks || [], data.events || []);
    } catch (e) {
        if (el) el.innerHTML = '<div class="dash-empty">Ошибка загрузки</div>';
    }
}

function dashMonthNav(dir) {
    _dashMonth += dir;
    if (_dashMonth < 0) { _dashMonth = 11; _dashYear--; }
    if (_dashMonth > 11) { _dashMonth = 0; _dashYear++; }
    drawChart();
}

// ─── Завершение события из дашборда ───
function dashConfirmCompleteEvent(id, checked) {
    const action = checked ? 'завершить' : 'снять завершение с';
    document.getElementById('confirm-text').textContent = action.charAt(0).toUpperCase() + action.slice(1) + ' событие?';
    document.getElementById('confirm-actions').innerHTML =
        '<button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>' +
        '<button class="btn btn-primary" id="confirm-ok-btn">Подтвердить</button>';
    document.getElementById('confirm-cancel-btn').onclick = closeConfirm;
    document.getElementById('confirm-ok-btn').onclick = async function () {
        this.disabled = true;
        this.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Выполняю...';
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        cancelBtn.disabled = true;
        cancelBtn.style.pointerEvents = 'none';
        cancelBtn.style.opacity = '0.5';
        const overlay = document.getElementById('confirm-overlay');
        overlay.querySelector('.confirm-icon').innerHTML = '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
        overlay.querySelector('h3').textContent = 'Выполняю...';
        overlay.querySelector('p').textContent = '';
        await dashCompleteEvent(id, checked);
        closeConfirm();
    };
    const overlay = document.getElementById('confirm-overlay');
    const icon = overlay.querySelector('.confirm-icon');
    const title = overlay.querySelector('h3');
    const origIconHTML = icon.innerHTML;
    const origTitle = title.textContent;
    icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>';
    icon.style.background = 'rgba(74, 222, 128, 0.1)';
    icon.style.color = 'var(--success)';
    title.textContent = checked ? 'Завершить событие?' : 'Снять завершение?';
    overlay.classList.add('show');
    const observer = new MutationObserver(() => {
        if (!overlay.classList.contains('show')) {
            icon.innerHTML = origIconHTML;
            icon.style.background = '';
            icon.style.color = '';
            title.textContent = origTitle;
            observer.disconnect();
        }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

async function dashCompleteEvent(id, checked) {
    const csrfToken = getCsrfToken();
    try {
        const formData = new FormData();
        formData.append('completed', checked ? 'true' : 'false');
        formData.append('csrf_token', csrfToken);
        const resp = await fetch('/admin/api/events/' + id, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken },
            body: formData
        });
        const data = await resp.json();
        if (data.ok) {
            refreshDashboard();
            showToast(checked ? 'Событие завершено' : 'Событие восстановлено', 'success');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
