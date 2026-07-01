// ─── Dashboard / Обзор ──────────────────────────────────────────────

let _dashEvents = [];
let _dashLocations = {};
let _dashOrganizers = {};
let _dashPeriod = 'week';
let _dashMonth = new Date().getMonth();
let _dashDateTimeInterval = null;

function initDashboard() {
    updateDateTime();
    if (_dashDateTimeInterval) clearInterval(_dashDateTimeInterval);
    _dashDateTimeInterval = setInterval(updateDateTime, 1000);
    loadDashboardData();
    setupDashboardClicks();
}

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
}

function setupDashboardClicks() {
    document.querySelectorAll('.dash-card[data-href]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const href = el.dataset.href;
            const filter = el.dataset.filter;
            if (!href) return;
            navigateTo(href);
            setTimeout(() => applyDashboardFilter(filter), 300);
        });
    });
}

function applyDashboardFilter(filter) {
    if (!filter) return;
    if (filter === 'active') {
        if (typeof filterVksByQuick === 'function') filterVksByQuick('all');
    } else if (filter === 'missed') {
        if (typeof filterVksByQuick === 'function') filterVksByQuick('missed');
    } else if (filter.startsWith('location:')) {
        const locId = filter.split(':')[1];
        const locSel = document.getElementById('f-vks-active-loc');
        if (locSel) {
            locSel.value = locId;
            if (typeof filterVksListActive === 'function') filterVksListActive();
        }
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

        const locations = await locResp.json();
        _dashLocations = {};
        locations.forEach(l => { _dashLocations[l.id] = l.name; });

        const organizers = await orgResp.json();
        _dashOrganizers = {};
        organizers.forEach(o => { _dashOrganizers[o.id] = o.name; });

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

    renderUpcoming();
    renderLocations();
    drawChart();
    setupChartToggle();
}

function renderUpcoming() {
    const el = document.getElementById('dash-upcoming');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);

    const upcoming = _dashEvents
        .filter(e => !e.completed)
        .map(e => ({ ...e, _date: new Date(e.date + 'T' + (e.time || '23:59')) }))
        .filter(e => e._date >= today)
        .sort((a, b) => a._date - b._date);

    const groups = [
        { label: 'Сегодня', date: today, events: [] },
        { label: 'Завтра', date: tomorrow, events: [] },
        { label: 'Послезавтра', date: dayAfter, events: [] },
    ];

    upcoming.forEach(e => {
        const d = new Date(e._date); d.setHours(0, 0, 0, 0);
        for (const g of groups) {
            if (d.getTime() === g.date.getTime()) { g.events.push(e); break; }
        }
    });

    const totalUpcoming = groups.reduce((s, g) => s + g.events.length, 0);
    if (totalUpcoming === 0) {
        el.innerHTML = '<div class="dash-empty">Нет предстоящих мероприятий</div>';
        return;
    }

    el.innerHTML = groups.map(g => {
        if (g.events.length === 0) return '';
        return `
            <div class="dash-upcoming-group">
                <div class="dash-upcoming-label">${g.label}</div>
                ${g.events.map(e => `
                    <a class="dash-upcoming-item" onclick="event.preventDefault(); event.stopPropagation(); navigateTo('/conferences/'); setTimeout(() => { openEditEventModal('${e.id}'); }, 400);">
                        <div class="dash-upcoming-time">${e.time || '--:--'}</div>
                        <div class="dash-upcoming-info">
                            <div class="dash-upcoming-desc">${e.description || 'Без описания'}</div>
                            <div class="dash-upcoming-meta">${locName(e.location_id)} · ${orgName(e.organizer_id)}</div>
                        </div>
                    </a>
                `).join('')}
            </div>
        `;
    }).join('');
}

function renderLocations() {
    const el = document.getElementById('dash-locations');
    const locCounts = {};
    _dashEvents.forEach(e => {
        const id = e.location_id || 'unknown';
        locCounts[id] = (locCounts[id] || 0) + 1;
    });

    const entries = Object.entries(locCounts)
        .map(([id, count]) => ({ name: locName(id), id, count }))
        .sort((a, b) => b.count - a.count);
    const max = entries.length > 0 ? entries[0].count : 1;

    el.innerHTML = entries.map(e => `
        <a class="dash-loc-item" data-href="/conferences/" data-filter="location:${e.id}">
            <div class="dash-loc-name">${e.name}</div>
            <div class="dash-loc-bar-wrap">
                <div class="dash-loc-bar" style="width: ${(e.count / max * 100)}%"></div>
            </div>
            <div class="dash-loc-count">${e.count}</div>
        </a>
    `).join('') || '<div class="dash-empty">Нет данных</div>';

    setupDashboardClicks();
}

function setupChartToggle() {
    document.querySelectorAll('.dash-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.dash-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _dashPeriod = btn.dataset.period;
            drawChart();
        };
    });
}

function prevMonth() {
    _dashMonth--;
    if (_dashMonth < 0) { _dashMonth = 11; }
    drawChart();
}

function nextMonth() {
    _dashMonth++;
    if (_dashMonth > 11) { _dashMonth = 0; }
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
    const showMonthNav = _dashPeriod === 'month';
    if (monthLabel) monthLabel.style.display = showMonthNav ? 'inline' : 'none';
    if (monthPrev) monthPrev.style.display = showMonthNav ? 'flex' : 'none';
    if (monthNext) monthNext.style.display = showMonthNav ? 'flex' : 'none';

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
        const year = now.getFullYear();
        const daysInMonth = new Date(year, _dashMonth + 1, 0).getDate();
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        labels = [];
        counts = new Array(daysInMonth).fill(0);

        for (let i = 1; i <= daysInMonth; i++) {
            labels.push(String(i));
        }

        _dashEvents.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            if (d.getFullYear() === year && d.getMonth() === _dashMonth) {
                counts[d.getDate() - 1]++;
            }
        });

        const monthLabel = `${monthNames[_dashMonth]} ${year}`;
        document.getElementById('dash-chart-month-label').textContent = monthLabel;
    } else if (_dashPeriod === 'year') {
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        labels = monthNames;
        counts = new Array(12).fill(0);
        const year = now.getFullYear();

        _dashEvents.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            if (d.getFullYear() === year) {
                counts[d.getMonth()]++;
            }
        });
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
