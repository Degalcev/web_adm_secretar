// ─── VKS: Рендеринг карточек ─────────────────────────────────────────

const _vksPagination = {}; // { boardId: { events, cursorDate, cursorTime, hasMore, loading, total } }
const VKS_PAGE_SIZE = 50;

function renderVksBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;

    // Reset pagination
    _vksPagination[boardId] = { events: [], cursorDate: null, cursorTime: null, hasMore: true, loading: false };

    board.innerHTML = '<div class="scroll-sentinel" style="height:1px"></div>';

    // Use document-level scroll listener for reliability
    const handlerKey = '_vksScroll_' + boardId;
    if (document[handlerKey]) document.removeEventListener('scroll', document[handlerKey]);
    document[handlerKey] = () => {
        const scrollEl = document.scrollingElement || document.documentElement;
        if (scrollEl.scrollTop + window.innerHeight >= scrollEl.scrollHeight - 300) {
            _vksLoadMore(boardId, filter);
        }
    };
    document.addEventListener('scroll', document[handlerKey]);

    _vksLoadMore(boardId, filter);
}

async function _vksLoadMore(boardId, filter) {
    const p = _vksPagination[boardId];
    if (!p || p.loading || !p.hasMore) return;
    p.loading = true;

    const board = document.getElementById(boardId);
    const sentinel = board?.querySelector('.scroll-sentinel');
    if (sentinel) sentinel.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:0.8125rem">Загрузка...</div>';

    try {
        const params = new URLSearchParams();
        params.set('limit', VKS_PAGE_SIZE);
        params.set('status', filter);
        params.set('type', 'ВКС');
        if (p.cursorDate) params.set('cursor_date', p.cursorDate);
        if (p.cursorTime) params.set('cursor_time', p.cursorTime);

        const resp = await fetch(`/admin/api/events?${params}`, { credentials: 'same-origin' });
        if (!resp.ok) return;
        const data = await resp.json();
        const newEvents = data.events || [];

        p.events.push(...newEvents);
        p.cursorDate = data.next_cursor_date;
        p.cursorTime = data.next_cursor_time;
        p.hasMore = data.has_more;
        if (data.total !== undefined) p.total = data.total;

        _vksRenderBoard(boardId, filter);
        updateVksStats();
    } catch (e) {
        console.error('_vksLoadMore error:', e);
    }
    p.loading = false;
}

function _vksRenderBoard(boardId, filter) {
    const board = document.getElementById(boardId);
    if (!board) return;
    const p = _vksPagination[boardId];
    if (!p) return;

    const prefix = boardId === 'vks-board-active' ? 'f-vks-active' : 'f-vks-completed';
    const dateFilter = getDateFilter(prefix);
    const orgVal = document.getElementById(`${prefix}-org`)?.value || '';
    const locVal = document.getElementById(`${prefix}-loc`)?.value || '';
    const descVal = (document.getElementById(`${prefix}-desc`)?.value || '').toLowerCase();

    let events = [...p.events];

    if (dateFilter.day || dateFilter.month || dateFilter.year) {
        events = events.filter(e => matchDateFilter(e.date, dateFilter));
    }
    if (orgVal) events = events.filter(e => e.organizer_id === orgVal);
    if (locVal) events = events.filter(e => e.location_id === locVal);
    if (descVal) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(descVal) ||
            (e.url || '').toLowerCase().includes(descVal)
        );
    }

    if (_quickFilter && filter === 'active') {
        const now = new Date();
        const today = localDateStr(now);
        if (_quickFilter === 'today') {
            events = events.filter(e => e.date === today);
        } else if (_quickFilter === 'soon') {
            events = events.filter(e => e.date && e.date > today);
        } else if (_quickFilter === 'missed') {
            events = events.filter(e => !e.date || e.date < today);
        } else if (_quickFilter === 'active') {
            events = events.filter(e => e.date && e.date >= today);
        }
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    const tomorrow = `${tmr.getFullYear()}-${String(tmr.getMonth()+1).padStart(2,'0')}-${String(tmr.getDate()).padStart(2,'0')}`;
    const da = new Date(now.getFullYear(), now.getMonth(), now.getDate()+2);
    const dayAfter = `${da.getFullYear()}-${String(da.getMonth()+1).padStart(2,'0')}-${String(da.getDate()).padStart(2,'0')}`;

    const missed = []; const todayEvents = []; const tomorrowEvents = [];
    const dayAfterEvents = []; const soon = [];

    events.forEach(e => {
        if (!e.date || e.date < today) missed.push(e);
        else if (e.date === today) todayEvents.push(e);
        else if (e.date === tomorrow) tomorrowEvents.push(e);
        else if (e.date === dayAfter) dayAfterEvents.push(e);
        else soon.push(e);
    });

    const sortByTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    const sortByDateThenTime = (a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b);
    missed.sort(sortByDateThenTime);
    todayEvents.sort(sortByTime);
    tomorrowEvents.sort(sortByTime);
    dayAfterEvents.sort(sortByTime);
    soon.sort(sortByDateThenTime);

    let html = '';
    if (missed.length) html += renderVksBlock('Пропущенные', missed, 'missed');
    if (todayEvents.length) html += renderVksBlock('Сегодня', todayEvents, 'today');
    if (tomorrowEvents.length) html += renderVksBlock('Завтра', tomorrowEvents, 'tomorrow');
    if (dayAfterEvents.length) html += renderVksBlock('Послезавтра', dayAfterEvents, 'day-after');
    if (soon.length) html += renderVksBlock('Скоро', soon, 'soon');

    // Keep sentinel — don't destroy it
    let sentinel = board.querySelector('.scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.style.height = '1px';
    }
    // Use replaceChildren to preserve sentinel
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (board.firstChild) board.removeChild(board.firstChild);
    while (temp.firstChild) board.appendChild(temp.firstChild);
    board.appendChild(sentinel);
}

