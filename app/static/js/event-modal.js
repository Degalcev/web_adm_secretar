// ─── Event: Модалка (Unified VKS + Мероприятия) ───────────────────────

let isLockedByOther = false;
let _modalMode = 'vks'; // 'vks' или 'events'
let _modalParticipants = [];

async function openAddEventModal(mode = 'vks') {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    _modalMode = mode;
    isLockedByOther = false;
    editingEventId = null;
    pendingFiles = [];
    removedDocIds = [];
    _modalParticipants = [];

    const isVks = mode === 'vks';
    document.getElementById('event-modal-title').textContent = isVks ? 'Добавить ВКС' : 'Новое мероприятие';
    document.getElementById('event-modal-actions').style.display = 'none';
    document.getElementById('f-event-completed').checked = false;
    // Скрыть элементы режима редактирования
    document.getElementById('event-modal-status').style.display = 'none';
    document.getElementById('event-modal-delete-btn').style.display = 'none';
    document.getElementById('event-modal-audit-btn').style.display = 'none';
    document.getElementById('event-modal-complete-btn').style.display = 'none';
    document.getElementById('event-modal-audit').style.display = 'none';
    document.getElementById('event-url-go').style.display = 'none';
    // Показать/скрыть тип
    document.getElementById('f-event-type-group').style.display = '';
    document.getElementById('f-event-type').value = isVks ? 'ВКС' : 'Совещание';
    // Accent bar — по умолчанию
    const accent = document.getElementById('event-modal-accent');
    accent.className = 'event-modal-accent';
    const now = new Date();
    document.getElementById('f-event-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    document.getElementById('f-event-time').value = '';
    document.getElementById('f-event-duration').value = '60';
    document.getElementById('f-event-url').value = '';
    document.getElementById('f-event-desc').value = '';
    await loadEventSelects();
    document.getElementById('f-event-organizer-type').value = 'org';
    onOrganizerTypeChange();
    document.getElementById('f-event-organizer').value = '';
    document.getElementById('f-event-location').value = '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();
    // Участники
    _renderParticipants();
    // Повтор
    document.getElementById('event-repeat-active').value = 'false';
    document.getElementById('event-repeat-btn').classList.remove('done');
    document.getElementById('event-repeat-options').style.display = 'none';
    // Видимость URL
    onEventTypeChange();
    document.getElementById('event-modal').classList.add('show');
}

async function openEditEventModal(id, mode = 'vks') {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    const e = store.allEvents.find(x => x.id === id);
    if (!e) return;
    _modalMode = mode;
    editingEventId = id;
    pendingFiles = [];
    removedDocIds = [];
    isLockedByOther = false;
    let lockedByName = '';

    // Try to lock
    try {
        const lockRes = await fetch(`/admin/api/events/${id}/lock`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        });
        const lockData = await lockRes.json();
        if (!lockData.ok && lockData.locked_by) {
            isLockedByOther = true;
            lockedByName = lockData.locked_by;
            showToast(`Редактирует: ${lockData.locked_by}`, 'warning');
        }
    } catch (err) { console.warn('Lock failed:', err); }
    document.getElementById('event-modal-title').textContent = (mode === 'events' ? 'Редактирование мероприятия' : 'Редактировать ВКС');
    // Показать/скрыть тип
    document.getElementById('f-event-type-group').style.display = '';
    document.getElementById('f-event-type').value = e.type || 'ВКС';
    onEventTypeChange();

    // Показать элементы режима редактирования
    document.getElementById('event-modal-delete-btn').style.display = 'inline-flex';
    document.getElementById('event-modal-complete-btn').style.display = 'inline-flex';

    // Accent bar — цвет по статусу
    const accent = document.getElementById('event-modal-accent');
    const today = localDateStr(new Date());
    if (e.completed) {
        accent.className = 'event-modal-accent status-completed';
    } else if (!e.date || e.date < today) {
        accent.className = 'event-modal-accent status-missed';
    } else {
        accent.className = 'event-modal-accent';
    }

    // Статус-бейдж
    const statusEl = document.getElementById('event-modal-status');
    statusEl.style.display = 'inline-flex';
    if (e.completed) {
        statusEl.className = 'modal-event-status status-completed';
        statusEl.innerHTML = '<span class="status-dot"></span>Завершено';
    } else if (!e.date || e.date < today) {
        statusEl.className = 'modal-event-status status-missed';
        statusEl.innerHTML = '<span class="status-dot"></span>Пропущено';
    } else {
        statusEl.className = 'modal-event-status status-active';
        statusEl.innerHTML = '<span class="status-dot"></span>В работе';
    }

    // Кнопка «Завершить» — pill
    const completeBtn = document.getElementById('event-modal-complete-btn');
    const pillLabel = completeBtn.querySelector('.pill-label');
    if (e.completed) {
        completeBtn.classList.add('active');
        if (pillLabel) pillLabel.textContent = 'Завершено';
    } else {
        completeBtn.classList.remove('active');
        if (pillLabel) pillLabel.textContent = 'Завершить';
    }

    document.getElementById('f-event-completed').checked = e.completed;
    document.getElementById('f-event-date').value = e.date || '';
    document.getElementById('f-event-time').value = e.time || '';
    document.getElementById('f-event-duration').value = e.duration || 60;
    document.getElementById('f-event-url').value = e.url || '';
    document.getElementById('f-event-desc').value = e.description || '';
    await loadEventSelects();
    document.getElementById('f-event-organizer-type').value = e.organizer_type || 'org';
    onOrganizerTypeChange();
    document.getElementById('f-event-organizer').value = e.organizer_id || '';
    document.getElementById('f-event-location').value = e.location_id || '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();

    // Участники
    _modalParticipants = (e.participants || []).map(p => ({ id: p.user_id || p.id, name: p.name }));
    _renderParticipants();

    // Повтор — загрузить серию если есть
    const repeatBtn = document.getElementById('event-repeat-btn');
    const repeatOpts = document.getElementById('event-repeat-options');
    const repeatActive = document.getElementById('event-repeat-active');
    if (e.series_id) {
        try {
            const seriesRes = await fetch(`${BASE_URL}/admin/api/events/${e.id}/series`, {
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': getCsrfToken() }
            });
            const seriesData = await seriesRes.json();
            if (seriesData.series) {
                const s = seriesData.series;
                repeatActive.value = 'true';
                repeatBtn.classList.add('done');
                repeatOpts.style.display = 'block';
                let freqVal = 'weekly';
                if (s.freq === 'monthly') freqVal = 'monthly';
                else if (s.interval_val === 2) freqVal = 'biweekly';
                document.getElementById('event-repeat-freq').value = freqVal;
                document.getElementById('event-repeat-until').value = s.until || '';
                document.querySelectorAll('#event-weekday-row .evt-wd-btn').forEach(b => {
                    b.classList.toggle('active', (s.by_day || []).includes(b.dataset.day));
                });
            } else {
                repeatActive.value = 'false';
                repeatBtn.classList.remove('done');
                repeatOpts.style.display = 'none';
            }
        } catch (err) {
            repeatActive.value = 'false';
            repeatBtn.classList.remove('done');
            repeatOpts.style.display = 'none';
        }
    } else {
        repeatActive.value = 'false';
        repeatBtn.classList.remove('done');
        repeatOpts.style.display = 'none';
    }
    const urlGo = document.getElementById('event-url-go');
    if (e.url) {
        urlGo.href = e.url;
        urlGo.style.display = 'inline-flex';
    } else {
        urlGo.style.display = 'none';
    }

    // Кнопка «История» (таймлайн)
    const auditBtn = document.getElementById('event-modal-audit-btn');
    if (e.last_changed_by || e.id) {
        auditBtn.style.display = 'inline-flex';
        auditBtn.onclick = () => {
            const container = document.getElementById('event-modal-audit');
            if (container.style.display === 'block') {
                hideEventHistory();
            } else {
                loadEventHistory(e.id);
            }
        };
    } else {
        auditBtn.style.display = 'none';
    }

    // If locked by another user — disable editing
    if (isLockedByOther) {
        document.getElementById('event-modal-save-btn').disabled = true;
        document.getElementById('event-modal-delete-btn').disabled = true;
        document.getElementById('event-modal-complete-btn').disabled = true;
        document.getElementById('f-event-date').disabled = true;
        document.getElementById('f-event-time').disabled = true;
        document.getElementById('f-event-organizer').disabled = true;
        document.getElementById('f-event-location').disabled = true;
        document.getElementById('f-event-desc').disabled = true;
        document.getElementById('f-event-url').disabled = true;
        document.getElementById('event-doc-upload-label').style.display = 'none';
    } else {
        document.getElementById('event-modal-save-btn').disabled = false;
        document.getElementById('event-modal-delete-btn').disabled = false;
        document.getElementById('event-modal-complete-btn').disabled = false;
        document.getElementById('f-event-date').disabled = false;
        document.getElementById('f-event-time').disabled = false;
        document.getElementById('f-event-organizer').disabled = false;
        document.getElementById('f-event-location').disabled = false;
        document.getElementById('f-event-desc').disabled = false;
        document.getElementById('f-event-url').disabled = false;
        document.getElementById('event-doc-upload-label').style.display = '';
    }

    // Lock info banner
    let lockInfo = document.getElementById('event-modal-lock-info');
    let lockText = document.getElementById('event-modal-lock-text');
    // Create dynamically if partial not loaded yet
    if (!lockInfo) {
        lockInfo = document.createElement('div');
        lockInfo.id = 'event-modal-lock-info';
        lockInfo.className = 'modal-lock-info';
        lockInfo.style.display = 'none';
        lockInfo.innerHTML = `${LOCK_SVG}<span id="event-modal-lock-text"></span>`;
        const modalBody = document.querySelector('.event-modal-flat .modal-body');
        if (modalBody) modalBody.insertBefore(lockInfo, modalBody.firstChild);
        lockText = document.getElementById('event-modal-lock-text');
    }
    if (lockInfo && lockText) {
        if (isLockedByOther && lockedByName) {
            lockText.textContent = `Редактирует: ${lockedByName}`;
            lockInfo.style.display = 'flex';
        } else {
            lockInfo.style.display = 'none';
        }
    }

    document.getElementById('event-modal').classList.add('show');
}

