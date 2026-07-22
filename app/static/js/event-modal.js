// ─── Event: Модалка (Unified VKS + Мероприятия) ───────────────────────

let isLockedByOther = false;
let _modalMode = 'vks'; // 'vks' или 'events'
let _modalParticipants = [];
let _currentEvent = null; // текущее загруженное событие

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
    _setRepeatUI(null);
    // Видимость URL
    onEventTypeChange();
    document.getElementById('event-modal').classList.add('show');
}

async function openEditEventModal(id, mode = 'vks') {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    // Загружаем событие с сервера вместо store.allEvents
    let e;
    try {
        const resp = await fetch(`/admin/api/events/${id}/single`, { credentials: 'same-origin' });
        const data = await resp.json();
        if (!data.ok || !data.event) return;
        e = data.event;
    } catch (err) { console.error('Failed to load event:', err); return; }
    _currentEvent = e;
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
    if (e.series_id) {
        try {
            const seriesRes = await fetch(`${BASE_URL}/admin/api/events/${e.id}/series`, {
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': getCsrfToken() }
            });
            const seriesData = await seriesRes.json();
            _setRepeatUI(seriesData.series);
        } catch (err) {
            _setRepeatUI(null);
        }
    } else {
        _setRepeatUI(null);
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
            if (container.classList.contains('drawer-open')) {
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
    _currentEvent = null;
}

function refreshEventDocs() {
    const docsContainer = document.getElementById('f-event-docs');

    const existing = (editingEventId)
        ? (_currentEvent?.documents || [])
            .filter(d => !removedDocIds.includes(d.id))
        : [];

    const all = [
        ...existing.map(d => ({ id: d.id, name: d.name, size: d.size, pending: false })),
        ...pendingFiles.map((f, i) => ({ id: `pending-${i}`, name: f.name, size: f.size, pending: true }))
    ];

    const _docsCountEl = document.getElementById('f-event-docs-count');
    if (_docsCountEl) _docsCountEl.textContent = all.length ? ('· ' + all.length) : '';

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
    // Справочники уже загружены preloader.js (store.allOrganizers, store.allLocations)
    // Если пустые — загрузить напрямую
    if (!store.allOrganizers?.length || !store.allLocations?.length) {
        const [orgResp, locResp] = await Promise.all([
            fetch('/admin/api/organizers', { credentials: 'same-origin' }),
            fetch('/admin/api/locations', { credentials: 'same-origin' })
        ]);
        if (orgResp.ok) store.allOrganizers = await orgResp.json();
        if (locResp.ok) store.allLocations = await locResp.json();
    }

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
        const existing = _currentEvent?.documents || [];
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
            if (savedEventId) {
                const existingEvent = _currentEvent;
                const hadSeries = existingEvent && existingEvent.series_id;
                const repeatData = _getRepeatData();
                if (repeatData) {
                    try {
                        await fetch(`${BASE_URL}/admin/api/events/${savedEventId}/series`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                            body: JSON.stringify(repeatData)
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

            closeEventModal();
            // Собственное действие: обновить доску/счётчики (SSE мог быть подавлен гейтом модалки)
            if (typeof refreshCurrentBoard === 'function') refreshCurrentBoard();
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
    const drawer = document.getElementById('event-modal-audit');
    if (!drawer) return;
    const body = document.getElementById('event-modal-audit-body') || drawer;
    const backdrop = document.getElementById('event-modal-audit-backdrop');

    body.innerHTML = '<div class="timeline-loading">Загрузка...</div>';
    if (backdrop) backdrop.style.display = 'block';
    drawer.style.display = 'flex';
    requestAnimationFrame(() => {
        drawer.classList.add('drawer-open');
        if (backdrop) backdrop.classList.add('show');
    });

    try {
        const res = await fetch(`/admin/api/events/${eventId}/history`, {
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        });
        const data = await res.json();

        if (!data.ok || !data.history || data.history.length === 0) {
            body.innerHTML = '<div class="timeline-empty">История изменений пуста</div>';
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

        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = '<div class="timeline-error">Ошибка загрузки истории</div>';
    }
}

function hideEventHistory() {
    const drawer = document.getElementById('event-modal-audit');
    const backdrop = document.getElementById('event-modal-audit-backdrop');
    if (drawer) {
        drawer.classList.remove('drawer-open');
        drawer.style.display = 'none';
        const body = document.getElementById('event-modal-audit-body');
        if (body) body.innerHTML = '';
    }
    if (backdrop) {
        backdrop.classList.remove('show');
        backdrop.style.display = 'none';
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
    const _pcEl = document.getElementById('event-participants-count');
    if (_pcEl) _pcEl.textContent = _modalParticipants.length ? ('· ' + _modalParticipants.length) : '';
    list.innerHTML = _modalParticipants.map((p, i) =>
        `<div class="event-participant-tag">
            <span class="ep-av">${esc((p.name||'?').charAt(0))}</span>
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

function openRepeatModal() {
    const overlay = document.getElementById('repeat-modal-overlay');
    if (!overlay) return;
    // Показать/скрыть кнопку удаления
    const deleteBtn = document.getElementById('repeat-delete-btn');
    const hasSeries = editingEventId && _currentEvent?.series_id;
    if (deleteBtn) deleteBtn.style.display = hasSeries ? '' : 'none';
    // Восстановить текущее состояние
    const active = document.getElementById('event-repeat-active').value === 'true';
    if (active) {
        const type = document.getElementById('event-repeat-type').value;
        const until = document.getElementById('event-repeat-until-val')?.value || '';
        document.getElementById('event-repeat-until').value = until;
        switchRepeatType(type);
    } else {
        switchRepeatType('daily');
        document.querySelector('input[name="repeat-daily-mode"][value="interval"]').checked = true;
        document.getElementById('repeat-daily-interval').value = '1';
        document.getElementById('repeat-daily-interval').disabled = false;
        document.getElementById('repeat-weekly-interval').value = '1';
        document.querySelectorAll('#repeat-weekday-row .evt-wd-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('repeat-monthly-interval').value = '1';
        document.getElementById('event-repeat-until').value = '';
    }
    // Установить число месяца
    const dateVal = document.getElementById('f-event-date').value;
    if (dateVal) {
        document.getElementById('repeat-monthly-day').textContent = parseInt(dateVal.split('-')[2], 10);
    }
    overlay.style.display = 'flex';
}

function closeRepeatModal() {
    const overlay = document.getElementById('repeat-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function deleteRepeatModal() {
    if (!editingEventId) return;
    const csrfToken = getCsrfToken();
    fetch(`${BASE_URL}/admin/api/events/${editingEventId}/series`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken }
    }).then(r => r.json()).then(data => {
        if (data.ok) {
            _setRepeatUI(null);
            closeRepeatModal();
            showToast('Повтор удалён', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    }).catch(() => showToast('Ошибка сети', 'error'));
}

function saveRepeatModal() {
    // Собрать данные из модалки
    const type = document.getElementById('event-repeat-type').value;
    const hasRepeat = true;
    // Сохранить в скрытые поля основной формы
    document.getElementById('event-repeat-active').value = 'true';
    document.getElementById('event-repeat-type').value = type;
    // Создать/обновить скрытое поле для until
    let untilField = document.getElementById('event-repeat-until-val');
    if (!untilField) {
        untilField = document.createElement('input');
        untilField.type = 'hidden';
        untilField.id = 'event-repeat-until-val';
        document.getElementById('event-repeat-active').parentNode.appendChild(untilField);
    }
    untilField.value = document.getElementById('event-repeat-until').value;
    // Обновить pill кнопку
    const btn = document.getElementById('event-repeat-btn');
    const label = document.getElementById('event-repeat-label');
    btn.classList.add('done');
    const typeLabels = { daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно' };
    let desc = typeLabels[type] || '';
    if (type === 'daily') {
        const mode = document.querySelector('input[name="repeat-daily-mode"]:checked')?.value;
        if (mode === 'workdays') desc = 'Рабочие дни';
        else desc = `Каждый ${document.getElementById('repeat-daily-interval').value} дн.`;
    } else if (type === 'weekly') {
        const interval = document.getElementById('repeat-weekly-interval').value;
        const days = [];
        document.querySelectorAll('#repeat-weekday-row .evt-wd-btn.active').forEach(b => days.push(b.dataset.day));
        desc = `Каждую ${interval} нед. (${days.join(', ')})`;
    } else if (type === 'monthly') {
        const interval = document.getElementById('repeat-monthly-interval').value;
        const day = document.getElementById('repeat-monthly-day').textContent;
        desc = `Каждые ${interval} мес., ${day} числа`;
    }
    if (label) label.textContent = desc;
    closeRepeatModal();
}

function switchRepeatType(type) {
    document.getElementById('event-repeat-type').value = type;
    document.querySelectorAll('.evt-repeat-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    document.getElementById('repeat-panel-daily').style.display = type === 'daily' ? '' : 'none';
    document.getElementById('repeat-panel-weekly').style.display = type === 'weekly' ? '' : 'none';
    document.getElementById('repeat-panel-monthly').style.display = type === 'monthly' ? '' : 'none';
}

function onRepeatDailyModeChange() {
    const mode = document.querySelector('input[name="repeat-daily-mode"]:checked').value;
    document.getElementById('repeat-daily-interval').disabled = mode !== 'interval';
}

function _getRepeatData() {
    const active = document.getElementById('event-repeat-active').value === 'true';
    if (!active) return null;
    const type = document.getElementById('event-repeat-type').value;
    const untilField = document.getElementById('event-repeat-until-val');
    const until = untilField ? untilField.value || null : null;
    if (type === 'daily') {
        const mode = document.querySelector('input[name="repeat-daily-mode"]:checked');
        if (mode && mode.value === 'workdays') {
            return { freq: 'weekly', interval_val: 1, by_day: ['mon', 'tue', 'wed', 'thu', 'fri'], until };
        } else {
            const interval = parseInt(document.getElementById('repeat-daily-interval')?.value, 10) || 1;
            return { freq: 'daily', interval_val: interval, by_day: [], until };
        }
    } else if (type === 'weekly') {
        const interval = parseInt(document.getElementById('repeat-weekly-interval')?.value, 10) || 1;
        const byDay = [];
        document.querySelectorAll('#repeat-weekday-row .evt-wd-btn.active').forEach(b => byDay.push(b.dataset.day));
        return { freq: 'weekly', interval_val: interval, by_day: byDay, until };
    } else if (type === 'monthly') {
        const interval = parseInt(document.getElementById('repeat-monthly-interval')?.value, 10) || 1;
        return { freq: 'monthly', interval_val: interval, by_day: [], until };
    }
    return null;
}

function _setRepeatUI(seriesData) {
    const btn = document.getElementById('event-repeat-btn');
    const label = document.getElementById('event-repeat-label');
    if (!seriesData) {
        document.getElementById('event-repeat-active').value = 'false';
        document.getElementById('event-repeat-type').value = 'daily';
        btn.classList.remove('done');
        if (label) label.textContent = 'Повторять';
        return;
    }
    document.getElementById('event-repeat-active').value = 'true';
    btn.classList.add('done');

    const freq = seriesData.freq;
    const interval = seriesData.interval_val || 1;
    const byDay = seriesData.by_day || [];
    const until = seriesData.until || '';

    // Сохранить until в скрытое поле
    let untilField = document.getElementById('event-repeat-until-val');
    if (!untilField) {
        untilField = document.createElement('input');
        untilField.type = 'hidden';
        untilField.id = 'event-repeat-until-val';
        document.getElementById('event-repeat-active').parentNode.appendChild(untilField);
    }
    untilField.value = until;

    if (freq === 'daily') {
        document.getElementById('event-repeat-type').value = 'daily';
        let desc = `Каждый ${interval} дн.`;
        if (label) label.textContent = desc;
    } else if (freq === 'weekly') {
        if (byDay.length === 5 && ['mon','tue','wed','thu','fri'].every(d => byDay.includes(d)) && interval === 1) {
            document.getElementById('event-repeat-type').value = 'daily';
            if (label) label.textContent = 'Рабочие дни';
        } else {
            document.getElementById('event-repeat-type').value = 'weekly';
            const dayNames = { mon:'Пн', tue:'Вт', wed:'Ср', thu:'Чт', fri:'Пт', sat:'Сб', sun:'Вс' };
            const names = byDay.map(d => dayNames[d] || d);
            if (label) label.textContent = `Каждую ${interval} нед. (${names.join(', ')})`;
        }
    } else if (freq === 'monthly') {
        document.getElementById('event-repeat-type').value = 'monthly';
        if (label) label.textContent = `Каждые ${interval} мес.`;
    }
}


// Event Workspace v4: normalized dirty state and inline recurrence editor
let _initialEventFormState = null;
let _eventSaveInProgress = false;
let _repeatPreviewTimer = null;
let _repeatPreviewController = null;

function _value(id) { return document.getElementById(id)?.value || ''; }
function normalizeRepeatData(data) { if (!data) return null; return {freq:data.freq,interval_val:Number(data.interval_val)||1,by_day:[...(data.by_day||[])].sort(),until:data.until||null}; }
function collectEventFormState() {
    const existingDocs = (_currentEvent?.documents || []).filter(d => !removedDocIds.includes(d.id)).map(d => String(d.id)).sort();
    const files = pendingFiles.map(f => `${f.name}:${f.size}:${f.lastModified || 0}`).sort();
    return {type:_value('f-event-type'),date:_value('f-event-date'),time:_value('f-event-time'),duration:_value('f-event-duration'),locationId:_value('f-event-location'),organizerType:_value('f-event-organizer-type'),organizerId:_value('f-event-organizer'),description:document.getElementById('f-event-desc')?.value || '',url:document.getElementById('f-event-url')?.value || '',completed:!!document.getElementById('f-event-completed')?.checked,participants:_modalParticipants.map(p=>String(p.id)).sort(),documents:existingDocs,pendingFiles:files,repeat:normalizeRepeatData(_getRepeatData())};
}
function captureInitialEventFormState(){ _initialEventFormState=JSON.stringify(collectEventFormState()); updateEventDirtyState(); }
function hasEventFormChanges(){ return _initialEventFormState!==null && JSON.stringify(collectEventFormState())!==_initialEventFormState; }
function updateEventDirtyState(){ const dirty=hasEventFormChanges(); document.getElementById('event-modal-dirty')?.classList.toggle('show',dirty); const save=document.getElementById('event-modal-save-btn'); if(save&&!_eventSaveInProgress) save.disabled=isLockedByOther||!dirty; return dirty; }
function initializeEventFormTracking(){ const modal=document.getElementById('event-modal'); if(!modal||modal.dataset.dirtyTracking)return; modal.dataset.dirtyTracking='1'; const onChange=e=>{ if(e.target.closest('#event-repeat-card')) scheduleRepeatPreview(); updateEventDirtyState(); }; modal.addEventListener('input',onChange); modal.addEventListener('change',onChange); }
function requestCloseEventModal(){ return closeEventModal(false); }
function closeEventModal(force=false){ if(!force&&!_eventSaveInProgress&&hasEventFormChanges()&&!window.confirm('Закрыть без сохранения изменений?'))return false; if(editingEventId&&!isLockedByOther){fetch(`/admin/api/events/${editingEventId}/unlock`,{method:'PUT',credentials:'same-origin',headers:{'X-CSRF-Token':getCsrfToken()}}).catch(()=>{});} hideEventHistory(); document.getElementById('event-modal').classList.remove('show'); document.getElementById('event-url-go').style.display='none'; pendingFiles=[]; removedDocIds=[]; _currentEvent=null; _initialEventFormState=null; return true; }
const _openAddEventModalBase=openAddEventModal; openAddEventModal=async function(...args){await _openAddEventModalBase(...args); initializeEventFormTracking(); captureInitialEventFormState();};
const _openEditEventModalBase=openEditEventModal; openEditEventModal=async function(...args){await _openEditEventModalBase(...args); initializeEventFormTracking(); captureInitialEventFormState();};
const _saveEventBase=saveEvent; saveEvent=async function(...args){_eventSaveInProgress=true; try{return await _saveEventBase(...args);} finally{_eventSaveInProgress=false; updateEventDirtyState();}};
['addPendingFiles','removePendingFile','removeExistingDoc','addParticipant','removeParticipant'].forEach(name=>{const base=window[name];if(typeof base==='function')window[name]=function(...args){const out=base(...args);updateEventDirtyState();return out;};});
function setEventOrganizerType(type){const field=document.getElementById('f-event-organizer-type');if(!field)return;field.value=type;onOrganizerTypeChange();syncEventOrganizerToggle();updateEventDirtyState();}
function syncEventOrganizerToggle(){const type=_value('f-event-organizer-type')||'org';document.querySelectorAll('[data-organizer-type]').forEach(b=>b.classList.toggle('active',b.dataset.organizerType===type));}
const _onOrganizerTypeChangeBase=onOrganizerTypeChange; onOrganizerTypeChange=function(...args){const out=_onOrganizerTypeChangeBase(...args);syncEventOrganizerToggle();return out;};
function openRepeatModal(){const card=document.getElementById('event-repeat-card');if(!card)return;card.classList.toggle('open');document.getElementById('event-repeat-btn')?.setAttribute('aria-expanded',String(card.classList.contains('open')));if(card.classList.contains('open'))scheduleRepeatPreview();}
function closeRepeatModal(){const card=document.getElementById('event-repeat-card');if(!card)return;card.classList.add('closing');document.getElementById('event-repeat-btn')?.setAttribute('aria-expanded','false');window.setTimeout(()=>{card.classList.remove('open');card.classList.remove('closing');},260);}
function deleteRepeatModal(){switchRepeatType('once');}
function saveRepeatModal(){updateRepeatSummary();closeRepeatModal();updateEventDirtyState();}
function switchRepeatType(type){const active=type!=='once';document.getElementById('event-repeat-active').value=String(active);document.getElementById('event-repeat-type').value=type;document.querySelectorAll('#event-repeat-card .evt-repeat-type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===type));['daily','weekly','monthly'].forEach(t=>{const el=document.getElementById(`repeat-panel-${t}`);if(!el)return;const show=type===t;el.classList.toggle('is-hidden',!show);el.setAttribute('aria-hidden',String(!show));});updateRepeatSummary();scheduleRepeatPreview();updateEventDirtyState();}
function toggleRepeatWeekday(btn){btn.classList.toggle('active');onRepeatRuleChange();}
function onRepeatDailyModeChange(){const mode=document.querySelector('input[name="repeat-daily-mode"]:checked')?.value;const input=document.getElementById('repeat-daily-interval');if(input)input.disabled=mode!=='interval';onRepeatRuleChange();}
function onRepeatRuleChange(){updateRepeatSummary();scheduleRepeatPreview();updateEventDirtyState();}
function _getRepeatData(){if(_value('event-repeat-active')!=='true')return null;const type=_value('event-repeat-type');const until=_value('event-repeat-until')||null;if(type==='daily'){const mode=document.querySelector('input[name="repeat-daily-mode"]:checked')?.value;if(mode==='workdays')return{freq:'weekly',interval_val:1,by_day:['mon','tue','wed','thu','fri'],until};return{freq:'daily',interval_val:Math.max(1,Number(_value('repeat-daily-interval'))||1),by_day:[],until};}if(type==='weekly'){return{freq:'weekly',interval_val:Math.max(1,Number(_value('repeat-weekly-interval'))||1),by_day:[...document.querySelectorAll('#repeat-weekday-row .evt-wd-btn.active')].map(b=>b.dataset.day),until};}if(type==='monthly')return{freq:'monthly',interval_val:Math.max(1,Number(_value('repeat-monthly-interval'))||1),by_day:[],until};return null;}
function updateRepeatSummary(){const label=document.getElementById('event-repeat-label');const data=_getRepeatData();if(!label)return;if(!data){label.textContent='Один раз';return;}const days={mon:'Пн',tue:'Вт',wed:'Ср',thu:'Чт',fri:'Пт',sat:'Сб',sun:'Вс'};if(data.freq==='weekly'&&data.interval_val===1&&data.by_day.length===5&&['mon','tue','wed','thu','fri'].every(d=>data.by_day.includes(d))){label.textContent='Рабочие дни';return;}if(data.freq==='daily')label.textContent=data.interval_val===1?'Ежедневно':`Каждые ${data.interval_val} дн.`;else if(data.freq==='weekly')label.textContent=`Каждую ${data.interval_val} нед. (${data.by_day.map(d=>days[d]).join(', ')||'день события'})`;else label.textContent=`Каждые ${data.interval_val} мес.`;}
function _setRepeatUI(series){document.querySelectorAll('#repeat-weekday-row .evt-wd-btn').forEach(b=>b.classList.remove('active'));document.getElementById('event-repeat-until').value=series?.until||'';if(!series){document.querySelector('input[name="repeat-daily-mode"][value="interval"]').checked=true;document.getElementById('repeat-daily-interval').value='1';switchRepeatType('once');return;}const by=series.by_day||[];let type=series.freq;if(series.freq==='weekly'&&series.interval_val===1&&by.length===5&&['mon','tue','wed','thu','fri'].every(d=>by.includes(d))){type='daily';document.querySelector('input[name="repeat-daily-mode"][value="workdays"]').checked=true;}else if(type==='daily'){document.querySelector('input[name="repeat-daily-mode"][value="interval"]').checked=true;document.getElementById('repeat-daily-interval').value=series.interval_val||1;}else if(type==='weekly'){document.getElementById('repeat-weekly-interval').value=series.interval_val||1;document.querySelectorAll('#repeat-weekday-row .evt-wd-btn').forEach(b=>b.classList.toggle('active',by.includes(b.dataset.day)));}else if(type==='monthly'){document.getElementById('repeat-monthly-interval').value=series.interval_val||1;}switchRepeatType(type);}
function scheduleRepeatPreview(){clearTimeout(_repeatPreviewTimer);_repeatPreviewTimer=setTimeout(loadRepeatPreview,220);}
async function loadRepeatPreview(){
    const box=document.getElementById('event-repeat-preview-dates'),
          more=document.getElementById('event-repeat-preview-more'),
          data=_getRepeatData(),
          baseDate=_value('f-event-date');
    if(!box) return;

    const setEmpty=(txt)=>{
        box.classList.remove('loading','swapping');
        box.innerHTML=`<span class="em-repeat-preview-empty">${txt}</span>`;
        if(more) more.textContent='';
    };

    if(!data||!baseDate){
        setEmpty('Повтор отключён');
        return;
    }

    if(_repeatPreviewController) _repeatPreviewController.abort();
    _repeatPreviewController=new AbortController();

    // Do not clear preview grid (prevents layout jump). Just mark loading.
    box.classList.add('loading');

    try{
        const res=await fetch(`${BASE_URL}/admin/api/events/series/preview`,{
            method:'POST',
            credentials:'same-origin',
            headers:{'Content-Type':'application/json','X-CSRF-Token':getCsrfToken()},
            body:JSON.stringify({...data,base_date:baseDate}),
            signal:_repeatPreviewController.signal
        });
        const payload=await res.json();
        if(!res.ok||!payload.ok) throw new Error(payload.error||'preview');

        const time=_value('f-event-time');

        // Small fade swap to avoid visible delete→add
        box.classList.add('swapping');
        window.setTimeout(()=>{
            box.classList.remove('swapping');
            box.classList.remove('loading');

            if(payload.dates && payload.dates.length){
                box.innerHTML = payload.dates.map(value=>{
                    const d=new Date(`${value}T12:00:00`);
                    const text=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
                    return `<span class="em-repeat-date"><strong>${text}</strong>${time||'—'}</span>`;
                }).join('');
            } else {
                box.innerHTML='<span class="em-repeat-preview-empty">Нет событий в выбранном периоде</span>';
            }

            if(more){
                more.textContent = payload.total>payload.dates.length ? `ещё ${payload.total-payload.dates.length}${payload.truncated?' в пределах года':''}` : '';
            }
        }, 110);
    } catch(err){
        if(err.name==='AbortError') return;
        setEmpty('Не удалось рассчитать даты');
    }
}
window.addEventListener('beforeunload',e=>{if(document.getElementById('event-modal')?.classList.contains('show')&&hasEventFormChanges()){e.preventDefault();e.returnValue='';}});
