// ─── Dashboard / Обзор ──────────────────────────────────────────────

let _dashEvents = [];
let _dashLocations = {};
let _dashOrganizers = {};
let _dashPeriod = 'week';
let _dashMonth = new Date().getMonth();
let _dashYear = new Date().getFullYear();

let _dashCache = null;

async function initDashboard() {
    setupDashboardClicks();
    if (_dashCache) {
        renderDashboard();
        _dashRefreshInBackground();
        return;
    }
    await _dashFetch();
    renderDashboard();
}

async function _dashFetch() {
    try {
        const resp = await fetch('/admin/api/dashboard', { credentials: 'same-origin' });
        if (!resp.ok) return;
        _dashCache = await resp.json();
    } catch (e) {
        console.error('Dashboard fetch error:', e);
    }
}

async function _dashRefreshInBackground() {
    await _dashFetch();
    renderDashboard();
}

async function refreshDashboard() {
    await _dashFetch();
    renderDashboard();
}

function setupDashboardClicks() {
    document.querySelectorAll('.dash-card[data-href]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const href = el.dataset.href;
            const filter = el.dataset.filter;
            if (!href) return;
            if (filter && typeof _pendingVksFilter !== 'undefined') {
                _pendingVksFilter = filter;
            }
            navigateTo(href);
        });
    });
}

function renderTodayFromData(events) {
    const el = document.getElementById('dash-today');
    if (!el) return;
    if (events.length === 0) {
        el.innerHTML = '<div class="dash-upcoming-fade"></div><div class="dash-empty">Нет мероприятий на сегодня</div>';
        el.classList.remove('has-scroll');
        return;
    }
    const items = events.map(e => renderUpcomingItem(e)).join('');
    el.innerHTML = items + '<div class="dash-upcoming-fade"></div>';
    checkUpcomingScroll(el);
}

function renderSoonFromData(events) {
    const el = document.getElementById('dash-soon');
    if (!el) return;
    if (events.length === 0) {
        el.innerHTML = '<div class="dash-upcoming-fade"></div><div class="dash-empty">Нет ближайших мероприятий</div>';
        el.classList.remove('has-scroll');
        return;
    }
    const items = events.map(e => {
        const d = new Date(e.date);
        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        return renderUpcomingItem(e, {
            showDate: true,
            dayName: dayNames[d.getDay()],
            dateStr: `${d.getDate()}.${d.getMonth()+1}`
        });
    }).join('');
    el.innerHTML = items + '<div class="dash-upcoming-fade"></div>';
    checkUpcomingScroll(el);
}

function locName(id) { return _dashLocations[id] || '—'; }
function orgName(id) { return _dashOrganizers[id] || '—'; }

function renderDashboard() {
    if (!_dashCache) return;
    const data = _dashCache;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dash-total', data.total);
    set('dash-active', data.active);
    set('dash-completed', data.completed);
    set('dash-missed', data.missed);
    renderTodayFromData(data.today || []);
    renderSoonFromData(data.soon || []);
    _renderDashLocationsFromCache(data);
    drawChart();
    setupChartToggle();
}

function checkUpcomingScroll(el) {
    requestAnimationFrame(() => {
        const fade = el.querySelector('.dash-upcoming-fade');
        if (fade) fade.remove();
        if (el.scrollHeight > el.clientHeight + 5) {
            el.classList.add('has-scroll');
            const f = document.createElement('div');
            f.className = 'dash-upcoming-fade';
            el.appendChild(f);
        } else {
            el.classList.remove('has-scroll');
        }
    });
}

function renderUpcomingItem(e, opts = {}) {
    const docCount = (e.documents || []).length;
    const hasUrl = e.url && e.url.trim().length > 0;
    const badges = [];
    if (docCount > 0) badges.push(`<span class="dash-indicator dash-indicator-doc" title="${docCount} док."><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${docCount}</span>`);
    if (hasUrl) badges.push(`<span class="dash-indicator dash-indicator-link" title="Есть ссылка"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>`);

    const meta = `${locName(e.location_id)} · ${orgName(e.organizer_id)}`;

    const timeHtml = opts.showDate
        ? `<div class="dash-upcoming-time">${e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id) ? `<span class="dash-upcoming-lock">${LOCK_SVG}</span>` : ''}${opts.dateStr} ${e.time || '--:--'}</div>`
        : `<div class="dash-upcoming-time">${e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id) ? `<span class="dash-upcoming-lock">${LOCK_SVG}</span>` : ''}${e.time || '--:--'}</div>`;

    return `
        <div class="dash-upcoming-item ${e.completed ? 'completed' : ''}" onclick="openEditEventModal('${e.id}');" style="cursor:pointer">
            <div class="dash-upcoming-time-col">${timeHtml}</div>
            <div class="dash-upcoming-info">
                <div class="dash-upcoming-desc">${e.description || ''}</div>
                <div class="dash-upcoming-meta">${meta}</div>
            </div>
            <div class="dash-indicators">${badges.join('')}</div>
            <button class="vks-complete-btn ${e.completed ? 'active' : ''}" onclick="event.stopPropagation();dashConfirmCompleteEvent('${e.id}', ${!e.completed})" title="${e.completed ? 'Снять завершение' : 'Завершить'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
        </div>
    `;
}

