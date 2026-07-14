// ─── Страница мероприятий (VKS-style) ─────────────────────────────

let _eventsCompleted = false;
let _eventsTypeFilter = null;

const EVENT_TYPES = ['Совещание', 'Встреча', 'Заседание', 'Приём'];

function initEventsPage(completed = false) {
    _eventsCompleted = completed;
    _eventsTypeFilter = null;

    const title = document.getElementById('events-page-title');
    if (title) title.textContent = completed ? 'Завершённые мероприятия' : 'Текущие мероприятия';

    _eventsPopulateFilters();
    eventsRenderBoard();
}

function _eventsPopulateFilters() {
    const orgSel = document.getElementById('f-events-org');
    const locSel = document.getElementById('f-events-loc');
    if (orgSel && window.store?.allOrganizers) {
        orgSel.innerHTML = '<option value="">Все</option>' +
            window.store.allOrganizers.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    }
    if (locSel && window.store?.allLocations) {
        locSel.innerHTML = '<option value="">Все</option>' +
            window.store.allLocations.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    }
}

function eventsFilterType(type) {
    _eventsTypeFilter = type;
    document.querySelectorAll('#events-tabs .events-tab').forEach(tab => {
        tab.classList.toggle('active', (tab.textContent === (type || 'Все')));
    });
    eventsRenderBoard();
}

function eventsApplyFilters() {
    eventsRenderBoard();
}

function eventsResetFilters() {
    document.getElementById('f-events-org').value = '';
    document.getElementById('f-events-loc').value = '';
    document.getElementById('f-events-desc').value = '';
    eventsRenderBoard();
}

function eventsRenderBoard() {
    const board = document.getElementById('events-board');
    if (!board) return;

    const orgVal = document.getElementById('f-events-org')?.value || '';
    const locVal = document.getElementById('f-events-loc')?.value || '';
    const descVal = (document.getElementById('f-events-desc')?.value || '').toLowerCase();

    let events = [...(window.store?.allEvents || [])];

    // Filter by status
    if (_eventsCompleted) {
        events = events.filter(e => e.completed);
    } else {
        events = events.filter(e => !e.completed);
    }

    // Filter by type
    if (_eventsTypeFilter) {
        events = events.filter(e => e.type === _eventsTypeFilter);
    }

    // Apply filters
    if (orgVal) events = events.filter(e => e.organizer_id === orgVal);
    if (locVal) events = events.filter(e => e.location_id === locVal);
    if (descVal) {
        events = events.filter(e =>
            (e.description || '').toLowerCase().includes(descVal) ||
            (e.url || '').toLowerCase().includes(descVal)
        );
    }

    if (!events.length) {
        board.innerHTML = '<div class="empty-state">Нет мероприятий</div>';
        return;
    }

    // Group by date blocks
    const now = new Date();
    const today = localDateStr(now);
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = localDateStr(tmr);
    const da = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const dayAfter = localDateStr(da);

    const missed = [];
    const todayEvents = [];
    const tomorrowEvents = [];
    const dayAfterEvents = [];
    const soon = [];

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

    if (missed.length) html += _eventsRenderBlock('Пропущенные', missed, 'missed');
    if (todayEvents.length) html += _eventsRenderBlock('Сегодня', todayEvents, 'today');
    if (tomorrowEvents.length) html += _eventsRenderBlock('Завтра', tomorrowEvents, 'tomorrow');
    if (dayAfterEvents.length) html += _eventsRenderBlock('Послезавтра', dayAfterEvents, 'day-after');
    if (soon.length) html += _eventsRenderBlock('Скоро', soon, 'soon');

    board.innerHTML = html;
}

function _eventsRenderBlock(title, events, type) {
    let html = `<div class="vks-date-group vks-block-${type}">`;
    html += `<div class="vks-date-header">`;

    const icons = {
        missed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        today: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        tomorrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        'day-after': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        soon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    };

    html += icons[type] || icons.soon;
    html += `${title} <span class="vks-date-count">${events.length}</span>`;
    html += `</div>`;

    events.forEach(e => {
        html += _eventsRenderCard(e, type);
    });

    html += `</div>`;
    return html;
}

