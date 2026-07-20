// ─── Единое ядро списков мероприятий/ВКС ──────────────────────────────
// Мероприятия и ВКС — это одни и те же данные (таблица events) с разным
// фильтром по типу. Вся развёртка серий, фильтрация и группировка живёт
// ЗДЕСЬ, чтобы не дублировать логику между events.js, vks-board.js и sse.js.
//
// Окно развёртки серий совпадает с серверным окном счётчиков
// (count_event_occurrences: past_days=365, horizon_days=60).

const BOARD_PAST_DAYS = 365;
const BOARD_FUTURE_DAYS = 60;

function getBoardEventDate(e) {
    return e._nextDate || e.date;
}

// Считываем фильтры доски из DOM по префиксу (f-events / f-vks-active / f-vks-completed)
function readBoardFilters(prefix, opts) {
    opts = opts || {};
    const val = (suffix) => (document.getElementById(`${prefix}-${suffix}`)?.value || '');
    const status = opts.statusFilter || 'active';
    return {
        statusFilter: status,               // 'active' | 'completed'
        completed: status === 'completed',
        quickFilter: opts.quickFilter || '', // today | soon | missed | active | ''
        org: val('org'),
        loc: val('loc'),
        desc: val('desc').trim(),
        day: val('day'),
        month: val('month'),
        year: val('year'),
    };
}

// Окно развёртки серий по активным фильтрам
function eventBoardWindow(filters) {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    let winStart, winEnd;
    if (filters.year || filters.month) {
        const y = filters.year ? parseInt(filters.year, 10) : today0.getFullYear();
        if (filters.month) {
            const m = parseInt(filters.month, 10) - 1;
            winStart = new Date(y, m, 1);
            winEnd = new Date(y, m + 1, 0);
        } else {
            winStart = new Date(y, 0, 1);
            winEnd = new Date(y, 11, 31);
        }
    } else if (filters.completed || filters.quickFilter === 'missed' || filters.day) {
        winStart = new Date(today0); winStart.setFullYear(winStart.getFullYear() - 1);
        winEnd = new Date(today0); winEnd.setDate(winEnd.getDate() + 366);
    } else {
        winStart = new Date(today0); winStart.setDate(winStart.getDate() - BOARD_PAST_DAYS);
        winEnd = new Date(today0); winEnd.setDate(winEnd.getDate() + BOARD_FUTURE_DAYS);
    }
    return { winStartStr: localDateStr(winStart), winEndStr: localDateStr(winEnd) };
}

// Развёртка серий в occurrences внутри окна; разовые события проходят как есть
function expandEventsInWindow(rawEvents, winStartStr, winEndStr) {
    const out = [];
    rawEvents.forEach(e => {
        if (e.series_id && e.series && typeof expandSeriesInRange === 'function') {
            const dates = expandSeriesInRange(e, winStartStr, winEndStr);
            (dates.length ? dates : [e.date]).forEach(d => out.push({ ...e, _nextDate: d }));
        } else {
            out.push(e);
        }
    });
    return out;
}

// Фильтрация: статус (завершено/активно), быстрый фильтр, дата, орг/локация/поиск
function filterBoardEvents(events, filters) {
    let res = events;
    const today = localDateStr(new Date());

    if (filters.statusFilter === 'completed') {
        res = res.filter(e => e.completed);
    } else if (filters.statusFilter === 'active') {
        res = res.filter(e => !e.completed);
    }

    if (filters.quickFilter) {
        if (filters.quickFilter === 'today') {
            res = res.filter(e => getBoardEventDate(e) === today);
        } else if (filters.quickFilter === 'soon') {
            res = res.filter(e => getBoardEventDate(e) && getBoardEventDate(e) > today);
        } else if (filters.quickFilter === 'missed') {
            res = res.filter(e => !getBoardEventDate(e) || getBoardEventDate(e) < today);
        } else if (filters.quickFilter === 'active') {
            res = res.filter(e => getBoardEventDate(e) && getBoardEventDate(e) >= today);
        }
    }

    if (filters.day || filters.month || filters.year) {
        res = res.filter(e => {
            const ed = getBoardEventDate(e);
            if (!ed) return false;
            const d = new Date(ed + 'T00:00:00');
            if (filters.day && d.getDate() !== parseInt(filters.day)) return false;
            if (filters.month && (d.getMonth() + 1) !== parseInt(filters.month)) return false;
            if (filters.year && d.getFullYear() !== parseInt(filters.year)) return false;
            return true;
        });
    }

    if (filters.org) res = res.filter(e => e.organizer_id === filters.org);
    if (filters.loc) res = res.filter(e => e.location_id === filters.loc);
    if (filters.desc) {
        const q = filters.desc.toLowerCase();
        res = res.filter(e =>
            (e.description || '').toLowerCase().includes(q) ||
            (e.url || '').toLowerCase().includes(q)
        );
    }
    return res;
}

// Группировка активных событий по датам
function bucketBoardEvents(events) {
    const now = new Date();
    const today = localDateStr(now);
    const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfter = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    const buckets = { missed: [], today: [], tomorrow: [], dayAfter: [], soon: [] };
    events.forEach(e => {
        const ed = getBoardEventDate(e);
        if (!ed || ed < today) buckets.missed.push(e);
        else if (ed === today) buckets.today.push(e);
        else if (ed === tomorrow) buckets.tomorrow.push(e);
        else if (ed === dayAfter) buckets.dayAfter.push(e);
        else buckets.soon.push(e);
    });

    const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    const byDateTime = (a, b) => ((getBoardEventDate(a) || '').localeCompare(getBoardEventDate(b) || '')) || byTime(a, b);
    buckets.missed.sort(byDateTime);
    buckets.today.sort(byTime);
    buckets.tomorrow.sort(byTime);
    buckets.dayAfter.sort(byTime);
    buckets.soon.sort(byDateTime);
    return buckets;
}

// Полный конвейер: сырые строки + фильтры → {list, buckets}
function processBoardEvents(rawEvents, filters) {
    const { winStartStr, winEndStr } = eventBoardWindow(filters);
    const expanded = expandEventsInWindow([...(rawEvents || [])], winStartStr, winEndStr);
    const list = filterBoardEvents(expanded, filters);
    return { list, buckets: bucketBoardEvents(list) };
}

// Рендер сгруппированной активной доски через переданный рендерер блока
function renderActiveBoardBlocks(buckets, renderBlockFn) {
    let html = '';
    if (buckets.missed.length) html += renderBlockFn('Пропущенные', buckets.missed, 'missed');
    if (buckets.today.length) html += renderBlockFn('Сегодня', buckets.today, 'today');
    if (buckets.tomorrow.length) html += renderBlockFn('Завтра', buckets.tomorrow, 'tomorrow');
    if (buckets.dayAfter.length) html += renderBlockFn('Послезавтра', buckets.dayAfter, 'day-after');
    if (buckets.soon.length) html += renderBlockFn('Скоро', buckets.soon, 'soon');
    return html;
}
