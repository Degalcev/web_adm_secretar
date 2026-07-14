// ─── Страница мероприятий ──────────────────────────────────────────

let _eventsCompleted = false;
let _eventsTypeFilter = null;
let _eventsCursor = null;
let _eventsLoading = false;

const EVENT_TYPES = ['Совещание', 'Встреча', 'Заседание', 'Приём'];

function initEventsPage(completed = false) {
    _eventsCompleted = completed;
    _eventsTypeFilter = null;
    _eventsCursor = null;
    _eventsRenderPage();
    _eventsLoadEvents(true);
}

function _eventsRenderPage() {
    const container = document.getElementById('events-container');
    if (!container) return;

    const title = _eventsCompleted ? 'Завершённые мероприятия' : 'Текущие мероприятия';
    let html = `<div class="events-header"><h2>${title}</h2>`;
    html += `<div class="events-actions">`;
    html += `<button class="btn btn-secondary" onclick="openPrintModal()">Печать</button>`;
    html += `<button class="btn btn-primary" onclick="openAddEventModal()">+ Добавить</button>`;
    html += `</div></div>`;

    html += '<div class="events-tabs">';
    html += `<button class="events-tab ${!_eventsTypeFilter ? 'active' : ''}" onclick="_eventsFilterType(null)">Все</button>`;
    EVENT_TYPES.forEach(t => {
        html += `<button class="events-tab ${_eventsTypeFilter === t ? 'active' : ''}" onclick="_eventsFilterType('${t}')">${t}</button>`;
    });
    html += '</div>';

    html += '<div class="events-list" id="events-list"></div>';
    container.innerHTML = html;
}

function _eventsFilterType(type) {
    _eventsTypeFilter = type;
    _eventsCursor = null;

    document.querySelectorAll('.events-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent === (type || 'Все'));
    });

    _eventsLoadEvents(true);
}

async function _eventsLoadEvents(reset = false) {
    if (_eventsLoading) return;
    _eventsLoading = true;

    const list = document.getElementById('events-list');
    if (!list) return;

    if (reset) {
        list.innerHTML = '<div class="events-loading">Загрузка...</div>';
        _eventsCursor = null;
    }

    try {
        let url = `/admin/api/events?limit=20&status=${_eventsCompleted ? 'completed' : 'active'}`;
        if (_eventsTypeFilter) url += `&type=${encodeURIComponent(_eventsTypeFilter)}`;
        if (_eventsCursor) {
            url += `&cursor_date=${_eventsCursor.date}&cursor_time=${_eventsCursor.time}`;
        }

        const resp = await fetch(url);
        const data = await resp.json();
        const events = data.events || [];

        if (reset) list.innerHTML = '';

        events.forEach(e => {
            list.insertAdjacentHTML('beforeend', _eventsRenderRow(e));
        });

        if (data.has_more) {
            _eventsCursor = {
                date: data.next_cursor_date,
                time: data.next_cursor_time,
            };
            if (!document.getElementById('events-load-more')) {
                list.insertAdjacentHTML('beforeend',
                    '<div id="events-load-more" class="events-load-more" onclick="_eventsLoadEvents()">Загрузить ещё</div>'
                );
            }
        } else {
            const loadMore = document.getElementById('events-load-more');
            if (loadMore) loadMore.remove();
        }

        if (!events.length && reset) {
            list.innerHTML = '<div class="events-empty">Нет мероприятий</div>';
        }
    } catch (e) {
        console.error('Ошибка загрузки мероприятий:', e);
        if (reset) list.innerHTML = '<div class="events-error">Ошибка загрузки</div>';
    } finally {
        _eventsLoading = false;
    }
}

