// ─── Календарь VKS ────────────────────────────────────────────────────

const CAL_H_START = 6;
const CAL_H_END = 23;
const CAL_HOUR_H = 60;
const CAL_TOTAL_H = (CAL_H_END - CAL_H_START) * CAL_HOUR_H;

const CAL_DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const CAL_DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const CAL_MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const CAL_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const CAL_MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

let calWeekStart = getMonday(new Date());
let calActiveDay = new Date();

// ─── Mobile detection ───────────────────────────────────────────────
function _calIsMobile() { return window.innerWidth <= 768; }

let _calMobileRoomFilter = null; // null = все аудитории

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
        document.getElementById('cal-day-tabs')?.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'padding') _calScheduleShadowUpdate();
        });
    });
    // Close date picker on outside click
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('cal-date-picker');
        const trigger = document.querySelector('.cal-date-trigger');
        if (picker && !picker.contains(e.target) && trigger && !trigger.contains(e.target)) {
            picker.classList.remove('open');
        }
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
    let html = '<div class="cal-week-nav">';
    html += '<button class="cal-week-nav-btn" onclick="calPrevWeek()" aria-label="Предыдущая неделя">‹</button>';
    html += '<button class="cal-week-nav-btn" onclick="calNextWeek()" aria-label="Следующая неделя">›</button>';
    html += '</div>';

    html += '<button class="cal-date-trigger" onclick="calToggleDatePicker()">';
    html += '<span id="cal-date-label"></span>';
    html += '</button>';

    html += '<div class="cal-toolbar-sep"></div>';
    html += '<button class="cal-week-nav-btn" style="width:auto;padding:0 12px;font-size:0.8125rem;font-weight:600" onclick="calGoToday()">Сегодня</button>';

    html += '<div class="cal-date-picker" id="cal-date-picker">';
    html += '<select id="cal-month-sel" class="cal-filter-select"></select>';
    html += '<select id="cal-year-sel" class="cal-filter-select"></select>';
    html += '<button class="cal-week-nav-btn" style="width:auto;padding:0 10px;font-size:0.8125rem" onclick="calApplyDatePicker()">Применить</button>';
    html += '</div>';

    return html;
}

function _calRenderWeekLabel() {
    const weekEnd = new Date(calWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `<div class="cal-week-label">Неделя с ${_calFmtDate(calWeekStart)} по ${_calFmtDate(weekEnd)}</div>`;
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
        html += `<div class="${cls}" onclick="calSelectDay(${i})"><span class="dn">${CAL_DAY_NAMES_FULL[i]}</span><span class="dd">${d.getDate()} ${CAL_MONTHS_FULL[d.getMonth()]}</span></div>`;
    }
    return html;
}

// ─── Рендер: Mobile ────────────────────────────────────────────────

function _calRenderMobileTabs() {
    let html = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(calWeekStart);
        d.setDate(d.getDate() + i);
        const ds = localDateStr(d);
        const today = localDateStr(new Date());
        const act = ds === localDateStr(calActiveDay);
        const isToday = ds === today;
        const isWeekend = i >= 5;
        const cls = `cal-mob-day${act ? ' active' : ''}${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}`;
        html += `<div class="${cls}" onclick="calSelectDay(${i})">`;
        html += `<span class="mob-wd">${CAL_DAY_NAMES[i]}</span>`;
        html += `<span class="mob-dt">${d.getDate()}</span>`;
        html += `</div>`;
    }
    return html;
}

function _calRenderMobileRoomChips() {
    const locations = store.allLocations || [];
    let html = `<div class="cal-mob-room-bar" id="cal-mob-room-bar">`;
    html += `<div class="cal-mob-chip${_calMobileRoomFilter === null ? ' active' : ''}" onclick="calMobSelectRoom(null)">Все залы</div>`;
    locations.forEach(loc => {
        const active = _calMobileRoomFilter === loc.id;
        html += `<div class="cal-mob-chip${active ? ' active' : ''}" onclick="calMobSelectRoom('${loc.id}')">${esc(loc.name)}</div>`;
    });
    html += `<div class="cal-mob-chip cal-mob-add" onclick="openAddEventModal()">+ Добавить</div>`;
    html += `</div>`;
    return html;
}