function closeEventModal() {
    if (editingEventId && !isLockedByOther) {
        fetch(`/admin/api/events/${editingEventId}/unlock`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        }).catch(() => {});
    }
    hideEventHistory();
    document.getElementById('event-modal').classList.remove('show');
    document.getElementById('event-url-go').style.display = 'none';
    pendingFiles = [];
    removedDocIds = [];
}

function refreshEventDocs() {
    const docsContainer = document.getElementById('f-event-docs');

    const existing = (editingEventId)
        ? (store.allEvents.find(x => x.id === editingEventId)?.documents || [])
            .filter(d => !removedDocIds.includes(d.id))
        : [];

    const all = [
        ...existing.map(d => ({ id: d.id, name: d.name, size: d.size, pending: false })),
        ...pendingFiles.map((f, i) => ({ id: `pending-${i}`, name: f.name, size: f.size, pending: true }))
    ];

    if (all.length) {
        docsContainer.innerHTML = all.map(d => {
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const meta = getDocCardMeta(ext);
            const deleteBtn = d.pending
                ? `<button class="doc-card-delete" onclick="event.stopPropagation();removePendingFile('${d.id}')" title="Убрать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`
                : `<button class="doc-card-delete" onclick="event.stopPropagation();removeExistingDoc('${d.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`;
            const clickAttr = d.pending ? '' : `onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}')"`;
            const pendingBadge = d.pending ? '<span class="doc-card-pending">новый</span>' : '';
            const sizeText = d.size ? formatSize(d.size) : '';
            const metaParts = [sizeText, pendingBadge].filter(Boolean).join(' · ');
            return `<div class="doc-card-row"><div class="doc-card ${d.pending ? '' : 'event-doc-downloadable'}" ${clickAttr}><div class="doc-card-icon ${meta.cls}">${meta.label}</div><div class="doc-card-info"><div class="doc-card-name">${esc(d.name)}</div>${metaParts ? `<div class="doc-card-meta">${metaParts}</div>` : ''}</div></div>${deleteBtn}</div>`;
        }).join('');
    } else {
        docsContainer.innerHTML = '';
    }
    _updateDocScrollGradients();

    // Disable doc delete buttons if locked by another user
    if (isLockedByOther) {
        document.querySelectorAll('.doc-card-delete').forEach(btn => btn.disabled = true);
    }
}