function _eventsRenderRow(e) {
    const typeClass = _eventsGetTypeClass(e.type);
    const dateStr = e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU') : '';
    const timeStr = e.time || '';
    const durationStr = e.duration ? `${e.duration} мин` : '';
    const participants = (e.participants || []).map(p => p.name).join(', ') || '—';

    return `
    <div class="event-row ${typeClass}" onclick="openEditEventModal('${e.id}')">
        <div class="event-type-badge">${e.type || 'ВКС'}</div>
        <div class="event-main">
            <div class="event-title">${e.description || e.type || 'Мероприятие'}</div>
            <div class="event-meta">
                <span class="event-date">${dateStr}</span>
                <span class="event-time">${timeStr}</span>
                <span class="event-duration">${durationStr}</span>
            </div>
            <div class="event-participants">${participants}</div>
        </div>
        <div class="event-status">${e.completed ? '✓' : ''}</div>
    </div>`;
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

function openAddEventModal() {
    if (window._modalsLoaded) window._modalsLoaded.then(() => _eventsOpenModal(null));
    else _eventsOpenModal(null);
}

function openEditEventModal(eventId) {
    if (window._modalsLoaded) window._modalsLoaded.then(() => _eventsOpenModal(eventId));
    else _eventsOpenModal(eventId);
}

function _eventsOpenModal(eventId) {
    const overlay = document.getElementById('evt-modal-overlay');
    const title = document.getElementById('evt-modal-title');
    if (!overlay) return;

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

function closeEventModal() {
    const overlay = document.getElementById('evt-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function _eventsResetForm() {
    document.getElementById('evt-id').value = '';
    document.getElementById('evt-type').value = 'ВКС';
    document.getElementById('evt-date').value = '';
    document.getElementById('evt-time').value = '';
    document.getElementById('evt-duration').value = '60';
    document.getElementById('evt-location').value = '';
    document.getElementById('evt-organizer-type').value = 'org';
    document.getElementById('evt-organizer').value = '';
    document.getElementById('evt-description').value = '';
    document.getElementById('evt-notification').checked = true;
    document.getElementById('evt-completed').checked = false;
    document.getElementById('evt-participants-list').innerHTML = '';
}

async function _eventsLoadEventData(eventId) {
    try {
        const resp = await fetch(`/admin/api/events?limit=1000`);
        const data = await resp.json();
        const event = (data.events || []).find(e => e.id === eventId);
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
        document.getElementById('evt-notification').checked = event.notification !== false;
        document.getElementById('evt-completed').checked = event.completed === true;

        _eventsRenderParticipants(event.participants || []);
    } catch (e) {
        console.error('Ошибка загрузки события:', e);
    }
}

function _eventsPopulateDropdowns() {
    const locSelect = document.getElementById('evt-location');
    const orgSelect = document.getElementById('evt-organizer');

    if (window.store && window.store.allLocations) {
        locSelect.innerHTML = '<option value="">— Не выбран —</option>';
        window.store.allLocations.forEach(l => {
            locSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
        });
    }

    if (window.store && window.store.allOrganizers) {
        orgSelect.innerHTML = '<option value="">— Не выбран —</option>';
        window.store.allOrganizers.forEach(o => {
            orgSelect.innerHTML += `<option value="${o.id}">${o.name}</option>`;
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
                <span>${p.name}</span>
                <button class="event-participant-remove" onclick="removeEventParticipant('${p.id}')">✕</button>
            </div>
        `);
    });
}

function removeEventParticipant(pid) {
    const tag = document.querySelector(`.event-participant-tag button[onclick*="${pid}"]`);
    if (tag) tag.parentElement.remove();
}

async function saveEvent() {
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
    formData.append('notification', document.getElementById('evt-notification').checked ? 'true' : 'false');
    formData.append('completed', document.getElementById('evt-completed').checked ? 'true' : 'false');

    try {
        const url = eventId ? `/admin/api/events/${eventId}` : '/admin/api/events';
        const method = eventId ? 'PUT' : 'POST';
        const resp = await fetch(url, { method, body: formData });
        const result = await resp.json();

        if (result.ok) {
            closeEventModal();
            _eventsLoadEvents(true);
            if (typeof showToast === 'function') showToast('Сохранено');
        } else {
            alert(result.error || 'Ошибка сохранения');
        }
    } catch (e) {
        console.error('Ошибка сохранения:', e);
        alert('Ошибка сохранения');
    }
}