function renderVksBlock(title, events, type) {
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">`;
    if (type === 'missed') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'today') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    } else if (type === 'tomorrow') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    } else if (type === 'day-after') {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    } else {
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    }
    html += `${title} <span class="vks-date-count">${events.length}</span>`;
    html += `</div>`;

    events.forEach(e => {
        html += renderVksCard(e, type);
    });

    html += `</div>`;
    return html;
}

function renderVksCard(e, blockType) {
    const time = e.time || '--:--';
    const date = e.date || '';
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const loc = e.location_id ? getLocationName(e.location_id) : '';
    const docs = e.documents || [];

    // Stripe class
    let stripeClass = 'active';
    if (blockType === 'missed' && !e.completed) stripeClass = 'missed';
    else if (e.completed) stripeClass = 'completed';

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" onclick="openEditEventModal('${e.id}')" style="cursor:pointer">`;

    // Stripe
    html += `<div class="vks-stripe ${stripeClass}"></div>`;

    html += `<div class="vks-card-content">`;

    // Time block
    html += `<div class="vks-time-block">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date);
        const day = d.getDate();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        html += `<div class="vks-card-date">${day} ${monthNames[d.getMonth()]}</div>`;
    }
    html += `</div>`;

    // Body
    html += `<div class="vks-card-body">`;
    if (e.description) html += `<div class="vks-card-desc">${esc(e.description)}</div>`;

    // Meta: tags + link
    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag org"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;
    if (e.url) html += `<a class="vks-link-icon" href="${esc(e.url)}" target="_blank" onclick="event.stopPropagation()" title="Открыть ссылку"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    // Lock indicator
    if (e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id)) {
        html += `<div class="vks-card-lock">
            ${LOCK_SVG}
            <span>${esc(e.locked_by)}</span>
        </div>`;
    }

    html += `</div>`;

    // Documents: first 3 collapsed + "ещё N" + all expanded
    if (docs.length) {
        const SHOW_FIRST = 3;
        const remaining = docs.length - SHOW_FIRST;

        // Collapsed: first 3 + "ещё N"
        html += `<div class="vks-card-docs vks-docs-collapsed">`;
        docs.slice(0, SHOW_FIRST).forEach(d => {
            html += renderDocChip(d);
        });
        if (remaining > 0) {
            html += `<span class="vks-doc-more" onclick="event.stopPropagation();toggleVksDocs(this)">+${remaining} ещё</span>`;
        }
        html += `</div>`;

        // Expanded: all docs
        if (remaining > 0) {
            html += `<div class="vks-card-docs vks-docs-expanded">`;
            docs.forEach(d => {
                html += renderDocChip(d);
            });
            html += `</div>`;
        }
    }

    html += `</div>`; // vks-card-body

    // Actions
    html += `<div class="vks-card-actions">`;
    html += `<button class="${e.completed ? 'done' : ''}" onclick="event.stopPropagation();confirmCompleteEvent('${e.id}', ${!e.completed})" title="${e.completed ? 'Снять завершение' : 'Завершить'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
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

function getOrganizerName(id) {
    const o = (store.allOrganizers || []).find(x => x.id === id);
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (store.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}

function getDocCardMeta(ext) {
    const map = {
        pdf: { cls: 'pdf', label: 'PDF' },
        doc: { cls: 'doc', label: 'DOC' },
        docx: { cls: 'doc', label: 'DOC' },
        xls: { cls: 'xls', label: 'XLS' },
        xlsx: { cls: 'xls', label: 'XLS' },
        ppt: { cls: 'ppt', label: 'PPT' },
        pptx: { cls: 'ppt', label: 'PPT' },
        txt: { cls: 'txt', label: 'TXT' },
        zip: { cls: 'zip', label: 'ZIP' },
        rar: { cls: 'zip', label: 'RAR' },
        jpg: { cls: 'img', label: 'JPG' },
        jpeg: { cls: 'img', label: 'JPG' },
        png: { cls: 'img', label: 'PNG' },
    };
    return map[ext] || { cls: 'default', label: ext.toUpperCase() || 'FILE' };
}

function getDocIcon(ext) {
    const icons = {
        pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        docx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        xls: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        xlsx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>',
        ppt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 14 12 10 14 14 16 10"/></svg>',
        pptx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 14 12 10 14 14 16 10"/></svg>',
        txt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        zip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 3v6h6"/><rect x="10" y="14" width="4" height="2" rx="0.5"/></svg>',
        rar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 3v6h6"/><rect x="10" y="14" width="4" height="2" rx="0.5"/></svg>',
        jpg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        png: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    };
    return icons[ext] || icons.txt;
}
