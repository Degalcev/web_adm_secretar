// ─── Календарь VKS ────────────────────────────────────────────────────

const CAL_H_START = 6;
const CAL_H_END = 23;
const CAL_HOUR_H = 60;
const CAL_TOTAL_H = (CAL_H_END - CAL_H_START) * CAL_HOUR_H;

const CAL_DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const CAL_DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const CAL_MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const CAL_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let calWeekStart = getMonday(new Date());
let calActiveDay = new Date();

function getMonday(d) {
    const r = new Date(d);
    const day = r.getDay();
    r.setDate(r.getDate() - day + (day === 0 ? -6 : 1));
    r.setHours(0, 0, 0, 0);
    return r;
}

function initCalendar() {
    calWeekStart = getMonday(new Date());
    calActiveDay = new Date();
    preloadAllData().then(() => {
        renderCalendar(true);
        calStartNowLineTimer();
    });
}

// ─── Helpers ────────────────────────────────────────────────────────

function calTimeToMin(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function _calFmtDate(d) {
    return `${d.getDate()} ${CAL_MONTHS_FULL[d.getMonth()]}`;
}

function _calFmtShort(d) {
    return `${d.getDate()} ${CAL_MONTHS_GEN[d.getMonth()]}`;
}

function _calFmtEnd(e) {
    const s = calTimeToMin(e.time) + (e.dur || 60);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function _calGetEventsForDate(ds) {
    return (store.allEvents || []).filter(e => e.date === ds);
}

function _calFindOverlapGroups(events) {
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

// ─── Рендер: Toolbar ───────────────────────────────────────────────

function _calRenderToolbar() {
    const weekEnd = new Date(calWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let html = '<div class="cal-toolbar-nav">';
    html += '<button class="btn btn-icon" onclick="calPrevWeek()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>';
    html += `<span class="cal-toolbar-title">${_calFmtDate(calWeekStart)} – ${_calFmtDate(weekEnd)}</span>`;
    html += '<button class="btn btn-icon" onclick="calNextWeek()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>';
    html += '<button class="btn btn-accent" onclick="calGoToday()">Сегодня</button>';
    html += '</div>';
    html += '<div class="cal-toolbar-sep"></div>';

    html += '<div class="cal-filter-group"><span class="cal-filter-label">Неделя</span><select class="cal-filter-select" onchange="calSelectWeek(this.value)">';
    for (let i = -2; i <= 4; i++) {
        const d = new Date(calWeekStart);
        d.setDate(d.getDate() + i * 7);
        const de = new Date(d);
        de.setDate(de.getDate() + 6);
        const sel = i === 0 ? ' selected' : '';
        html += `<option value="${i}"${sel}>${_calFmtShort(d)} – ${_calFmtShort(de)}</option>`;
    }
    html += '</select></div>';

    html += '<div class="cal-filter-group"><span class="cal-filter-label">Месяц</span><select class="cal-filter-select" onchange="calSelectMonth(this.value)">';
    CAL_MONTHS_FULL.forEach((m, i) => {
        const sel = i === calActiveDay.getMonth() ? ' selected' : '';
        html += `<option value="${i}"${sel}>${m}</option>`;
    });
    html += '</select></div>';

    return html;
}

// ─── Рендер: Day Tabs ──────────────────────────────────────────────

function _calRenderTabs() {
    let html = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(calWeekStart);
        d.setDate(d.getDate() + i);
        const ds = localDateStr(d);
        const today = localDateStr(new Date());
        const act = ds === localDateStr(calActiveDay);
        const isToday = ds === today;
        const isWeekend = i >= 5;
        const cls = `cal-day-tab${act ? ' active' : ''}${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}`;
        html += `<div class="${cls}" onclick="calSelectDay(${i})"><span class="dn">${CAL_DAY_NAMES_FULL[i]}</span><span class="dd">${d.getDate()} ${CAL_MONTHS_GEN[d.getMonth()]}</span></div>`;
    }
    return html;
}

// ─── Рендер: Grid ──────────────────────────────────────────────────

function _calRenderGrid() {
    const locations = store.allLocations || [];

    let html = '<div class="cal-rooms-header">';
    html += '<div class="cal-rooms-hdr-cell"></div>';
    locations.forEach((loc, li) => {
        html += `<div class="cal-rooms-hdr-cell">${esc(loc.name)}</div>`;
    });
    html += '</div>';

    html += '<div class="cal-wrap" id="cal-wrap">';
    html += '<div class="cal">';

    // Time column
    html += '<div class="cal-time">';
    html += `<div class="cal-time-body" style="height:${CAL_TOTAL_H}px;position:relative">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="cal-time-label" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px">${String(h).padStart(2, '0')}:00</div>`;
    }
    html += '</div></div>';

    // Full-width hour lines overlay
    html += `<div class="cal-hour-lines" style="position:absolute;top:0;left:0;right:0;height:${CAL_TOTAL_H}px;pointer-events:none;z-index:1">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="hour-line" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px"></div>`;
    }
    html += '</div>';

    // Location columns (no header inside)
    const ds = localDateStr(calActiveDay);
    const dayEvents = _calGetEventsForDate(ds);

    locations.forEach((loc, li) => {
        const locEvents = dayEvents
            .filter(e => e.location_id === loc.id)
            .sort((a, b) => calTimeToMin(a.time) - calTimeToMin(b.time));

        html += `<div class="cal-col"><div style="height:${CAL_TOTAL_H}px;position:relative">`;

        const groups = _calFindOverlapGroups(locEvents);
        groups.forEach(group => {
            const cols = group.length;
            group.forEach((e, ci) => {
                const start = calTimeToMin(e.time);
                const dur = e.dur || 60;
                const top = ((start - CAL_H_START * 60) / 60) * CAL_HOUR_H;
                const height = (dur / 60) * CAL_HOUR_H;
                const w = `calc((100% - ${(cols - 1) * 3}px) / ${cols})`;
                const left = ci === 0 ? '0' : `calc(${ci} * (100% - ${(cols - 1) * 3}px) / ${cols} + ${ci * 3}px)`;
                const splitCls = cols > 1 ? ' split' : '';

                const now = new Date();
                const today = localDateStr(now);
                let status = 'active';
                if (e.completed) status = 'done';
                else if (ds < today && !e.completed) status = 'missed';

                const orgName = (store.allOrganizers || []).find(o => o.id === e.organizer_id)?.name || '';

                html += `<div class="cal-ev h${li % 4}${splitCls}" style="top:${top}px;height:${height}px;left:${left};width:${w}" onclick="openEditEventModal('${e.id}')">`;
                html += `<div style="display:flex;align-items:center;gap:4px"><span class="ev-status ${status}"></span><span class="ev-type">${esc(e.type || 'ВКС')}</span></div>`;
                html += `<div class="ev-time">${esc(e.time || '')}${dur ? ' – ' + _calFmtEnd(e) : ''}</div>`;
                if (orgName) html += `<div class="ev-org">${esc(orgName)}</div>`;
                if (e.description) html += `<div class="ev-desc">${esc(e.description)}</div>`;
                html += '<div class="ev-badges">';
                if (e.documents && e.documents.length > 0) {
                    html += `<span class="ev-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${e.documents.length}</span>`;
                }
                if (e.url) {
                    html += '<span class="ev-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span>';
                }
                html += '</div></div>';
            });
        });

        html += '</div></div>';
    });

    html += '</div></div>';
    return html;
}

// ─── Рендер: Main ──────────────────────────────────────────────────

function renderCalendar(full) {
    const container = document.getElementById('cal-container');
    if (!container) return;

    if (full) {
        _calNowLines = [];
        _calNowTimeLabel = null;
        let html = '<div class="cal-toolbar" id="cal-toolbar"></div>';
        html += '<div class="cal-panel" id="cal-panel">';
        html += '<svg class="cal-shadow-svg" id="cal-shadow-svg" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tabShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="rgba(0,0,0,0.3)"/></filter></defs><path id="cal-shadow-path" fill="none" stroke="rgba(0,0,0,0.01)" stroke-width="1" filter="url(#tabShadow)"/></svg>';
        html += '<div class="cal-day-tabs" id="cal-day-tabs"></div>';
        html += '<div id="cal-grid-area"></div></div>';
        container.innerHTML = html;

        document.getElementById('cal-toolbar').innerHTML = _calRenderToolbar();
        document.getElementById('cal-day-tabs').innerHTML = _calRenderTabs();
        document.getElementById('cal-grid-area').innerHTML = _calRenderGrid();

        calUpdateNowLine();
        _calInitHoverFix();
        _calUpdateShadow();

        const wrap = document.getElementById('cal-wrap');
        if (wrap) wrap.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
    } else {
        _calNowLines = [];
        _calNowTimeLabel = null;
        const tabsEl = document.getElementById('cal-day-tabs');
        const gridArea = document.getElementById('cal-grid-area');
        if (tabsEl) tabsEl.innerHTML = _calRenderTabs();
        if (gridArea) {
            gridArea.innerHTML = _calRenderGrid();
            calUpdateNowLine();
            _calInitHoverFix();
            _calUpdateShadow();
        }
    }
}

// ─── Now-line ───────────────────────────────────────────────────────

let _calNowLines = [];
let _calNowTimeLabel = null;

function calUpdateNowLine() {
    const ds = localDateStr(calActiveDay);
    const now = new Date();
    const today = localDateStr(now);

    if (ds !== today || now.getHours() < CAL_H_START || now.getHours() >= CAL_H_END) {
        _calNowLines.forEach(el => el.remove());
        _calNowLines = [];
        if (_calNowTimeLabel) { _calNowTimeLabel.remove(); _calNowTimeLabel = null; }
        return;
    }

    const hm = now.getHours();
    const mm = now.getMinutes();
    const top = ((hm * 60 + mm - CAL_H_START * 60) / 60) * CAL_HOUR_H;

    // Create or update now-lines in each location column
    const cols = document.querySelectorAll('.cal-col');
    while (_calNowLines.length > cols.length) _calNowLines.pop().remove();

    cols.forEach((col, i) => {
        const inner = col.querySelector('div[style]');
        if (!inner) return;
        if (!_calNowLines[i]) {
            const line = document.createElement('div');
            line.className = 'now-line';
            inner.appendChild(line);
            _calNowLines[i] = line;
        }
        _calNowLines[i].style.top = top + 'px';
    });

    // Create or update now-time on the time column
    const timeBody = document.querySelector('.cal-time-body');
    if (timeBody) {
        // Ensure a now-line exists on the time column too
        if (!_calNowLines[cols.length]) {
            const line = document.createElement('div');
            line.className = 'now-line';
            timeBody.appendChild(line);
            _calNowLines[cols.length] = line;
        }
        _calNowLines[cols.length].style.top = top + 'px';

        if (!_calNowTimeLabel) {
            _calNowTimeLabel = document.createElement('div');
            _calNowTimeLabel.className = 'now-time';
            timeBody.appendChild(_calNowTimeLabel);
        }
        _calNowTimeLabel.style.top = (top + 4) + 'px';
        _calNowTimeLabel.textContent = `${String(hm).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
}

// ─── Navigation ─────────────────────────────────────────────────────

function calPrevWeek() { calWeekStart.setDate(calWeekStart.getDate() - 7); calActiveDay = new Date(calWeekStart); renderCalendar(true); }
function calNextWeek() { calWeekStart.setDate(calWeekStart.getDate() + 7); calActiveDay = new Date(calWeekStart); renderCalendar(true); }
function calGoToday() { calWeekStart = getMonday(new Date()); calActiveDay = new Date(); renderCalendar(true); }
function calSelectDay(i) { calActiveDay = new Date(calWeekStart); calActiveDay.setDate(calActiveDay.getDate() + i); renderCalendar(false); }
function calSelectWeek(v) { const b = new Date(calWeekStart); b.setDate(b.getDate() + parseInt(v) * 7); calWeekStart = b; calActiveDay = new Date(calWeekStart); renderCalendar(true); }
function calSelectMonth(m) { calActiveDay.setMonth(parseInt(m)); calWeekStart = getMonday(calActiveDay); renderCalendar(true); }

// ─── Shadow SVG ─────────────────────────────────────────────────────

function _calUpdateShadow() {
    const activeTab = document.querySelector('.cal-day-tab.active');
    const header = document.querySelector('.cal-rooms-header');
    const panel = document.getElementById('cal-panel');
    const path = document.getElementById('cal-shadow-path');
    if (!activeTab || !header || !panel || !path) return;

    const tabRect = activeTab.getBoundingClientRect();
    const hdrRect = header.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const rt = 10;  // tab border-radius
    const rp = 12;  // panel border-radius
    const tx = tabRect.left - panelRect.left;
    const ty = tabRect.top - panelRect.top;
    const tw = tabRect.width;
    const th = tabRect.height;
    const pw = panelRect.width;
    const ph = panelRect.height;

    const d = [
        `M ${tx + rt} ${ty}`,
        `L ${tx + tw - rt} ${ty}`,
        `A ${rt} ${rt} 0 0 1 ${tx + tw} ${ty + rt}`,
        `L ${tx + tw} ${ty + th}`,
        `L ${pw - rp} ${ty + th}`,
        `A ${rp} ${rp} 0 0 1 ${pw} ${ty + th + rp}`,
        `L ${pw} ${ph - rp}`,
        `A ${rp} ${rp} 0 0 1 ${pw - rp} ${ph}`,
        `L ${rp} ${ph}`,
        `A ${rp} ${rp} 0 0 1 0 ${ph - rp}`,
        `L 0 ${ty + th}`,
        `L ${tx} ${ty + th}`,
        `L ${tx} ${ty + rt}`,
        `A ${rt} ${rt} 0 0 1 ${tx + rt} ${ty}`,
        'Z'
    ].join(' ');

    path.setAttribute('d', d);
}

window.addEventListener('resize', _calUpdateShadow);

// ─── Hover fix: position:fixed для выхода за overflow ────────────────

let _calHoveredEl = null;
let _calHoverOrigRect = null;

function _calInitHoverFix() {
    document.querySelectorAll('.cal-ev').forEach(el => {
        el.addEventListener('mouseenter', _calOnEvEnter);
    });
}

function _calOnEvEnter(e) {
    const el = e.currentTarget;
    if (_calHoveredEl === el) return;
    if (_calHoveredEl) _calReset(_calHoveredEl);

    const rect = el.getBoundingClientRect();
    const wrap = document.getElementById('cal-wrap');
    const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
    el.dataset.origTop = el.style.top;
    el.dataset.origLeft = el.style.left;
    el.dataset.origWidth = el.style.width;
    _calHoverOrigRect = rect;

    el.style.position = 'fixed';
    el.style.top = rect.top + 'px';
    el.style.width = 'auto';
    el.style.minWidth = rect.width + 'px';
    el.style.maxWidth = (rect.width * 1.8) + 'px';

    const isRightEdge = wrapRect && (rect.right > wrapRect.right - 40);
    if (isRightEdge) {
        el.style.left = 'auto';
        el.style.right = (window.innerWidth - rect.right) + 'px';
    } else {
        el.style.left = rect.left + 'px';
        el.style.right = 'auto';
    }
    _calHoveredEl = el;
}

function _calReset(el) {
    el.style.position = 'absolute';
    el.style.top = el.dataset.origTop || '';
    el.style.left = el.dataset.origLeft || '';
    el.style.width = el.dataset.origWidth || '';
    el.style.minWidth = '';
    el.style.maxWidth = '';
    el.style.right = 'auto';
    _calHoveredEl = null;
    _calHoverOrigRect = null;
}

document.addEventListener('mousemove', function(e) {
    if (!_calHoveredEl) return;
    const r = _calHoveredEl.getBoundingClientRect();
    const margin = 4;
    if (e.clientX < r.left - margin || e.clientX > r.right + margin ||
        e.clientY < r.top - margin || e.clientY > r.bottom + margin) {
        _calReset(_calHoveredEl);
    }
});

// ─── Timer ──────────────────────────────────────────────────────────

let calNowLineTimer = null;

function calStartNowLineTimer() {
    if (calNowLineTimer) clearTimeout(calNowLineTimer);
    calUpdateNowLine();
    const now = new Date();
    const msUntilNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    calNowLineTimer = setTimeout(function tick() {
        calUpdateNowLine();
        calNowLineTimer = setTimeout(tick, 60000);
    }, msUntilNextMin);
}

function calStopNowLineTimer() { if (calNowLineTimer) { clearTimeout(calNowLineTimer); calNowLineTimer = null; } }