let _locPeriod = 'all';
let _locYear = new Date().getFullYear();

function renderDashLocations() {
    _renderDashLocationsFromCache(_dashCache);
}

function _renderDashLocationsFromCache(data) {
    if (!data) return;
    const locs = data.locations_total || {};
    const locsToday = data.locations_today || {};
    const allIds = new Set([...Object.keys(locs), ...Object.keys(locsToday)]);
    const todayEntries = [...allIds]
        .map(id => ({ name: getLocationName(id), id, count: locsToday[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
    const totalEntries = [...allIds]
        .map(id => ({ name: getLocationName(id), id, count: locs[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
    renderBarList('dash-loc-today', todayEntries, 'accent');
    renderBarList('dash-loc-total', totalEntries, 'accent-ambient');
    setupLocToggle();
}

function setupLocToggle() {
    document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _locPeriod = btn.dataset.period;
            updateLocControls();
            renderDashLocations();
        };
    });
    updateLocControls();
}

function dashLocYearNav(dir) {
    _locYear += dir;
    renderDashLocations();
}

function dashLocMonthNav(dir) {
    _dashMonth += dir;
    if (_dashMonth < 0) { _dashMonth = 11; _locYear--; }
    if (_dashMonth > 11) { _dashMonth = 0; _locYear++; }
    renderDashLocations();
}

function updateLocControls() {
    const showYearNav = _locPeriod === 'year' || _locPeriod === 'month';
    const showMonthNav = _locPeriod === 'month';
    const yearLabel = document.getElementById('dash-loc-year-label');
    const yearPrev = document.getElementById('dash-loc-year-prev');
    const yearNext = document.getElementById('dash-loc-year-next');
    const monthLabel = document.getElementById('dash-loc-month-label');
    const monthPrev = document.getElementById('dash-loc-month-prev');
    const monthNext = document.getElementById('dash-loc-month-next');

    if (yearLabel) { yearLabel.style.display = showYearNav ? 'inline' : 'none'; yearLabel.textContent = _locYear; }
    if (yearPrev) yearPrev.style.display = showYearNav ? 'flex' : 'none';
    if (yearNext) yearNext.style.display = showYearNav ? 'flex' : 'none';
    if (monthLabel) {
        monthLabel.style.display = showMonthNav ? 'inline' : 'none';
        if (showMonthNav) {
            const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
            monthLabel.textContent = monthNames[_dashMonth];
        }
    }
    if (monthPrev) monthPrev.style.display = showMonthNav ? 'flex' : 'none';
    if (monthNext) monthNext.style.display = showMonthNav ? 'flex' : 'none';
}

function updateLocYearLabel() {
    const el = document.getElementById('dash-loc-year-label');
    if (el) el.textContent = _locYear;
}

function renderBarList(elId, entries, colorVar) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (entries.length === 0) {
        el.innerHTML = '<div class="dash-empty">Нет данных</div>';
        return;
    }
    const max = entries[0].count || 1;
    el.innerHTML = entries.map(e => `
        <div class="dash-bar-row">
            <div class="dash-bar-name">${e.name}</div>
            <div class="dash-bar-wrap">
                <div class="dash-bar" style="width: ${(e.count / max * 100)}%; background: var(--${colorVar});"></div>
            </div>
            <div class="dash-bar-count">${e.count}</div>
        </div>
    `).join('');
}

function onDashLocClick(locId) {
    if (typeof _pendingVksFilter !== 'undefined') {
        _pendingVksFilter = 'location:' + locId;
    }
    navigateTo('/conferences/');
}

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

function prevMonth() {
    _dashMonth--;
    if (_dashMonth < 0) { _dashMonth = 11; _dashYear--; }
    drawChart();
}

function nextMonth() {
    _dashMonth++;
    if (_dashMonth > 11) { _dashMonth = 0; _dashYear++; }
    drawChart();
}

function dashMonthNav(dir) {
    if (dir < 0) prevMonth(); else nextMonth();
}

function dashYearNav(dir) {
    _dashYear += dir;
    drawChart();
}

function drawChart() {
    if (!_dashCache) return;
    const el = document.getElementById('dash-chart');
    let labels = [], counts = [];
    const monthLabel = document.getElementById('dash-chart-month-label');
    const monthPrev = document.getElementById('dash-month-prev');
    const monthNext = document.getElementById('dash-month-next');
    const yearLabel = document.getElementById('dash-chart-year-label');
    const yearPrev = document.getElementById('dash-year-prev');
    const yearNext = document.getElementById('dash-year-next');
    const showMonthNav = _dashPeriod === 'month';
    if (monthLabel) monthLabel.style.display = showMonthNav ? 'inline' : 'none';
    if (monthPrev) monthPrev.style.display = showMonthNav ? 'flex' : 'none';
    if (monthNext) monthNext.style.display = showMonthNav ? 'flex' : 'none';
    const showYearNav = _dashPeriod === 'month' || _dashPeriod === 'year';
    if (yearLabel) yearLabel.style.display = showYearNav ? 'inline' : 'none';
    if (yearPrev) yearPrev.style.display = showYearNav ? 'flex' : 'none';
    if (yearNext) yearNext.style.display = showYearNav ? 'flex' : 'none';
    if (_dashPeriod === 'week') {
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        labels = dayNames;
        counts = _dashCache.chart_week || new Array(7).fill(0);
    } else if (_dashPeriod === 'year') {
        const monthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        labels = monthNames;
        counts = _dashCache.chart_year || new Array(12).fill(0);
    } else if (_dashPeriod === 'month') {
        _drawChartMonth();
        return;
    } else if (_dashPeriod === 'all') {
        _drawChartAll();
        return;
    }
    if (yearLabel && yearLabel.style.display !== 'none') yearLabel.textContent = _dashYear;
    const max = Math.max(...counts, 1);
    el.innerHTML = `<div class="dash-chart-bars">${counts.map((c, i) => `
        <div class="dash-chart-col">
            <div class="dash-chart-count">${c || ''}</div>
            <div class="dash-chart-bar-wrap"><div class="dash-chart-bar" style="height: ${(c / max * 100)}%"></div></div>
            <div class="dash-chart-label">${labels[i]}</div>
        </div>`).join('')}
    </div>`;
}

async function _drawChartMonth() {
    const el = document.getElementById('dash-chart');
    const monthLabel = document.getElementById('dash-chart-month-label');
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    if (monthLabel) { monthLabel.style.display = 'inline'; monthLabel.textContent = monthNames[_dashMonth]; }
    try {
        const resp = await fetch(`/admin/api/dashboard/chart?period=month&year=${_dashYear}&month=${_dashMonth + 1}`, { credentials: 'same-origin' });
        const data = await resp.json();
        const max = Math.max(...data.counts, 1);
        el.innerHTML = `<div class="dash-chart-bars">${data.counts.map((c, i) => `
            <div class="dash-chart-col">
                <div class="dash-chart-count">${c || ''}</div>
                <div class="dash-chart-bar-wrap"><div class="dash-chart-bar" style="height: ${(c / max * 100)}%"></div></div>
                <div class="dash-chart-label">${data.labels[i]}</div>
            </div>`).join('')}
        </div>`;
    } catch (e) { el.innerHTML = '<div class="dash-empty">Ошибка загрузки</div>'; }
}

async function _drawChartAll() {
    const el = document.getElementById('dash-chart');
    try {
        const resp = await fetch(`/admin/api/dashboard/chart?period=all`, { credentials: 'same-origin' });
        const data = await resp.json();
        const max = Math.max(...data.counts, 1);
        el.innerHTML = `<div class="dash-chart-bars">${data.counts.map((c, i) => `
            <div class="dash-chart-col">
                <div class="dash-chart-count">${c || ''}</div>
                <div class="dash-chart-bar-wrap"><div class="dash-chart-bar" style="height: ${(c / max * 100)}%"></div></div>
                <div class="dash-chart-label">${data.labels[i]}</div>
            </div>`).join('')}
        </div>`;
    } catch (e) { el.innerHTML = '<div class="dash-empty">Ошибка загрузки</div>'; }
}

function dashConfirmCompleteEvent(id, checked) {
    const action = checked ? 'завершить' : 'снять завершение с';
    document.getElementById('confirm-text').textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} событие?`;
    document.getElementById('confirm-actions').innerHTML = `
        <button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>
        <button class="btn btn-primary" id="confirm-ok-btn">Подтвердить</button>
    `;
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
    title.textContent = checked ? 'Завершить ВКС?' : 'Снять завершение?';
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
        const resp = await fetch(`/admin/api/events/${id}`, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken },
            body: formData
        });
        const data = await resp.json();
        if (data.ok) {
            refreshDashboard();
            showToast(checked ? 'ВКС завершено' : 'ВКС восстановлено', 'success');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