function _updateDocScrollGradients() {
    requestAnimationFrame(() => {
        const el = document.getElementById('f-event-docs');
        const fadeTop = document.getElementById('doc-fade-top');
        const fadeBottom = document.getElementById('doc-fade-bottom');
        if (!el || !fadeTop || !fadeBottom) return;
        const scrollable = el.scrollHeight > el.clientHeight + 1;
        fadeTop.classList.toggle('is-visible', scrollable && el.scrollTop > 1);
        fadeBottom.classList.toggle('is-visible', scrollable && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
        if (!scrollable) return;
        const update = () => {
            fadeTop.classList.toggle('is-visible', el.scrollTop > 1);
            fadeBottom.classList.toggle('is-visible', el.scrollTop + el.clientHeight < el.scrollHeight - 1);
        };
        el.removeEventListener('scroll', el._docScrollHandler);
        el._docScrollHandler = update;
        el.addEventListener('scroll', update);
    });
}

function addPendingFiles(fileList) {
    for (const f of fileList) {
        pendingFiles.push(f);
    }
    refreshEventDocs();
}

function removePendingFile(id) {
    const idx = parseInt(id.replace('pending-', ''), 10);
    pendingFiles.splice(idx, 1);
    refreshEventDocs();
}

function removeExistingDoc(docId) {
    removedDocIds.push(docId);
    refreshEventDocs();
}

async function downloadDoc(docId, fileName) {
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/documents/${docId}/download`);
        if (!resp.ok) { showToast('Ошибка скачивания', 'error'); return; }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function loadEventSelects() {
    await ensureOrgsAndLocs();

    const orgSelect = document.getElementById('f-event-organizer');
    const locSelect = document.getElementById('f-event-location');

    orgSelect.innerHTML = '<option value="">Не указан</option>' +
        (store.allOrganizers || []).map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');

    locSelect.innerHTML = '<option value="">Не указана</option>' +
        (store.allLocations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

    // Заполнить фильтры VKS
    populateVksFilters();
}

async function saveEvent() {
    const btn = document.getElementById('event-modal-save-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    const origText = btn.textContent;
    btn.textContent = 'Сохранение...';

    const date = document.getElementById('f-event-date').value;
    const time = document.getElementById('f-event-time').value;
    const organizer = document.getElementById('f-event-organizer').value;
    const location = document.getElementById('f-event-location').value;

    if (!date) { showToast('Укажите дату', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!time) { showToast('Укажите время', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!organizer) { showToast('Выберите организатора', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }
    if (!location) { showToast('Выберите локацию', 'error'); btn.disabled = false; btn.classList.remove('loading'); btn.textContent = origText; return; }

    const csrfToken = getCsrfToken();
    const formData = new FormData();
    formData.append('date', date);
    formData.append('time', time);
    formData.append('duration', document.getElementById('f-event-duration').value);
    formData.append('organizer_id', organizer);
    formData.append('organizer_type', document.getElementById('f-event-organizer-type').value);
    formData.append('location_id', location);
    formData.append('type', document.getElementById('f-event-type').value);
    formData.append('url', document.getElementById('f-event-url').value.trim());
    formData.append('description', document.getElementById('f-event-desc').value.trim());
    formData.append('completed', document.getElementById('f-event-completed').checked ? 'true' : 'false');
    formData.append('notification', 'true');
    formData.append('csrf_token', csrfToken);
    formData.append('participants', JSON.stringify(_modalParticipants));

    if (editingEventId) {
        const existing = store.allEvents.find(x => x.id === editingEventId)?.documents || [];
        const keepIds = existing.filter(d => !removedDocIds.includes(d.id)).map(d => d.id);
        formData.append('keep_doc_ids', keepIds.join(','));
    }

    for (const f of pendingFiles) {
        formData.append('files', f, f.name);
    }

    try {
        let resp;
        if (editingEventId) {
            resp = await fetch(`${BASE_URL}/admin/api/events/${editingEventId}`, {
                method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, body: formData
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/events`, {
                method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData
            });
        }
        const data = await resp.json();
        if (data.ok) {
            const wasEditing = !!editingEventId;
            const savedEventId = data.id || editingEventId;

            // Создать серию если repeat активен, удалить если деактивирован
            const repeatActive = document.getElementById('event-repeat-active').value === 'true';
            if (savedEventId) {
                const existingEvent = store.allEvents.find(x => x.id === savedEventId);
                const hadSeries = existingEvent && existingEvent.series_id;
                if (repeatActive) {
                    const byDay = [];
                    document.querySelectorAll('#event-weekday-row .evt-wd-btn.active').forEach(b => byDay.push(b.dataset.day));
                    const freqMap = { 'weekly': 'weekly', 'biweekly': 'weekly', 'monthly': 'monthly' };
                    const intervalMap = { 'weekly': 1, 'biweekly': 2, 'monthly': 1 };
                    const freqVal = document.getElementById('event-repeat-freq').value;
                    try {
                        await fetch(`${BASE_URL}/admin/api/events/${savedEventId}/series`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                            body: JSON.stringify({
                                freq: freqMap[freqVal] || 'weekly',
                                interval_val: intervalMap[freqVal] || 1,
                                by_day: byDay,
                                until: document.getElementById('event-repeat-until').value || null,
                            })
                        });
                    } catch (e) { console.warn('Series create error:', e); }
                } else if (hadSeries) {
                    try {
                        await fetch(`${BASE_URL}/admin/api/events/${savedEventId}/series`, {
                            method: 'DELETE',
                            headers: { 'X-CSRF-Token': csrfToken }
                        });
                    } catch (e) { console.warn('Series delete error:', e); }
                }
            }

            await loadAllEvents();
            const activeBoard = document.getElementById('vks-board-active');
            const completedBoard = document.getElementById('vks-board-completed');
            if (activeBoard) renderVksBoard('vks-board-active', 'active');
            if (completedBoard) renderVksBoard('vks-board-completed', 'completed');
            // Refresh dashboard if visible
            if (typeof _dashEvents !== 'undefined' && document.getElementById('page-dashboard')?.classList.contains('active')) {
                _dashEvents = [...store.allEvents];
                try { localStorage.setItem('dash_cache', JSON.stringify({ events: _dashEvents, locations: _dashLocations, organizers: _dashOrganizers })); } catch(e) {}
                renderDashboard();
            }
            // Refresh events page if visible
            if (_modalMode === 'events' && typeof eventsRenderBoard === 'function') {
                eventsRenderBoard();
            }
            closeEventModal();
            showToast(wasEditing ? (_modalMode === 'events' ? 'Мероприятие обновлено' : 'ВКС обновлено') : (_modalMode === 'events' ? 'Мероприятие добавлено' : 'ВКС добавлено'), 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = origText;
}

