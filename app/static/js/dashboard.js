// ─── Dashboard / Обзор (combo: операционный + аналитика · ВКС и Мероприятия) ───

let _dashPeriod = 'week';
let _dashMonth = new Date().getMonth();
let _dashYear = new Date().getFullYear();
let _locPeriod = 'all';        // рейтинг залов: all | today
let _dashRoomFilter = 'all';   // сегодня по залам: all | vks | events

const DASH_REPEAT_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

async function initDashboard() {
    setupDashboardQuickNav();
    setupRoomToggle();
    setupChartToggle();
    setupLocToggle();
    await pageInit('dashboard', renderDashboard, async () => {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (resp.ok) cacheSet('dashboard', await resp.json());
    });
}

async function refreshDashboard() {
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (resp.ok) cacheSet('dashboard', await resp.json());
    } catch (e) {}
    renderDashboard();
}

// ─── Быстрые переходы ───
function setupDashboardQuickNav() {
    document.querySelectorAll('#dash-quicknav [data-qaction]').forEach(btn => {
        btn.onclick = () => {
            const a = btn.dataset.qaction;
            if (a === 'new-vks') {
                navigateTo('/conferences/');
                setTimeout(() => { if (typeof openAddEventModal === 'function') openAddEventModal('vks'); }, 150);
            } else if (a === 'new-event') {
                navigateTo('/events/');
                setTimeout(() => { if (typeof openAddEventModal === 'function') openAddEventModal('events'); }, 150);
            } else if (a === 'calendar') {
                navigateTo('/calendar/');
            } else if (a === 'vks') {
                navigateTo('/conferences/');
            } else if (a === 'events') {
                navigateTo('/events/');
            } else if (a === 'missed') {
                if (typeof _pendingVksFilter !== 'undefined') _pendingVksFilter = 'missed';
                navigateTo('/conferences/');
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
function renderDashboard() {
    const cached = cacheGet('dashboard');
    if (!cached || !cached.data) return;
    const d = cached.data;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const vks = d.vks || {}, evt = d.events || {}, sum = d.summary || {};
    set('dash-kpi-vks', vks.total || 0);
    set('dash-kpi-events', evt.total || 0);
    set('dash-kpi-active', sum.active || 0);
    set('dash-kpi-completed', sum.completed || 0);
    set('dash-kpi-missed', sum.missed || 0);
    set('dash-nav-vks-cnt', vks.total || 0);
    set('dash-nav-events-cnt', evt.total || 0);
    set('dash-nav-missed-cnt', sum.missed || 0);
    _dashSparkline('dash-spark-vks', (d.chart_week && d.chart_week.vks) || []);
    _dashSparkline('dash-spark-events', (d.chart_week && d.chart_week.events) || []);
    renderDashRooms(d.today || []);
    renderDashSoon(d.soon || []);
    renderDashRing(sum.completed || 0, sum.total || 0);
    _renderDashLocationsFromCache(d);
    drawChart();
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
        const roomName = (k === '__none__') ? 'Онлайн / без зала' : (getLocationName(parseInt(k, 10)) || 'Зал');
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
    const timeStr = e.time ? (e.time + (end ? '<span class="dash-ev-end">–' + end + '</span>' : '')) : '--:--';
    const isSeries = e.series_id != null;
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const cls = ['dash-ev', isVks ? 'vks' : 'evt', e.completed ? 'completed' : '', isSeries ? 'series' : ''].filter(Boolean).join(' ');
    return '<div class="' + cls + '" onclick="openEditEventModal(\'' + e.id + '\', \'' + mode + '\')">' +
        '<span class="dash-ev-time">' + timeStr + '</span>' +
        '<span class="dash-ev-body">' +
            '<span class="dash-ev-desc">' + (isSeries ? DASH_REPEAT_SVG : '') + esc(e.description || '') + '</span>' +
            (org ? '<span class="dash-ev-org">' + esc(org) + '</span>' : '') +
        '</span>' +
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
        const d = e.date ? new Date(e.date) : null;
        const dateStr = d ? (dayNames[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1)) : '';
        const isSeries = e.series_id != null;
        return '<div class="dash-soon-item ' + (isVks ? 'vks' : 'evt') + ' ' + (e.completed ? 'completed' : '') + '" onclick="openEditEventModal(\'' + e.id + '\', \'' + mode + '\')">' +
            '<span class="dash-soon-when"><b>' + dateStr + '</b>' + (e.time || '--:--') + '</span>' +
            '<span class="dash-soon-desc">' + (isSeries ? DASH_REPEAT_SVG : '') + esc(e.description || '') + '</span>' +
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
    const src = _locPeriod === 'today' ? (data.locations_today || {}) : (data.locations_total || {});
    const entries = Object.keys(src)
        .map(id => ({ name: getLocationName(parseInt(id, 10)) || 'Зал', count: src[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
    renderBarList('dash-loc-total', entries, 'accent');
}

function setupLocToggle() {
    document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _locPeriod = btn.dataset.locp;
            renderDashLocations();
        };
    });
}

function renderBarList(elId, entries, colorVar) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) {
        el.innerHTML = '<div class="dash-empty">Нет данных</div>';
        return;
    }
    const max = entries[0].count || 1;
    el.innerHTML = entries.map(e =>
        '<div class="dash-bar-row">' +
            '<div class="dash-bar-name">' + esc(e.name) + '</div>' +
            '<div class="dash-bar-wrap"><div class="dash-bar" style="width:' + (e.count / max * 100) + '%; background: var(--' + colorVar + ');"></div></div>' +
            '<div class="dash-bar-count">' + e.count + '</div>' +
        '</div>'
    ).join('');
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
    el.innerHTML = '<div class="dash-chart-bars">' + labels.map((lb, i) => {
        const v = vks[i] || 0, m = events[i] || 0;
        return '<div class="dash-chart-col">' +
            '<div class="dash-chart-pair">' +
                '<div class="dash-chart-bar vks" style="height:' + (v / max * 100) + '%" title="ВКС: ' + v + '"><span class="dash-chart-cnt">' + (v || '') + '</span></div>' +
                '<div class="dash-chart-bar evt" style="height:' + (m / max * 100) + '%" title="Мероприятия: ' + m + '"><span class="dash-chart-cnt">' + (m || '') + '</span></div>' +
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