function _eventsRenderCard(e, blockType) {
    const time = e.time || '--:--';
    const date = e.date || '';
    const org = e.organizer_id ? getOrganizerName(e.organizer_id) : '';
    const loc = e.location_id ? getLocationName(e.location_id) : '';
    const typeClass = _eventsGetTypeClass(e.type);

    let stripeClass = 'active';
    if (blockType === 'missed' && !e.completed) stripeClass = 'missed';
    else if (e.completed) stripeClass = 'completed';

    let html = `<div class="vks-card ${e.completed ? 'completed' : ''} ${blockType === 'missed' ? 'vks-missed' : ''}" onclick="evtOpenEditModal('${e.id}')" style="cursor:pointer">`;

    html += `<div class="vks-stripe ${stripeClass}"></div>`;

    html += `<div class="vks-card-content">`;

    // Time block
    html += `<div class="vks-time-block">`;
    html += `<div class="vks-card-time">${time}</div>`;
    if (date) {
        const d = new Date(date + 'T00:00:00');
        const day = d.getDate();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        html += `<div class="vks-card-date">${day} ${monthNames[d.getMonth()]}</div>`;
    }
    html += `</div>`;

    // Body
    html += `<div class="vks-card-body">`;

    // Type badge + description
    html += `<div class="vks-card-desc">`;
    html += `<span class="events-type-badge ${typeClass}">${esc(e.type || 'ВКС')}</span> `;
    if (e.description) html += esc(e.description);
    html += `</div>`;

    // Meta: tags
    html += `<div class="vks-card-meta">`;
    if (org) html += `<span class="vks-tag org"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${esc(org)}</span>`;
    if (loc) html += `<span class="vks-tag loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>`;

    // Duration
    if (e.duration && e.duration !== 60) {
        html += `<span class="vks-tag">${e.duration} мин</span>`;
    }

    // Lock indicator
    if (e.locked_by && e.locked_by_id !== (window.currentUser && window.currentUser.id)) {
        html += `<div class="vks-card-lock">
            ${typeof LOCK_SVG !== 'undefined' ? LOCK_SVG : ''}
            <span>${esc(e.locked_by)}</span>
        </div>`;
    }

    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    return html;
}

function _eventsGetTypeClass(type) {
    const map = {
        'ВКС': 'type-vks',
        'Совещание': 'type-meeting',
        'Встреча': 'type-session',
        'Заседание': 'type-board',
        'Приём': 'type-reception',
    };
    return map[type] || 'type-vks';
}

// ─── Modal functions ──────────────────────────────────────────────

function evtOpenAddModal() {
    if (window._modalsLoaded) window._modalsLoaded.then(() => _eventsOpenModal(null));
    else _eventsOpenModal(null);
}

function evtOpenEditModal(eventId) {
    if (window._modalsLoaded) window._modalsLoaded.then(() => _eventsOpenModal(eventId));
    else _eventsOpenModal(eventId);
}

async function _eventsOpenModal(eventId) {
    const overlay = document.getElementById('evt-modal-overlay');
    const title = document.getElementById('evt-modal-title');
    if (!overlay) return;

    // Ждём загрузки данных
    await preloadAllData();

    if (eventId) {
        title.textContent = 'Редактирование мероприятия';
        _eventsLoadEventData(eventId);
    } else {
        title.textContent = 'Новое мероприятие';
        _eventsResetForm();
    }

    _eventsPopulateDropdowns();
    overlay.style.display = 'flex';
}

