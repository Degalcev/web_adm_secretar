// ─── Dashboard / Обзор ──────────────────────────────────────────────

let _dashEvents = [];
let _dashLocations = {};
let _dashOrganizers = {};
let _dashPeriod = 'week';
let _dashMonth = new Date().getMonth();
let _dashYear = new Date().getFullYear();
let _dashDateTimeInterval = null;

function initDashboard() {
    updateDateTime();
    if (_dashDateTimeInterval) clearInterval(_dashDateTimeInterval);
    _dashDateTimeInterval = setInterval(updateDateTime, 1000);

    // Restore cached data instantly
    const cached = localStorage.getItem('dash_cache');
    if (cached) {
        try {
            const c = JSON.parse(cached);
            _dashEvents = c.events || [];
            _dashLocations = c.locations || {};
            _dashOrganizers = c.organizers || {};
            if (typeof allEvents !== 'undefined') allEvents = _dashEvents;
            renderDashboard();
        } catch (e) {}
    }

    loadDashboardData();
    setupDashboardClicks();
}

let _dashLastDay = '';

function updateDateTime() {
    const el = document.getElementById('dash-datetime');
    if (!el) return;
    const now = new Date();
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    el.innerHTML = `<span class="dash-dt-day">${day}</span>, <span class="dash-dt-date">${date} ${month} ${year}</span> <span class="dash-dt-time">${hours}:${minutes}:${seconds}</span>`;

    const todayStr = `${year}-${now.getMonth()}-${now.getDate()}`;
    if (_dashLastDay && _dashLastDay !== todayStr) {
        loadDashboardData();
    }
    _dashLastDay = todayStr;
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

function applyDashboardFilter(filter) {
    if (!filter) return;
    if (typeof _pendingVksFilter !== 'undefined') {
        _pendingVksFilter = filter;
    }
}

async function loadDashboardData() {
    try {
        const [eventsResp, locResp, orgResp] = await Promise.all([
            fetch('/admin/api/events', { credentials: 'same-origin' }),
            fetch('/admin/api/locations', { credentials: 'same-origin' }),
            fetch('/admin/api/organizers', { credentials: 'same-origin' })
        ]);

        if (!eventsResp.ok) throw new Error(eventsResp.status);

        _dashEvents = await eventsResp.json();

        // Pre-populate vks.js globals so modals and VKS page work instantly
        if (typeof allEvents !== 'undefined') {
            allEvents = _dashEvents;
        }

        const locations = await locResp.json();
        _dashLocations = {};
        locations.forEach(l => { _dashLocations[l.id] = l.name; });
        if (typeof window !== 'undefined') window.allLocations = locations;

        const organizers = await orgResp.json();
        _dashOrganizers = {};
        organizers.forEach(o => { _dashOrganizers[o.id] = o.name; });
        if (typeof window !== 'undefined') window.allOrganizers = organizers;

        // Cache for instant restore on next visit
        try {
            localStorage.setItem('dash_cache', JSON.stringify({
                events: _dashEvents,
                locations: _dashLocations,
                organizers: _dashOrganizers
            }));
        } catch (e) {}

        renderDashboard();
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function locName(id) { return _dashLocations[id] || '—'; }
function orgName(id) { return _dashOrganizers[id] || '—'; }

function renderDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const total = _dashEvents.length;
    const completed = _dashEvents.filter(e => e.completed).length;
    const active = _dashEvents.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) >= today).length;
    const missed = _dashEvents.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) < today).length;

    document.getElementById('dash-total').textContent = total;
    document.getElementById('dash-active').textContent = active;
    document.getElementById('dash-completed').textContent = completed;
    document.getElementById('dash-missed').textContent = missed;

    renderToday();
    renderSoon();
    renderLocations();
    drawChart();
    setupChartToggle();
}