function _calRenderMobileGrid() {
    const locations = store.allLocations || [];
    const ds = localDateStr(calActiveDay);
    const dayEvents = _calGetEventsForDate(ds);

    const filteredLocations = _calMobileRoomFilter === null
        ? locations
        : locations.filter(l => l.id === _calMobileRoomFilter);

    let allEvents = [];
    filteredLocations.forEach((loc, li) => {
        const locEvents = dayEvents.filter(e => e.location_id === loc.id);
        locEvents.forEach(e => allEvents.push({ ...e, _locName: loc.name, _locIdx: locations.indexOf(loc) }));
    });
    allEvents.sort((a, b) => calTimeToMin(a.time) - calTimeToMin(b.time));

    let html = `<div class="cal-mob-scroll" id="cal-mob-scroll">`;
    html += `<div class="cal-mob-inner">`;

    html += `<div class="cal-mob-times">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="cal-mob-tlabel" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px">${String(h).padStart(2,'0')}:00</div>`;
    }
    html += `</div>`;

    html += `<div class="cal-mob-col" id="cal-mob-col" style="height:${CAL_TOTAL_H}px;position:relative">`;

    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="hour-line" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px"></div>`;
    }

    const groups = _calFindOverlapGroups(allEvents);
    groups.forEach(group => {
        const cols = group.length;
        group.forEach((e, ci) => {
            const start = calTimeToMin(e.time);
            const dur = e.dur || 60;
            const top = ((start - CAL_H_START * 60) / 60) * CAL_HOUR_H;
            const height = Math.max((dur / 60) * CAL_HOUR_H - 3, 18);
            const w = `calc((100% - ${(cols - 1) * 3}px) / ${cols})`;
            const left = ci === 0 ? '0' : `calc(${ci} * (100% - ${(cols - 1) * 3}px) / ${cols} + ${ci * 3}px)`;

            const now = new Date();
            const today = localDateStr(now);
            let status = 'active';
            if (e.completed) status = 'done';
            else if (ds < today && !e.completed) status = 'missed';

            const orgName = (store.allOrganizers || []).find(o => o.id === e.organizer_id)?.name || '';
            const hIdx = e._locIdx % 4;

            html += `<div class="cal-ev h${hIdx}" style="top:${top}px;height:${height}px;left:${left};width:${w};position:absolute" onclick="openEditEventModal('${e.id}')">`;
            html += `<div style="display:flex;align-items:center;gap:4px"><span class="ev-status ${status}"></span><span class="ev-type">${esc(e.type || 'ВКС')}</span></div>`;
            html += `<div class="ev-time">${esc(e.time || '')}${dur ? ' – ' + _calFmtEnd(e) : ''}</div>`;
            if (e._locName) html += `<div class="ev-org">${esc(e._locName)}</div>`;
            if (orgName) html += `<div class="ev-org">${esc(orgName)}</div>`;
            html += `</div>`;
        });
    });

    html += `</div></div></div>`;
    return html;
}

function calMobSelectRoom(id) {
    _calMobileRoomFilter = id;
    const gridArea = document.getElementById('cal-grid-area');
    if (gridArea) {
        gridArea.innerHTML = _calRenderMobileRoomChips() + _calRenderMobileGrid();
        calUpdateNowLine();
        _calInitMobileSwipe();
        const wrap = document.getElementById('cal-mob-scroll');
        if (wrap) wrap.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
    }
}

