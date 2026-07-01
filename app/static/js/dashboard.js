// ─── Dashboard / Обзор ──────────────────────────────────────────────

function initDashboard() {
    updateDateTime();
    loadDashboardData();
    setupDashboardClicks();
}

function setupDashboardClicks() {
    document.querySelectorAll('.dash-card[data-filter], .dash-loc-item[data-filter]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const href = el.dataset.href;
            const filter = el.dataset.filter;
            if (!href) return;
            navigateTo(href);
            // Apply filter after navigation
            setTimeout(() => {
                if (filter === 'active') {
                    const sel = document.getElementById('f-vks-active-org');
                    // Trigger active filter via quick filter
                    if (typeof filterVksByQuick === 'function') filterVksByQuick('all');
                } else if (filter === 'missed') {
                    if (typeof filterVksByQuick === 'function') filterVksByQuick('missed');
                } else if (filter.startsWith('location:')) {
                    const locName = filter.split(':')[1];
                    const locSel = document.getElementById('f-vks-active-loc');
                    if (locSel) {
                        for (let opt of locSel.options) {
                            if (opt.text === locName || opt.value === locName) {
                                locSel.value = opt.value;
                                break;
                            }
                        }
                        if (typeof filterVksListActive === 'function') filterVksListActive();
                    }
                }
            }, 200);
        });
    });
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
    el.textContent = `${day}, ${date} ${month} ${year}, ${hours}:${minutes}`;
}

async function loadDashboardData() {
    try {
        const resp = await fetch('/api/events', { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(resp.status);
        const events = await resp.json();
        renderDashboard(events);
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function renderDashboard(events) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const total = events.length;
    const completed = events.filter(e => e.completed).length;
    const active = events.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) >= today).length;
    const missed = events.filter(e => !e.completed && new Date(e.date + 'T' + (e.time || '23:59')) < today).length;

    document.getElementById('dash-total').textContent = total;
    document.getElementById('dash-active').textContent = active;
    document.getElementById('dash-completed').textContent = completed;
    document.getElementById('dash-missed').textContent = missed;

    renderNextEvent(events, today);
    renderLocations(events);
    renderChart(events);
}

function renderNextEvent(events, today) {
    const el = document.getElementById('dash-next-event');
    const upcoming = events
        .filter(e => !e.completed)
        .map(e => ({ ...e, _date: new Date(e.date + 'T' + (e.time || '23:59')) }))
        .filter(e => e._date >= today)
        .sort((a, b) => a._date - b._date);

    if (upcoming.length === 0) {
        el.innerHTML = '<div class="dash-empty">Нет предстоящих мероприятий</div>';
        return;
    }

    const next = upcoming[0];
    const d = next._date;
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dayName = days[d.getDay()];
    const monthName = months[d.getMonth()];
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    let dateLabel = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : `${dayName}, ${d.getDate()} ${monthName}`;

    el.innerHTML = `
        <div class="dash-next-date">${dateLabel}, ${next.time || '--:--'}</div>
        <div class="dash-next-desc">${next.description || 'Без описания'}</div>
    `;
}

function renderLocations(events) {
    const el = document.getElementById('dash-locations');
    const locCounts = {};
    events.forEach(e => {
        const loc = e.location_id || 'Не указана';
        locCounts[loc] = (locCounts[loc] || 0) + 1;
    });

    const entries = Object.entries(locCounts).sort((a, b) => b[1] - a[1]);
    const max = entries.length > 0 ? entries[0][1] : 1;

    el.innerHTML = entries.map(([name, count]) => `
        <a class="dash-loc-item" data-href="/conferences/" data-filter="location:${name}">
            <div class="dash-loc-name">${name}</div>
            <div class="dash-loc-bar-wrap">
                <div class="dash-loc-bar" style="width: ${(count / max * 100)}%"></div>
            </div>
            <div class="dash-loc-count">${count}</div>
        </a>
    `).join('') || '<div class="dash-empty">Нет данных</div>';
}

function renderChart(events) {
    const el = document.getElementById('dash-chart');
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    events.forEach(e => {
        if (!e.date) return;
        const d = new Date(e.date);
        let dayIdx = d.getDay() - 1;
        if (dayIdx < 0) dayIdx = 6;
        counts[dayIdx]++;
    });

    const max = Math.max(...counts, 1);

    el.innerHTML = `
        <div class="dash-chart-bars">
            ${counts.map((c, i) => `
                <div class="dash-chart-col">
                    <div class="dash-chart-count">${c}</div>
                    <div class="dash-chart-bar-wrap">
                        <div class="dash-chart-bar" style="height: ${(c / max * 100)}%"></div>
                    </div>
                    <div class="dash-chart-label">${dayNames[i]}</div>
                </div>
            `).join('')}
        </div>
    `;
}