function renderToday() {
    const el = document.getElementById('dash-today');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const events = _dashEvents
        .filter(e => !e.completed)
        .map(e => ({ ...e, _date: new Date(e.date + 'T' + (e.time || '23:59')) }))
        .filter(e => e._date >= today && e._date < tomorrow)
        .sort((a, b) => a._date - b._date);

    if (events.length === 0) {
        el.innerHTML = '<div class="dash-upcoming-fade"></div><div class="dash-empty">Нет мероприятий на сегодня</div>';
        el.classList.remove('has-scroll');
        return;
    }

    const items = events.slice(0, 8).map(e => renderUpcomingItem(e)).join('');
    el.innerHTML = items + '<div class="dash-upcoming-fade"></div>';
    checkUpcomingScroll(el);
}

function renderSoon() {
    const el = document.getElementById('dash-soon');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const events = _dashEvents
        .filter(e => !e.completed)
        .map(e => ({ ...e, _date: new Date(e.date + 'T' + (e.time || '23:59')) }))
        .filter(e => e._date >= tomorrow)
        .sort((a, b) => a._date - b._date);

    if (events.length === 0) {
        el.innerHTML = '<div class="dash-upcoming-fade"></div><div class="dash-empty">Нет ближайших мероприятий</div>';
        el.classList.remove('has-scroll');
        return;
    }

    const items = events.slice(0, 8).map(e => {
        const d = e._date;
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

    const meta = opts.showDate
        ? `${opts.dayName}, ${opts.dateStr} · ${locName(e.location_id)} · ${orgName(e.organizer_id)}`
        : `${locName(e.location_id)} · ${orgName(e.organizer_id)}`;

    return `
        <a class="dash-upcoming-item" onclick="event.preventDefault(); event.stopPropagation(); openEditEventModal('${e.id}');">
            <div class="dash-upcoming-time">${e.time || '--:--'}</div>
            <div class="dash-upcoming-info">
                <div class="dash-upcoming-desc">${e.description || ''}</div>
                <div class="dash-upcoming-meta">${meta}</div>
            </div>
            <div class="dash-indicators">${badges.join('')}</div>
            <label class="dash-check" onclick="event.stopPropagation(); event.preventDefault();">
                <input type="checkbox" onchange="dashCompleteEvent('${e.id}', this.checked)">
                <span class="dash-check-mark"></span>
            </label>
        </a>
    `;
}

let _locPeriod = 'all';
let _locYear = new Date().getFullYear();

function renderLocations() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const locToday = {};
    const locTotal = {};
    _dashEvents.forEach(e => {
        const id = e.location_id || 'unknown';
        const d = new Date(e.date + 'T' + (e.time || '23:59'));
        // Today count
        if (d >= today && d < tomorrow) {
            locToday[id] = (locToday[id] || 0) + 1;
        }
        // Total count based on period
        let include = false;
        if (_locPeriod === 'all') {
            include = true;
        } else if (_locPeriod === 'year') {
            include = new Date(e.date).getFullYear() === _locYear;
        } else if (_locPeriod === 'month') {
            const ed = new Date(e.date);
            include = ed.getFullYear() === _locYear && ed.getMonth() === _dashMonth;
        }
        if (include) {
            locTotal[id] = (locTotal[id] || 0) + 1;
        }
    });

    const allIds = [...new Set([...Object.keys(locToday), ...Object.keys(locTotal)])];
    const todayEntries = allIds
        .map(id => ({ name: locName(id), id, count: locToday[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);
    const totalEntries = allIds
        .map(id => ({ name: locName(id), id, count: locTotal[id] || 0 }))
        .filter(e => e.count > 0)
        .sort((a, b) => b.count - a.count);

    renderBarList('dash-loc-today', todayEntries, 'accent');
    renderBarList('dash-loc-total', totalEntries, 'accent-ambient');
    setupLocToggle();
    updateLocYearLabel();
}

function setupLocToggle() {
    document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#dash-loc-toggle .dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _locPeriod = btn.dataset.period;
            updateLocControls();
            renderLocations();
        };
    });
    updateLocControls();
}

function updateLocControls() {
    const showYearNav = _locPeriod === 'year' || _locPeriod === 'month';
    const yearLabel = document.getElementById('dash-loc-year-label');
    const yearPrev = document.getElementById('dash-loc-year-prev');
    const yearNext = document.getElementById('dash-loc-year-next');
    if (yearLabel) yearLabel.style.display = showYearNav ? 'inline' : 'none';
    if (yearPrev) yearPrev.style.display = showYearNav ? 'flex' : 'none';
    if (yearNext) yearNext.style.display = showYearNav ? 'flex' : 'none';
    if (yearLabel && showYearNav) yearLabel.textContent = _locYear;
}

function dashLocYearNav(dir) {
    _locYear += dir;
    renderLocations();
}

function dashLocMonthNav(dir) {
    _dashMonth += dir;
    if (_dashMonth < 0) { _dashMonth = 11; _locYear--; }
    if (_dashMonth > 11) { _dashMonth = 0; _locYear++; }
    renderLocations();
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
    const el = document.getElementById('dash-chart');
    const now = new Date();
    let labels = [];
    let counts = [];

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
    // Year navigation: visible for 'month' and 'year', hidden for 'week' and 'all'
    const showYearNav = _dashPeriod === 'month' || _dashPeriod === 'year';
    if (yearLabel) yearLabel.style.display = showYearNav ? 'inline' : 'none';
    if (yearPrev) yearPrev.style.display = showYearNav ? 'flex' : 'none';
    if (yearNext) yearNext.style.display = showYearNav ? 'flex' : 'none';

    if (_dashPeriod === 'week') {
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        labels = dayNames;
        counts = new Array(7).fill(0);
        const dayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayIdx);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        _dashEvents.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            if (d >= startOfWeek && d < endOfWeek) {
                let idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                counts[idx]++;
            }
        });
    } else if (_dashPeriod === 'month') {
        const daysInMonth = new Date(_dashYear, _dashMonth + 1, 0).getDate();
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        labels = [];
        counts = new Array(daysInMonth).fill(0);
        for (let i = 1; i <= daysInMonth; i++) labels.push(String(i));

        _dashEvents.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            if (d.getFullYear() === _dashYear && d.getMonth() === _dashMonth) {
                counts[d.getDate() - 1]++;
            }
        });
        if (monthLabel) monthLabel.textContent = monthNames[_dashMonth];
    } else if (_dashPeriod === 'year') {
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        labels = monthNames;
        counts = new Array(12).fill(0);

        _dashEvents.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            if (d.getFullYear() === _dashYear) {
                counts[d.getMonth()]++;
            }
        });
    } else if (_dashPeriod === 'all') {
        const yearSet = new Set();
        _dashEvents.forEach(e => { if (e.date) yearSet.add(new Date(e.date).getFullYear()); });
        const years = [...yearSet].sort((a, b) => a - b);
        if (years.length === 0) {
            const curYear = now.getFullYear();
            for (let y = curYear - 4; y <= curYear; y++) years.push(y);
        }
        labels = years.map(String);
        counts = years.map(y => _dashEvents.filter(e => e.date && new Date(e.date).getFullYear() === y).length);
    }

    if (yearLabel && yearLabel.style.display !== 'none') {
        yearLabel.textContent = _dashYear;
    }

    const max = Math.max(...counts, 1);

    el.innerHTML = `
        <div class="dash-chart-bars">
            ${counts.map((c, i) => `
                <div class="dash-chart-col">
                    <div class="dash-chart-count">${c || ''}</div>
                    <div class="dash-chart-bar-wrap">
                        <div class="dash-chart-bar" style="height: ${(c / max * 100)}%"></div>
                     </div>
                    <div class="dash-chart-label">${labels[i]}</div>
                </div>
            `).join('')}
        </div>
    `;
}

async function dashCompleteEvent(id, checked) {
    if (!checked) return;
    const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
    try {
        const resp = await fetch(`/admin/api/events/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ completed: true, csrf_token: csrfToken })
        });
        const data = await resp.json();
        if (data.ok) {
            await loadAllEvents();
            _dashEvents = [...allEvents];
            try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, locations: _dashLocations, organizers: _dashOrganizers })); } catch(e) {}
            renderDashboard();
            showToast('ВКС завершено', 'success');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