function evtCloseModal() {
    const overlay = document.getElementById('evt-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function _eventsResetForm() {
    document.getElementById('evt-id').value = '';
    document.getElementById('evt-type').value = 'Совещание';
    document.getElementById('evt-date').value = '';
    document.getElementById('evt-time').value = '';
    document.getElementById('evt-duration').value = '60';
    document.getElementById('evt-location').value = '';
    document.getElementById('evt-organizer-type').value = 'org';
    document.getElementById('evt-organizer').value = '';
    document.getElementById('evt-description').value = '';
    document.getElementById('evt-notification').value = 'true';
    const notifBtn = document.getElementById('evt-notification-btn');
    if (notifBtn) notifBtn.classList.add('done');
    document.getElementById('evt-participants-list').innerHTML = '';
}

async function _eventsLoadEventData(eventId) {
    try {
        const event = (window.store?.allEvents || []).find(e => e.id === eventId);
        if (!event) return;

        document.getElementById('evt-id').value = event.id;
        document.getElementById('evt-type').value = event.type || 'ВКС';
        document.getElementById('evt-date').value = event.date || '';
        document.getElementById('evt-time').value = event.time || '';
        document.getElementById('evt-duration').value = event.duration || 60;
        document.getElementById('evt-location').value = event.location_id || '';
        document.getElementById('evt-organizer-type').value = event.organizer_type || 'org';
        document.getElementById('evt-organizer').value = event.organizer_id || '';
        document.getElementById('evt-description').value = event.description || '';
        document.getElementById('evt-notification').value = event.notification !== false ? 'true' : 'false';
        const notifBtn = document.getElementById('evt-notification-btn');
        if (notifBtn) notifBtn.classList.toggle('done', event.notification !== false);

        _eventsRenderParticipants(event.participants || []);
    } catch (e) {
        console.error('Ошибка загрузки события:', e);
    }
}

function _eventsPopulateDropdowns() {
    const locSelect = document.getElementById('evt-location');
    const orgSelect = document.getElementById('evt-organizer');

    const locs = window.store?.allLocations || [];
    const orgs = window.store?.allOrganizers || [];

    if (locSelect) {
        locSelect.innerHTML = '<option value="">Не указана</option>' +
            locs.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    }

    if (orgSelect) {
        orgSelect.innerHTML = '<option value="">Не указан</option>' +
            orgs.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    }

    // Update notification button state
    const notifBtn = document.getElementById('evt-notification-btn');
    const notifVal = document.getElementById('evt-notification');
    if (notifBtn && notifVal) {
        notifBtn.classList.toggle('done', notifVal.value === 'true');
    }
}

function evtToggleNotification() {
    // Notification always on for events
}

function evtToggleRepeat() {
    const btn = document.getElementById('evt-repeat-btn');
    const options = document.getElementById('evt-repeat-options');
    const active = document.getElementById('evt-repeat-active');
    if (!btn || !options || !active) return;

    const newState = active.value !== 'true';
    active.value = newState ? 'true' : 'false';
    btn.classList.toggle('done', newState);
    options.style.display = newState ? 'block' : 'none';

    // Auto-select current day of week
    if (newState) {
        const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const today = days[new Date().getDay()];
        document.querySelectorAll('#evt-weekday-row .evt-wd-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.day === today);
        });
    }
}

function _eventsRenderParticipants(participants) {
    const list = document.getElementById('evt-participants-list');
    if (!list) return;
    list.innerHTML = '';
    participants.forEach(p => {
        list.insertAdjacentHTML('beforeend', `
            <div class="event-participant-tag">
                <span>${esc(p.name)}</span>
                <button class="event-participant-remove" onclick="removeEventParticipant('${p.id}')">✕</button>
            </div>
        `);
    });
}

function removeEventParticipant(pid) {
    const tag = document.querySelector(`.event-participant-tag button[onclick*="${pid}"]`);
    if (tag) tag.parentElement.remove();
}

async function evtSaveEvent() {
    const eventId = document.getElementById('evt-id').value;
    const formData = new FormData();

    formData.append('type', document.getElementById('evt-type').value);
    formData.append('date', document.getElementById('evt-date').value);
    formData.append('time', document.getElementById('evt-time').value);
    formData.append('duration', document.getElementById('evt-duration').value);
    formData.append('location_id', document.getElementById('evt-location').value);
    formData.append('organizer_type', document.getElementById('evt-organizer-type').value);
    formData.append('organizer_id', document.getElementById('evt-organizer').value);
    formData.append('description', document.getElementById('evt-description').value);
    formData.append('notification', document.getElementById('evt-notification').value);
    formData.append('completed', 'false');

    try {
        const url = eventId ? `/admin/api/events/${eventId}` : '/admin/api/events';
        const method = eventId ? 'PUT' : 'POST';
        const resp = await fetch(url, { method, body: formData });
        const result = await resp.json();

        if (result.ok) {
            evtCloseModal();
            eventsRenderBoard();
            if (typeof showToast === 'function') showToast('Сохранено');
        } else {
            alert(result.error || 'Ошибка сохранения');
        }
    } catch (e) {
        console.error('Ошибка сохранения:', e);
        alert('Ошибка сохранения');
    }
}
