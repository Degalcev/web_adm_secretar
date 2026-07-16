// ─── VKS: Рендеринг карточек ─────────────────────────────────────────

const _vksPagination = {};
const VKS_PAGE_SIZE = 50;

function renderVksBoard(boardId, filter, force) {
    const board = document.getElementById(boardId);
    if (!board) return;

    const cacheKey = filter === 'active' ? 'vksActive' : 'vksCompleted';
    const cached = cacheGet(cacheKey);
    const events = cached?.data?.events || [];

    _vksPagination[boardId] = {
        events: events,
        cursorDate: cached?.data?.cursorDate || null,
        cursorTime: cached?.data?.cursorTime || null,
        cursorId: cached?.data?.cursorId || null,
        hasMore: filter === 'active' ? false : (cached?.data?.hasMore ?? true),
        loading: false,
    };

    if (events.length) {
        _sseRerenderFromCache(boardId, filter, force);
        return;
    }

    board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';

    if (filter === 'active') {
        _vksLoadAll(boardId, filter);
    } else {
        const scrollEl = _findScrollParent(board);
        if (scrollEl) {
            const handlerKey = '_vksScroll_' + boardId;
            if (scrollEl[handlerKey]) scrollEl.removeEventListener('scroll', scrollEl[handlerKey]);
            scrollEl[handlerKey] = () => {
                if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 300) {
                    _vksLoadMore(boardId, filter);
                }
            };
            scrollEl.addEventListener('scroll', scrollEl[handlerKey]);
        }
        _vksLoadMore(boardId, filter);
    }
}

async function _vksLoadAll(boardId, filter) {
    const p = _vksPagination[boardId];
    if (p.loading) return;
    p.loading = true;

    const board = document.getElementById(boardId);
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка…</div>';

    try {
        const prefix = 'f-vks-active';
        const params = new URLSearchParams({ status: filter, type: 'ВКС', limit: 10000 });

        const orgVal = document.getElementById(`${prefix}-org`)?.value;
        const locVal = document.getElementById(`${prefix}-loc`)?.value;
        const searchVal = document.getElementById(`${prefix}-desc`)?.value?.trim();
        if (orgVal) params.set('organizer_id', orgVal);
        if (locVal) params.set('location_id', locVal);
        if (searchVal) params.set('search', searchVal);

        const dateFilter = getDateFilter(prefix);
        if (dateFilter.year || dateFilter.month || dateFilter.day) {
            const y = dateFilter.year || new Date().getFullYear();
            const m = dateFilter.month ? String(dateFilter.month).padStart(2, '0') : '01';
            const mEnd = dateFilter.month ? String(dateFilter.month).padStart(2, '0') : '12';
            if (dateFilter.day) {
                const d = String(dateFilter.day).padStart(2, '0');
                params.set('from', `${y}-${m}-${d}`);
                params.set('to', `${y}-${m}-${d}`);
            } else {
                params.set('from', `${y}-${m}-01`);
                const lastDay = new Date(y, dateFilter.month ? Number(dateFilter.month) : 12, 0).getDate();
                params.set('to', `${y}-${mEnd}-${lastDay}`);
            }
        }

        if (_quickFilter) {
            const today = localDateStr(new Date());
            const tomorrow = localDateStr(new Date(Date.now() + 86400000));
            if (_quickFilter === 'today') {
                params.set('from', today); params.set('to', today);
            } else if (_quickFilter === 'soon') {
                params.set('from', tomorrow);
            } else if (_quickFilter === 'missed') {
                params.set('to', localDateStr(new Date(Date.now() - 86400000)));
            } else if (_quickFilter === 'active') {
                params.set('from', today);
            }
        }

        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events = data.events || [];
        p.hasMore = false;

        cacheSet('vksActive', {
            events: p.events,
            stats: cacheGet('vksActive')?.data?.stats || {},
        });

        _vksRenderBoard(boardId, filter);
        updateVksStats();
    } catch (e) {
        console.error('_vksLoadAll error:', e);
    }
    p.loading = false;
    if (sentinel) sentinel.innerHTML = '';
}

