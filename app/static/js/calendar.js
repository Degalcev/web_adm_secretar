// ─── Календарь VKS ────────────────────────────────────────────────────

const CAL_H_START = 6;
const CAL_H_END = 23;
const CAL_HOUR_H = 60;
const CAL_TOTAL_H = (CAL_H_END - CAL_H_START) * CAL_HOUR_H;

const CAL_DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const CAL_MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const CAL_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let calWeekStart = getMonday(new Date());
let calActiveDay = new Date();
let calNowLineTimer = null;

// ─── Утилиты ────────────────────────────────────────────────────────

function getMonday(d) {
    const r = new Date(d);
    const day = r.getDay();
    r.setDate(r.getDate() - day + (day === 0 ? -6 : 1));
    r.setHours(0, 0, 0, 0);
    return r;
}

function calAddDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function calFmtShort(d) {
    return `${d.getDate()} ${CAL_MONTHS_GEN[d.getMonth()]}`;
}

function calFmtFull(d) {
    return `${calAddDays(calWeekStart, 0).getDate()} – ${calAddDays(calWeekStart, 6).getDate()} ${CAL_MONTHS_FULL[calWeekStart.getMonth()]} ${calWeekStart.getFullYear()}`;
}

function calTimeToMin(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function calFmtEnd(e) {
    const s = calTimeToMin(e.time) + (e.dur || 60);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function calEventStatus(e) {
    if (e.completed) return 'done';
    const today = localDateStr(new Date());
    if (e.date && e.date < today) return 'missed';
    return 'active';
}

function calGetOrgName(id) {
    const o = (store.allOrganizers || []).find(x => x.id === id);
    return o ? (o.short_name || o.name) : '';
}

function calGetLocName(id) {
    const l = (store.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}

// ─── Инициализация ──────────────────────────────────────────────────

function initCalendar() {
    calWeekStart = getMonday(new Date());
    calActiveDay = new Date();
    renderCalendar();
}

// ─── Навигация ──────────────────────────────────────────────────────

function calPrevWeek() {
    calWeekStart.setDate(calWeekStart.getDate() - 7);
    calActiveDay = new Date(calWeekStart);
    renderCalendar();
}

function calNextWeek() {
    calWeekStart.setDate(calWeekStart.getDate() + 7);
    calActiveDay = new Date(calWeekStart);
    renderCalendar();
}

function calGoToday() {
    calWeekStart = getMonday(new Date());
    calActiveDay = new Date();
    renderCalendar();
}

function calSelectDay(idx) {
    calActiveDay = calAddDays(calWeekStart, idx);
    renderCalendar();
}

// ─── Заголовок ──────────────────────────────────────────────────────

function calUpdateTitle() {
    const el = document.getElementById('cal-title');
    if (el) el.textContent = calFmtFull(calActiveDay);
}

// ─── Вкладки дней ────────────────────────────────────────────────────

function renderDayTabs() {
    const tabs = document.getElementById('cal-day-tabs');
    if (!tabs) return;
    const today = localDateStr(new Date());
    let html = '';
    for (let i = 0; i < 7; i++) {
        const d = calAddDays(calWeekStart, i);
        const ds = localDateStr(d);
        const isActive = ds === localDateStr(calActiveDay);
        const isToday = ds === today;
        html += `<div class="day-tab${isActive ? ' active' : ''}${isToday ? ' today' : ''}" onclick="calSelectDay(${i})"><span class="dn">${CAL_DAY_NAMES[i]}</span><span class="dd">${d.getDate()}</span></div>`;
    }
    tabs.innerHTML = html;
}

// ─── Рендер сетки ───────────────────────────────────────────────────

function renderCalendar() {
    calUpdateTitle();
    renderDayTabs();
    _calRenderGrid();
    calUpdateNowLine();
}

function _calRenderGrid() {
    const container = document.getElementById('cal-container');
    if (!container) return;

    const ds = localDateStr(calActiveDay);
    const dayEvents = _calGetEventsForDate(ds);
    const locations = store.allLocations || [];

    let html = '<div class="cal">';

    // Колонка времени
    html += `<div class="cal-time" style="height:${CAL_TOTAL_H}px">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="cal-time-label" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px">${String(h).padStart(2, '0')}:00</div>`;
        html += `<div class="hour-line" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px"></div>`;
    }
    html += '</div>';

    // Колонки локаций
    locations.forEach((loc, li) => {
        const locEvents = dayEvents
            .filter(e => e.location_id === loc.id)
            .sort((a, b) => calTimeToMin(a.time) - calTimeToMin(b.time));

        html += `<div class="cal-col"><div class="cal-col-hdr h${li % 4}">${esc(loc.name)}</div><div style="height:${CAL_TOTAL_H}px;position:relative">`;

        // Горизонтальные линии часов
        for (let h = CAL_H_START; h < CAL_H_END; h++) {
            html += `<div class="hour-line" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px"></div>`;
        }

        // Группы пересекающихся событий
        const groups = findOverlapGroups(locEvents);
        groups.forEach(group => {
            const cols = group.length;
            group.forEach((e, ci) => {
                const start = calTimeToMin(e.time);
                const dur = e.dur || 60;
                const top = ((start - CAL_H_START * 60) / 60) * CAL_HOUR_H;
                const height = (dur / 60) * CAL_HOUR_H;
                const w = `calc((100% - ${(cols - 1) * 3}px) / ${cols})`;
                const left = ci === 0 ? '0' : `calc(${ci} * (100% - ${(cols - 1) * 3}px) / ${cols} + ${ci * 3}px)`;

                const isSplit = cols > 1;
                const status = calEventStatus(e);
                const orgName = calGetOrgName(e.organizer_id);
                const docCount = (e.documents || []).length;
                const hasUrl = e.url && e.url.trim().length > 0;

                html += `<div class="cal-ev h${li % 4}${isSplit ? ' split' : ''}" style="top:${top}px;height:${height}px;left:${left};width:${w}" onclick="openEditEventModal('${esc(e.id)}')" title="${esc(e.type || 'ВКС')}: ${esc(e.description || '')}${orgName ? ' (' + esc(orgName) + ')' : ''}\\n${esc(e.time || '')}–${calFmtEnd(e)}">`;
                html += `<div style="display:flex;align-items:center;gap:4px"><span class="ev-status ${status}"></span><span class="ev-type">${esc(e.type || 'ВКС')}</span></div>`;
                html += `<div class="ev-time">${esc(e.time || '--:--')}–${calFmtEnd(e)}</div>`;
                if (orgName) html += `<div class="ev-org">${esc(orgName)}</div>`;
                if (e.description) html += `<div class="ev-desc">${esc(e.description)}</div>`;
                html += '<div class="ev-badges">';
                if (docCount > 0) html += `<span class="ev-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${docCount}</span>`;
                if (hasUrl) html += '<span class="ev-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span>';
                html += '</div>';
                html += '</div>';
            });
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;

    // Прокрутка к 8:00
    const scrollEl = container.closest('.page.active') || container.parentElement;
    if (scrollEl) scrollEl.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
}

function _calGetEventsForDate(ds) {
    return (store.allEvents || []).filter(e => e.date === ds);
}

// ─── Группировка пересекающихся событий ─────────────────────────────

function findOverlapGroups(events) {
    if (!events.length) return [];
    const groups = [];
    events.forEach(e => {
        const s = calTimeToMin(e.time);
        const end = s + (e.dur || 60);
        let placed = false;
        for (const g of groups) {
            if (g.some(ge => {
                const gs = calTimeToMin(ge.time);
                const ge2 = gs + (ge.dur || 60);
                return s < ge2 && end > gs;
            })) {
                g.push(e);
                placed = true;
                break;
            }
        }
        if (!placed) groups.push([e]);
    });
    return groups;
}

// ─── Now-line ───────────────────────────────────────────────────────

function calUpdateNowLine() {
    const ds = localDateStr(calActiveDay);
    const now = new Date();
    const today = localDateStr(now);

    // Удалить старые now-line элементы
    document.querySelectorAll('.cal .now-line, .cal .now-time').forEach(el => el.remove());

    if (ds !== today) return;

    const hm = now.getHours();
    const mm = now.getMinutes();
    if (hm < CAL_H_START || hm >= CAL_H_END) return;

    const hdrH = document.querySelector('.cal-col-hdr')?.offsetHeight || 40;
    const top = ((hm * 60 + mm - CAL_H_START * 60) / 60) * CAL_HOUR_H + hdrH;

    document.querySelectorAll('.cal-col').forEach(col => {
        const inner = col.querySelector('div[style]');
        if (!inner) return;
        const line = document.createElement('div');
        line.className = 'now-line';
        line.style.top = top + 'px';
        inner.appendChild(line);
        const lbl = document.createElement('div');
        lbl.className = 'now-time';
        lbl.style.top = (top - 10) + 'px';
        lbl.textContent = `${String(hm).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        inner.appendChild(lbl);
    });
}

// ─── Тема ───────────────────────────────────────────────────────────

function calSetTheme(id) {
    applyTheme(id);
}

// ─── Запуск таймера now-line ────────────────────────────────────────

function calStartNowLineTimer() {
    if (calNowLineTimer) clearInterval(calNowLineTimer);
    calNowLineTimer = setInterval(calUpdateNowLine, 60000);
}

function calStopNowLineTimer() {
    if (calNowLineTimer) { clearInterval(calNowLineTimer); calNowLineTimer = null; }
}