// ─── Рендер: Grid (Desktop) ────────────────────────────────────────

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

    html += '<div class="cal-time">';
    html += `<div class="cal-time-body" style="height:${CAL_TOTAL_H}px;position:relative">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="cal-time-label" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px">${String(h).padStart(2, '0')}:00</div>`;
    }
    html += '</div></div>';

    html += `<div class="cal-hour-lines" style="position:absolute;top:0;left:0;right:0;height:${CAL_TOTAL_H}px;pointer-events:none;z-index:1">`;
    for (let h = CAL_H_START; h < CAL_H_END; h++) {
        html += `<div class="hour-line" style="top:${(h - CAL_H_START) * CAL_HOUR_H}px"></div>`;
    }
    html += '</div>';

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
        html += '<div id="cal-week-label"></div>';
        html += '<div class="cal-panel" id="cal-panel">';
        html += '<svg class="cal-shadow-svg" id="cal-shadow-svg" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tabShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/><feOffset in="blur" dx="0" dy="3" result="offsetBlur"/><feColorMatrix in="offsetBlur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path id="cal-shadow-path" filter="url(#tabShadow)"/></svg>';
        html += '<div class="cal-day-tabs" id="cal-day-tabs"></div>';
        html += '<div id="cal-grid-area"></div></div>';
        container.innerHTML = html;

        document.getElementById('cal-toolbar').innerHTML = _calRenderToolbar();
        _calUpdateDateLabel();
        const wlEl = document.getElementById('cal-week-label');
        if (wlEl) wlEl.innerHTML = _calRenderWeekLabel();

        if (_calIsMobile()) {
            document.getElementById('cal-day-tabs').innerHTML = _calRenderMobileTabs();
            document.getElementById('cal-grid-area').innerHTML = _calRenderMobileRoomChips() + _calRenderMobileGrid();
            calUpdateNowLine();
            _calInitMobileSwipe();
            const wrap = document.getElementById('cal-mob-scroll');
            if (wrap) wrap.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
        } else {
            document.getElementById('cal-day-tabs').innerHTML = _calRenderTabs();
            document.getElementById('cal-grid-area').innerHTML = _calRenderGrid();
            calUpdateNowLine();
            _calInitHoverFix();
            _calScheduleShadowUpdate();
            const wrap = document.getElementById('cal-wrap');
            if (wrap) wrap.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
        }

        if (!_calShadowRO) {
            const panelEl = document.getElementById('cal-panel');
            if (panelEl) {
                _calShadowRO = new ResizeObserver(_calScheduleShadowUpdate);
                _calShadowRO.observe(panelEl);
            }
        }
    } else {
        _calNowLines = [];
        _calNowTimeLabel = null;
        const tabsEl = document.getElementById('cal-day-tabs');
        const gridArea = document.getElementById('cal-grid-area');
        if (_calIsMobile()) {
            if (tabsEl) tabsEl.innerHTML = _calRenderMobileTabs();
            if (gridArea) {
                gridArea.innerHTML = _calRenderMobileRoomChips() + _calRenderMobileGrid();
                calUpdateNowLine();
                _calInitMobileSwipe();
                const wrap = document.getElementById('cal-mob-scroll');
                if (wrap) wrap.scrollTop = (8 - CAL_H_START) * CAL_HOUR_H;
            }
        } else {
            if (tabsEl) tabsEl.innerHTML = _calRenderTabs();
            if (gridArea) {
                gridArea.innerHTML = _calRenderGrid();
                calUpdateNowLine();
                _calInitHoverFix();
                _calScheduleShadowUpdate();
            }
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

    if (_calIsMobile()) {
        const mobCol = document.getElementById('cal-mob-col');
        if (mobCol) {
            if (!_calNowLines[0]) {
                const line = document.createElement('div');
                line.className = 'now-line';
                line.style.zIndex = '2';
                mobCol.appendChild(line);
                _calNowLines[0] = line;
            }
            _calNowLines[0].style.top = top + 'px';
        }
    } else {
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
    }

    const timeBody = document.querySelector('.cal-time-body, .cal-mob-times');
    if (timeBody) {
        const linesCount = _calIsMobile() ? 1 : document.querySelectorAll('.cal-col').length;
        if (!_calNowLines[linesCount]) {
            const line = document.createElement('div');
            line.className = 'now-line';
            timeBody.appendChild(line);
            _calNowLines[linesCount] = line;
        }
        _calNowLines[linesCount].style.top = top + 'px';

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

function _calSetActiveForWeek() {
    const today = getMonday(new Date());
    if (calWeekStart.getTime() === today.getTime()) {
        calActiveDay = new Date();
    } else {
        calActiveDay = new Date(calWeekStart);
    }
}

function calPrevWeek() { calWeekStart.setDate(calWeekStart.getDate() - 7); _calSetActiveForWeek(); renderCalendar(true); }
function calNextWeek() { calWeekStart.setDate(calWeekStart.getDate() + 7); _calSetActiveForWeek(); renderCalendar(true); }
function calGoToday() { calWeekStart = getMonday(new Date()); calActiveDay = new Date(); renderCalendar(true); }
function calSelectDay(i) { calActiveDay = new Date(calWeekStart); calActiveDay.setDate(calActiveDay.getDate() + i); renderCalendar(false); }

// ─── Date Picker ──────────────────────────────────────────────────

function calFirstWeekOf(year, month) {
    const d = new Date(year, month, 1);
    return getMonday(d);
}

function calToggleDatePicker() {
    const picker = document.getElementById('cal-date-picker');
    if (!picker) return;
    if (picker.classList.contains('open')) {
        picker.classList.remove('open');
        return;
    }
    const monthSel = document.getElementById('cal-month-sel');
    const yearSel = document.getElementById('cal-year-sel');
    if (monthSel && yearSel) {
        monthSel.innerHTML = CAL_MONTHS_NOM.map((m, i) =>
            `<option value="${i}"${i === calWeekStart.getMonth() ? ' selected' : ''}>${m}</option>`
        ).join('');
        const curYear = calWeekStart.getFullYear();
        const years = [];
        for (let y = curYear - 3; y <= curYear + 3; y++) years.push(y);
        yearSel.innerHTML = years.map(y =>
            `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`
        ).join('');
    }
    picker.classList.add('open');
}

function calApplyDatePicker() {
    const m = parseInt(document.getElementById('cal-month-sel').value, 10);
    const y = parseInt(document.getElementById('cal-year-sel').value, 10);
    calWeekStart = calFirstWeekOf(y, m);
    _calSetActiveForWeek();
    const picker = document.getElementById('cal-date-picker');
    if (picker) picker.classList.remove('open');
    renderCalendar(true);
}

function _calUpdateDateLabel() {
    const el = document.getElementById('cal-date-label');
    if (!el) return;
    el.textContent = `${CAL_MONTHS_NOM[calWeekStart.getMonth()]} ${calWeekStart.getFullYear()}`;
}

// ─── Shadow SVG ─────────────────────────────────────────────────────

function _calUpdateShadow() {
    const activeTab = document.querySelector('.cal-day-tab.active');
    const panel = document.getElementById('cal-panel');
    const path = document.getElementById('cal-shadow-path');
    if (!activeTab || !panel || !path) return;

    const tabRect = activeTab.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const inset = 1;
    const rt = 10, rp = 12;

    const tx = Math.round(tabRect.left - panelRect.left);
    const ty = Math.round(tabRect.top - panelRect.top);
    const tw = Math.round(tabRect.width);
    const th = Math.round(tabRect.height);
    const pw = Math.round(panelRect.width) - inset;
    const ph = Math.round(panelRect.height) - inset;

    const rl = Math.max(0, Math.min(rp, tx - inset));

    const d = [
        `M ${tx + rt} ${ty}`,
        `L ${tx + tw - rt} ${ty}`,
        `A ${rt} ${rt} 0 0 1 ${tx + tw} ${ty + rt}`,
        `L ${tx + tw} ${ty + th}`,
        `L ${pw - rp} ${ty + th}`,
        `A ${rp} ${rp} 0 0 1 ${pw} ${ty + th + rp}`,
        `L ${pw} ${ph - rp}`,
        `A ${rp} ${rp} 0 0 1 ${pw - rp} ${ph}`,
        `L ${rp + inset} ${ph}`,
        `A ${rp} ${rp} 0 0 1 ${inset} ${ph - rp}`,
        `L ${inset} ${ty + th + rl}`,
        `A ${rl} ${rl} 0 0 1 ${inset + rl} ${ty + th}`,
        `L ${tx} ${ty + th}`,
        `L ${tx} ${ty + rt}`,
        `A ${rt} ${rt} 0 0 1 ${tx + rt} ${ty}`,
        'Z'
    ].join(' ');

    path.setAttribute('d', d);
}

let _calShadowRO = null;

function _calUpdateShadowFill() {
    const activeTabEl = document.querySelector('.cal-day-tab.active');
    const shadowPath = document.getElementById('cal-shadow-path');
    if (activeTabEl && shadowPath) {
        shadowPath.setAttribute('fill', getComputedStyle(activeTabEl).backgroundColor);
    }
}

function _calScheduleShadowUpdate() {
    requestAnimationFrame(() => {
        _calUpdateShadowFill();
        _calUpdateShadow();
    });
}

window.addEventListener('resize', _calScheduleShadowUpdate);

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
    el.style.maxWidth = Math.max(rect.width * 2.5, 300) + 'px';

    const isSplit = el.classList.contains('split');
    const isRightEdge = wrapRect && (rect.right > wrapRect.right - 40);

    if (isSplit || isRightEdge) {
        el.style.left = 'auto';
        el.style.right = (window.innerWidth - rect.right) + 'px';
    } else {
        el.style.left = rect.left + 'px';
        el.style.right = 'auto';
    }

    if (wrapRect) {
        requestAnimationFrame(() => {
            const r = el.getBoundingClientRect();
            const margin = 4;
            let newLeft = r.left;
            if (r.right > wrapRect.right - margin) {
                newLeft = wrapRect.right - margin - r.width;
            }
            if (newLeft < wrapRect.left + margin) {
                newLeft = wrapRect.left + margin;
            }
            if (newLeft !== r.left) {
                el.style.left = newLeft + 'px';
                el.style.right = 'auto';
            }
        });
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

// ─── Mobile Swipe ───────────────────────────────────────────────────

let _mobSwipeStartX = 0;
let _mobSwipeStartY = 0;
let _mobSwiping = false;

function _calInitMobileSwipe() {
    const panel = document.getElementById('cal-panel');
    if (!panel || panel._mobSwipeInited) return;
    panel._mobSwipeInited = true;

    panel.addEventListener('touchstart', e => {
        // Не перехватывать свайп на фильтре залов
        if (e.target.closest('.cal-mob-room-bar')) { _mobSwiping = false; return; }
        _mobSwipeStartX = e.touches[0].clientX;
        _mobSwipeStartY = e.touches[0].clientY;
        _mobSwiping = true;
    }, { passive: true });

    panel.addEventListener('touchend', e => {
        if (!_mobSwiping) return;
        _mobSwiping = false;
        const dx = e.changedTouches[0].clientX - _mobSwipeStartX;
        const dy = e.changedTouches[0].clientY - _mobSwipeStartY;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;

        const cur = localDateStr(calActiveDay);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(calWeekStart);
            d.setDate(d.getDate() + i);
            days.push(localDateStr(d));
        }
        const idx = days.indexOf(cur);

        if (dx < 0) {
            if (idx < 6) calSelectDay(idx + 1);
            else calNextWeek();
        } else {
            if (idx > 0) calSelectDay(idx - 1);
            else calPrevWeek();
        }
    }, { passive: true });
}

// ─── Resize: переключение между desktop и mobile ─────────────────────

let _calLastMobile = null;
window.addEventListener('resize', () => {
    const isMob = _calIsMobile();
    if (_calLastMobile !== null && _calLastMobile !== isMob) {
        _calMobileRoomFilter = null;
        renderCalendar(true);
    }
    _calLastMobile = isMob;
    _calScheduleShadowUpdate();
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