async function _vksLoadMore(boardId, filter) {
    const p = _vksPagination[boardId];
    if (!p || p.loading || !p.hasMore) return;
    p.loading = true;

    const board = document.getElementById(boardId);
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML =
        '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка…</div>';

    try {
        const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
        const params = new URLSearchParams({ status: filter, type: 'ВКС', limit: VKS_PAGE_SIZE });

        // ── Серверные фильтры ──────────────────────────────────────
        const orgVal = document.getElementById(`${prefix}-org`)?.value;
        const locVal = document.getElementById(`${prefix}-loc`)?.value;
        const searchVal = document.getElementById(`${prefix}-desc`)?.value?.trim();
        if (orgVal) params.set('organizer_id', orgVal);
        if (locVal) params.set('location_id', locVal);
        if (searchVal) params.set('search', searchVal);

        // Дата-фильтр: если выбран год/месяц — передаём диапазон на сервер
        const dateFilter = getDateFilter(prefix);
        if (dateFilter.year || dateFilter.month || dateFilter.day) {
            const y = dateFilter.year || new Date().getFullYear();
            const m = dateFilter.month ? String(dateFilter.month).padStart(2, '0') : '01';
            const mEnd = dateFilter.month ? String(dateFilter.month).padStart(2, '0') : '12';
            if (dateFilter.day) {
                const d = String(dateFilter.day).padStart(2, '0');
                params.set('from', `${y}-${m}-${d}`);
                params.set('to', `${y}-${m}-${d}`);
            } else {
                params.set('from', `${y}-${m}-01`);
                // последний день месяца/года
                const lastDay = new Date(y, dateFilter.month ? Number(dateFilter.month) : 12, 0).getDate();
                params.set('to', `${y}-${mEnd}-${lastDay}`);
            }
        }

        // Quick-фильтр (today/soon/missed/active) — дополнительный диапазон дат
        if (filter === 'active' && _quickFilter) {
            const today = localDateStr(new Date());
            const tomorrow = localDateStr(new Date(Date.now() + 86400000));
            if (_quickFilter === 'today') {
                params.set('from', today); params.set('to', today);
            } else if (_quickFilter === 'soon') {
                params.set('from', tomorrow);
            } else if (_quickFilter === 'missed') {
                params.set('to', localDateStr(new Date(Date.now() - 86400000)));
            } else if (_quickFilter === 'active') {
                params.set('from', today);
            }
        }

        // ── Cursor ─────────────────────────────────────────────────
        if (p.cursorDate) params.set('cursor_date', p.cursorDate);
        if (p.cursorTime) params.set('cursor_time', p.cursorTime);
        if (p.cursorId)   params.set('cursor_id', p.cursorId);

        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        p.events.push(...(data.events || []));
        p.cursorDate = data.next_cursor_date || null;
        p.cursorTime = data.next_cursor_time || null;
        p.cursorId   = data.next_cursor_id   || null;
        p.hasMore    = !!data.has_more;

        _vksRenderBoard(boardId, filter);
        const cacheKey = 'vksCompleted';
        const existing = cacheGet(cacheKey);
        cacheSet(cacheKey, {
            events: p.events,
            stats: existing?.data?.stats || {},
            cursorDate: p.cursorDate,
            cursorTime: p.cursorTime,
            cursorId: p.cursorId,
            hasMore: p.hasMore,
        });
        updateVksStats();
    } catch (e) {
        console.error('_vksLoadMore error:', e);
    }
    p.loading = false;
    const s = document.getElementById(boardId)?.querySelector('.scroll-sentinel');
    if (s) s.innerHTML = '';
}

function _vksRenderBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;
    const p = _vksPagination[boardId];
    if (!p) return;

    const events = p.events;

    // Группировка по дате (сервер уже отфильтровал и отсортировал)
    const now = new Date();
    const today = localDateStr(now);
    const tomorrow = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfter = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    const missed = [], todayEvents = [], tomorrowEvents = [], dayAfterEvents = [], soon = [];
    events.forEach(e => {
        if (!e.date || e.date < today) missed.push(e);
        else if (e.date === today) todayEvents.push(e);
        else if (e.date === tomorrow) tomorrowEvents.push(e);
        else if (e.date === dayAfter) dayAfterEvents.push(e);
        else soon.push(e);
    });

    let html = '';
    if (!events.length && !p.hasMore) {
        html = '<div class="empty-state">Нет мероприятий</div>';
    } else {
        if (missed.length)       html += renderVksBlock('Пропущенные', missed, 'missed');
        if (todayEvents.length)  html += renderVksBlock('Сегодня', todayEvents, 'today');
        if (tomorrowEvents.length) html += renderVksBlock('Завтра', tomorrowEvents, 'tomorrow');
        if (dayAfterEvents.length) html += renderVksBlock('Послезавтра', dayAfterEvents, 'day-after');
        if (soon.length)         html += renderVksBlock('Скоро', soon, 'soon');
    }

    // Сохраняем sentinel
    let sentinel = board.querySelector('.scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.style.height = '1px';
    }
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (board.firstChild) board.removeChild(board.firstChild);
    while (temp.firstChild) board.appendChild(temp.firstChild);
    board.appendChild(sentinel);
}

