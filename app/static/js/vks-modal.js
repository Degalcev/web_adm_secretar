// ─── VKS: Модалка ──────────────────────────────────────────────────────

let isLockedByOther = false;

async function openAddEventModal() {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    editingEventId = null;
    pendingFiles = [];
    removedDocIds = [];
    document.getElementById('event-modal-title').textContent = 'Добавить ВКС';
    document.getElementById('event-modal-actions').style.display = 'none';
    document.getElementById('f-event-completed').checked = false;
    // Скрыть элементы режима редактирования
    document.getElementById('event-modal-status').style.display = 'none';
    document.getElementById('event-modal-delete-btn').style.display = 'none';
    document.getElementById('event-modal-audit-btn').style.display = 'none';
    document.getElementById('event-modal-complete-btn').style.display = 'none';
    document.getElementById('event-modal-audit').style.display = 'none';
    document.getElementById('event-url-go').style.display = 'none';
    // Accent bar — по умолчанию
    const accent = document.getElementById('vks-modal-accent');
    accent.className = 'vks-modal-accent';
    const now = new Date();
    document.getElementById('f-event-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    document.getElementById('f-event-time').value = '';
    document.getElementById('f-event-url').value = '';
    document.getElementById('f-event-desc').value = '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = '';
    document.getElementById('f-event-location').value = '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();
    document.getElementById('event-modal').classList.add('show');
}

async function openEditEventModal(id) {
    if (window._vksModalLoaded) await window._vksModalLoaded;
    const e = store.allEvents.find(x => x.id === id);
    if (!e) return;
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
    } catch (err) {}
    document.getElementById('event-modal-title').textContent = 'Редактировать ВКС';

    // Показать элементы режима редактирования
    document.getElementById('event-modal-delete-btn').style.display = 'inline-flex';
    document.getElementById('event-modal-complete-btn').style.display = 'inline-flex';

    // Accent bar — цвет по статусу
    const accent = document.getElementById('vks-modal-accent');
    const today = localDateStr(new Date());
    if (e.completed) {
        accent.className = 'vks-modal-accent status-completed';
    } else if (!e.date || e.date < today) {
        accent.className = 'vks-modal-accent status-missed';
    } else {
        accent.className = 'vks-modal-accent';
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
    document.getElementById('f-event-url').value = e.url || '';
    document.getElementById('f-event-desc').value = e.description || '';
    await loadEventSelects();
    document.getElementById('f-event-organizer').value = e.organizer_id || '';
    document.getElementById('f-event-location').value = e.location_id || '';
    document.getElementById('f-event-docs-group').style.display = 'block';
    document.getElementById('event-doc-upload').value = '';
    refreshEventDocs();

    // Кнопка «Перейти» — показать если есть URL
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
    const lockInfo = document.getElementById('event-modal-lock-info');
    const lockText = document.getElementById('event-modal-lock-text');
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
    formData.append('organizer_id', organizer);
    formData.append('location_id', location);
    formData.append('url', document.getElementById('f-event-url').value.trim());
    formData.append('description', document.getElementById('f-event-desc').value.trim());
    formData.append('completed', document.getElementById('f-event-completed').checked ? 'true' : 'false');
    formData.append('csrf_token', csrfToken);

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
            closeEventModal();
            showToast(wasEditing ? 'ВКС обновлено' : 'ВКС добавлено', 'success');
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
    const body = document.querySelector('.vks-modal-flat .modal-body');
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
        const wrapper = container.closest('.vks-modal-body-wrapper') || document.querySelector('.vks-modal-body-wrapper');
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
        const wrapper = document.querySelector('.vks-modal-body-wrapper');
        if (wrapper) wrapper.classList.remove('timeline-dimmed');
    }
}