async function loadEventHistory(eventId) {
    const container = document.getElementById('event-modal-audit');
    if (!container) return;

    container.innerHTML = '<div class="timeline-loading">Загрузка...</div>';
    // Position drawer at right edge of modal-body, 3/4 width
    const body = document.querySelector('.event-modal-flat .modal-body');
    if (body) {
        const rect = body.getBoundingClientRect();
        const w = Math.round(rect.width * 0.75);
        container.style.top = (rect.top + 1) + 'px';
        container.style.left = (rect.right - w) + 'px';
        container.style.width = w + 'px';
        container.style.height = (rect.height - 2) + 'px';
    }
    container.style.display = 'block';
    requestAnimationFrame(() => {
        container.classList.add('drawer-open');
        const wrapper = container.closest('.event-modal-body-wrapper') || document.querySelector('.event-modal-body-wrapper');
        if (wrapper) wrapper.classList.add('timeline-dimmed');
    });

    try {
        const res = await fetch(`/admin/api/events/${eventId}/history`, {
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        });
        const data = await res.json();

        if (!data.ok || !data.history || data.history.length === 0) {
            container.innerHTML = '<div class="timeline-empty">История изменений пуста</div>';
            return;
        }

        const actionLabels = {
            'create': 'Создание',
            'update': 'Редактирование',
            'complete': 'Завершение',
            'uncomplete': 'Отмена завершения',
            'delete': 'Удаление',
            'doc_remove': 'Удаление документов',
        };

        const fieldLabels = {
            'type': 'Тип',
            'date': 'Дата',
            'time': 'Время',
            'organizer_id': 'Организатор',
            'location_id': 'Локация',
            'url': 'Ссылка',
            'description': 'Описание',
            'completed': 'Статус',
            'notification': 'Уведомление',
            'documents': 'Документы',
        };

        let html = '';
        for (const entry of data.history) {
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const actionLabel = actionLabels[entry.action] || entry.action;
            const dotClass = {
                'create': '',
                'update': ' dot-muted',
                'complete': ' dot-success',
                'uncomplete': ' dot-warning',
                'delete': ' dot-danger',
                'doc_remove': ' dot-danger',
            }[entry.action] || '';

            html += `<div class="timeline-entry">
                <div class="timeline-dot${dotClass}"></div>
                <div class="timeline-content">
                    <div class="timeline-user">${esc(entry.user_name)}</div>
                    <div class="timeline-datetime">${dateStr}, ${timeStr}</div>
                    <div class="timeline-action">${actionLabel}</div>`;

            if (entry.changes) {
                html += '<div class="timeline-changes">';
                for (const [field, diff] of Object.entries(entry.changes)) {
                    if (field === 'documents') {
                        if (diff.added) {
                            for (const doc of diff.added) {
                                html += `<div class="timeline-change">+ Документ: ${esc(doc.name)}</div>`;
                            }
                        }
                        if (diff.removed) {
                            for (const doc of diff.removed) {
                                html += `<div class="timeline-change timeline-change-remove">- Документ: ${esc(doc.name || doc.id)}</div>`;
                            }
                        }
                    } else {
                        const label = fieldLabels[field] || field;
                        const oldVal = diff.old !== null && diff.old !== undefined ? String(diff.old) : '(пусто)';
                        const newVal = diff.new !== null && diff.new !== undefined ? String(diff.new) : '(пусто)';
                        html += `<div class="timeline-change">${esc(label)}: ${esc(oldVal)} → ${esc(newVal)}</div>`;
                    }
                }
                html += '</div>';
            }

            html += '</div></div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="timeline-error">Ошибка загрузки истории</div>';
    }
}

function hideEventHistory() {
    const container = document.getElementById('event-modal-audit');
    if (container) {
        container.classList.remove('drawer-open');
        container.style.display = 'none';
        container.innerHTML = '';
        const wrapper = document.querySelector('.event-modal-body-wrapper');
        if (wrapper) wrapper.classList.remove('timeline-dimmed');
    }
}

// ─── Unified modal: type, organizer toggle, participants, repeat ───────

function onEventTypeChange() {
    const type = document.getElementById('f-event-type').value;
    const urlGroup = document.getElementById('f-event-url-group');
    if (urlGroup) urlGroup.style.display = type === 'ВКС' ? '' : 'none';
}

function onOrganizerTypeChange() {
    const orgType = document.getElementById('f-event-organizer-type').value;
    const sel = document.getElementById('f-event-organizer');
    if (!sel) return;
    const currentVal = sel.value;
    if (orgType === 'user') {
        const users = store.allUsers || [];
        sel.innerHTML = '<option value="">Не указан</option>' +
            users.map(u => {
                const name = [u.last_name, u.first_name].filter(Boolean).join(' ') || u.name || u.username || `#${u.max_id}`;
                return `<option value="${u.id}">${esc(name)}</option>`;
            }).join('');
    } else {
        const orgs = store.allOrganizers || [];
        sel.innerHTML = '<option value="">Не указан</option>' +
            orgs.map(o => `<option value="${o.id}">${esc(o.short_name || o.name)}</option>`).join('');
    }
    if (currentVal) sel.value = currentVal;
}

function _renderParticipants() {
    const list = document.getElementById('event-participants-list');
    if (!list) return;
    list.innerHTML = _modalParticipants.map((p, i) =>
        `<div class="event-participant-tag">
            <span>${esc(p.name)}</span>
            <button class="event-participant-remove" onclick="removeParticipant(${i})">✕</button>
        </div>`
    ).join('');
}

function removeParticipant(idx) {
    _modalParticipants.splice(idx, 1);
    _renderParticipants();
}

let _participantSearchTimer = null;
function searchParticipants(query) {
    clearTimeout(_participantSearchTimer);
    const dropdown = document.getElementById('event-participant-dropdown');
    if (!query || query.length < 2) { dropdown.style.display = 'none'; return; }
    _participantSearchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/admin/api/participants/search?q=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
            if (!res.ok) return;
            const users = await res.json();
            const existing = new Set(_modalParticipants.map(p => p.id));
            const filtered = users.filter(u => !existing.has(u.id));
            if (!filtered.length) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = filtered.map(u => {
                const name = [u.last_name, u.first_name].filter(Boolean).join(' ') || u.name || u.username;
                return `<div class="event-participant-option" onclick="addParticipant('${u.id}','${esc(name)}')">${esc(name)}</div>`;
            }).join('');
            dropdown.style.display = 'block';
        } catch (e) { console.warn('Search error:', e); }
    }, 300);
}

function addParticipant(id, name) {
    if (!_modalParticipants.some(p => p.id === id)) {
        _modalParticipants.push({ id, name });
        _renderParticipants();
    }
    document.getElementById('event-participant-search').value = '';
    document.getElementById('event-participant-dropdown').style.display = 'none';
}

function evtToggleRepeat() {
    const btn = document.getElementById('event-repeat-btn');
    const options = document.getElementById('event-repeat-options');
    const active = document.getElementById('event-repeat-active');
    if (!btn || !options || !active) return;
    const newState = active.value !== 'true';
    active.value = newState ? 'true' : 'false';
    btn.classList.toggle('done', newState);
    options.style.display = newState ? 'block' : 'none';
    if (newState) {
        const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const today = days[new Date().getDay()];
        document.querySelectorAll('#event-weekday-row .evt-wd-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.day === today);
        });
    }
}