function renderVksBlock(title, events, type) {
    const icons = {
        missed:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        today:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        tomorrow:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        'day-after': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        soon:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    };
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">${icons[type] || icons.soon}${title} <span class="vks-date-count">${events.length}</span></div>`;
    events.forEach(e => { html += renderVksCard(e, type); });
    html += `</div>`;
    return html;
}

function renderVksCard(e, blockType) {
    const time = e.time || '--:--';
    const date = e.date || '';
    const org  = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const loc  = e.location_id  ? getLocationName(e.location_id)  : '';
    const docs = e.documents || [];

    let stripeClass = 'active';
    if (blockType === 'missed' && !e.completed) stripeClass = 'missed';
    else if (e.completed) stripeClass = 'completed';

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" data-event-id="${e.id}" onclick="openEditEventModal('${e.id}')" style="cursor:pointer">`;
    html += `<div class="vks-stripe ${stripeClass}"></div>`;
    html += `<div class="vks-card-content">`;

    // Блок времени
    html += `<div class="vks-time-block">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date + 'T00:00:00');
        const monthNames = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
        html += `<div class="vks-card-date">${d.getDate()} ${monthNames[d.getMonth()]}</div>`;
    }
    html += `</div>`;

    // Тело карточки
    html += `<div class="vks-card-body">`;
    if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;

    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag org"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;
    if (e.url) html += `<a class="vks-link-icon" href="${esc(e.url)}" target="_blank" onclick="event.stopPropagation()" title="Открыть ссылку"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    if (e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id)) {
        html += `<div class="vks-card-lock">${LOCK_SVG}<span>${esc(e.locked_by)}</span></div>`;
    }
    html += `</div>`;

    // Документы
    if (docs.length) {
        const SHOW_FIRST = 3;
        const remaining = docs.length - SHOW_FIRST;
        html += `<div class="vks-card-docs vks-docs-collapsed">`;
        docs.slice(0, SHOW_FIRST).forEach(d => { html += renderDocChip(d); });
        if (remaining > 0)
            html += `<span class="vks-doc-more" onclick="event.stopPropagation();toggleVksDocs(this)">+${remaining} ещё</span>`;
        html += `</div>`;
        if (remaining > 0) {
            html += `<div class="vks-card-docs vks-docs-expanded">`;
            docs.forEach(d => { html += renderDocChip(d); });
            html += `</div>`;
        }
    }

    html += `</div>`; // vks-card-body

    // Кнопки действий
    html += `<div class="vks-card-actions">`;
    html += `<button class="${e.completed ? 'done' : ''}" onclick="event.stopPropagation();confirmCompleteEvent('${e.id}',${!e.completed})" title="${e.completed ? 'Снять завершение' : 'Завершить'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
    html += `<button class="del" onclick="event.stopPropagation();openConfirmEvent('${e.id}')" title="Удалить"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
    html += `</div>`;

    html += `</div>`; // vks-card-content
    html += `</div>`; // vks-card
    return html;
}

function renderDocChip(d) {
    const ext = (d.name || '').split('.').pop().toLowerCase();
    const icon = getDocIcon(ext);
    return `<a class="vks-doc-chip" href="#" onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}');return false" title="Скачать ${esc(d.name)}">${icon}<span class="vks-doc-chip-name">${esc(d.name)}</span>${d.size ? '<span class="vks-doc-chip-size">' + formatSize(d.size) + '</span>' : ''}</a>`;
}

function toggleVksDocs(btn) {
    const card = btn.closest('.vks-card');
    if (card) card.classList.toggle('docs-expanded');
}

function getDocIcon(ext) {
    const icons = {
        pdf:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        doc:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        docx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        xls:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        xlsx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        ppt:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        pptx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        txt:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        zip:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/></svg>',
        rar:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/></svg>',
        jpg:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        jpeg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        png:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    };
    return icons[ext] || icons.txt;
}
