// ─── VKS: Действия ─────────────────────────────────────────────────────

function toggleEventComplete() {
    if (!editingEventId) return;
    const cb = document.getElementById('f-event-completed');
    cb.checked = !cb.checked;
    const checked = cb.checked;

    // Проверить серию — показать подтверждение
    const e = _currentEvent;
    if (_isSeriesEvent(e)) {
        const skipDate = e._nextDate || e.date;
        const action = checked ? 'завершить' : 'снять завершение с';
        _showSeriesConfirm(
            `${action.charAt(0).toUpperCase() + action.slice(1)} событие?`,
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>',
            'rgba(74,222,128,0.1)', 'var(--success)',
            // Только это
            async () => {
                if (checked) {
                    // Завершить только эту дату → skip exception
                    await _addSeriesException(editingEventId, skipDate, 'skip');
                } else {
                    // Снять завершение только с этой даты → unskip exception
                    await _addSeriesException(editingEventId, skipDate, 'unskip');
                }
                closeEventModal();
            },
            // Вся серия
            async () => { await saveEvent(); }
        );
        return;
    }

    // Без серии — обычное сохранение
    const btn = document.getElementById('event-modal-complete-btn');
    const statusEl = document.getElementById('event-modal-status');
    const accent = document.getElementById('event-modal-accent');
    if (checked) {
        btn.classList.add('done');
        btn.textContent = '✓ Завершено';
        statusEl.className = 'status-dot done';
        accent.className = 'accent-bar green';
    } else {
        btn.classList.remove('done');
        btn.textContent = '✓ Завершить';
        const today = localDateStr(new Date());
        if (!e || !e.date || e.date < today) {
            statusEl.className = 'status-dot missed';
            accent.className = 'accent-bar red';
        } else {
            statusEl.className = 'status-dot';
            accent.className = 'accent-bar';
        }
    }
    saveEvent();
}

// ─── Подтверждение для серий ──────────────────────────────────────────

function _isSeriesEvent(event) {
    return event && event.series_id && event.series;
}

function _getSkipDate(event) {
    // Дата для исключения: _nextDate (из expandSeriesForList) или оригинальная дата
    return event._nextDate || event.date;
}

// Показать подтверждение с выбором "Только это / Вся серия" для серийных событий
function _showSeriesConfirm(title, iconHtml, iconBg, iconColor, onThisEvent, onAllEvents) {
    const overlay = document.getElementById('confirm-overlay');
    const icon = overlay.querySelector('.confirm-icon');
    const h3 = overlay.querySelector('h3');
    const p = overlay.querySelector('p');

    const origIcon = icon.innerHTML;
    const origBg = icon.style.background;
    const origColor = icon.style.color;
    const origTitle = h3.textContent;
    const origP = p ? p.textContent : '';

    icon.innerHTML = iconHtml;
    icon.style.background = iconBg;
    icon.style.color = iconColor;
    h3.textContent = title;
    if (p) p.textContent = 'Это повторяющееся событие';

    document.getElementById('confirm-actions').innerHTML = `
        <button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>
        <button class="btn" id="confirm-this-btn" style="border-color:var(--border)">Только это</button>
        <button class="btn btn-primary" id="confirm-all-btn">Вся серия</button>
    `;

    document.getElementById('confirm-cancel-btn').onclick = () => {
        _restoreConfirmOverlay(overlay, icon, h3, p, origIcon, origBg, origColor, origTitle, origP);
        closeConfirm();
    };
    document.getElementById('confirm-this-btn').onclick = async function () {
        this.disabled = true;
        document.getElementById('confirm-all-btn').disabled = true;
        await onThisEvent();
        _restoreConfirmOverlay(overlay, icon, h3, p, origIcon, origBg, origColor, origTitle, origP);
        closeConfirm();
    };
    document.getElementById('confirm-all-btn').onclick = async function () {
        this.disabled = true;
        document.getElementById('confirm-this-btn').disabled = true;
        await onAllEvents();
        _restoreConfirmOverlay(overlay, icon, h3, p, origIcon, origBg, origColor, origTitle, origP);
        closeConfirm();
    };

    overlay.classList.add('show');
}

function _restoreConfirmOverlay(overlay, icon, h3, p, origIcon, origBg, origColor, origTitle, origP) {
    icon.innerHTML = origIcon;
    icon.style.background = origBg;
    icon.style.color = origColor;
    h3.textContent = origTitle;
    if (p) p.textContent = origP;
}

// ─── Завершение ────────────────────────────────────────────────────────

function confirmDeleteFromModal() {
    if (!editingEventId) return;
    const e = _currentEvent;
    const desc = e ? (e.description || 'без описания') : '';

    if (_isSeriesEvent(e)) {
        const skipDate = _getSkipDate(e);
        _showSeriesConfirm(
            'Удалить событие?',
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
            'rgba(248,113,113,0.1)', 'var(--danger)',
            // Только это — пропустить дату
            async () => { await _addSeriesException(editingEventId, skipDate, 'skip'); },
            // Вся серия — удалить
            () => { deleteEvent(editingEventId); }
        );
    } else {
        ConfirmManager.open('event', editingEventId, desc, deleteEvent);
    }
}

function confirmCompleteEvent(id, checked) {
    try {
        // Найти событие для проверки series_id
        const cacheKeys = ['vksActive', 'eventsActive'];
        let event = null;
        for (const key of cacheKeys) {
            const cached = cacheGet(key);
            if (cached?.data?.events) {
                event = cached.data.events.find(e => e.id === id);
                if (event) break;
            }
        }

        if (_isSeriesEvent(event)) {
            const skipDate = event._nextDate || event.date;
            const action = checked ? 'завершить' : 'снять завершение с';
            _showSeriesConfirm(
                `${action.charAt(0).toUpperCase() + action.slice(1)} событие?`,
                '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>',
                'rgba(74,222,128,0.1)', 'var(--success)',
                // Только это
                async () => {
                    if (checked) {
                        await _addSeriesException(id, skipDate, 'skip');
                    } else {
                        await _addSeriesException(id, skipDate, 'unskip');
                    }
                },
                // Вся серия — завершить
                () => { completeEvent(id, checked); }
            );
        } else {
            // Обычное подтверждение
            const action = checked ? 'завершить' : 'снять завершение с';
            document.getElementById('confirm-text').textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} событие?`;
            document.getElementById('confirm-actions').innerHTML = `
                <button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>
                <button class="btn btn-primary" id="confirm-ok-btn">Подтвердить</button>
            `;
            document.getElementById('confirm-cancel-btn').onclick = closeConfirm;
            document.getElementById('confirm-ok-btn').onclick = async function () {
                this.disabled = true;
                document.getElementById('confirm-cancel-btn').disabled = true;
                await completeEvent(id, checked);
                closeConfirm();
            };
            const overlay = document.getElementById('confirm-overlay');
            const icon = overlay.querySelector('.confirm-icon');
            const title = overlay.querySelector('h3');
            icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>';
            icon.style.background = 'rgba(74, 222, 128, 0.1)';
            icon.style.color = 'var(--success)';
            title.textContent = checked ? 'Завершить ВКС?' : 'Снять завершение?';
            overlay.classList.add('show');
        }
    } catch (err) {
        console.error('[VKS] confirmCompleteEvent error:', err);
        completeEvent(id, checked);
    }
}

// ─── Исключения серий ──────────────────────────────────────────────────

async function _addSeriesException(eventId, date, action) {
    const csrfToken = getCsrfToken();
    try {
        let resp;
        if (action === 'unskip') {
            // Удалить исключение
            resp = await fetch(`${BASE_URL}/admin/api/events/${eventId}/series/exception`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ original_date: date })
            });
        } else {
            // Добавить исключение (skip)
            resp = await fetch(`${BASE_URL}/admin/api/events/${eventId}/series/exception`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ original_date: date, action })
            });
        }
        const data = await resp.json();
        if (data.ok) {
            cacheInvalidate('vksActive');
            cacheInvalidate('eventsActive');
            cacheInvalidate('calendar');
            showToast(action === 'skip' ? 'Дата пропущена' : 'Дата восстановлена', 'success');
            if (typeof renderVksBoard === 'function') {
                renderVksBoard('vks-board-active', 'active', true);
                renderVksBoard('vks-board-completed', 'completed', true);
            }
            if (typeof eventsRenderBoard === 'function') eventsRenderBoard();
            if (typeof renderCalendar === 'function') renderCalendar(false);
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
            if (typeof eventsRenderBoard === 'function') eventsRenderBoard();
            if (typeof renderCalendar === 'function') renderCalendar(false);
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

// ─── Оригинальные функции ──────────────────────────────────────────────

async function completeEvent(id, checked) {
    const csrfToken = getCsrfToken();
    try {
        const formData = new FormData();
        formData.append('completed', checked ? 'true' : 'false');
        formData.append('csrf_token', csrfToken);
        const resp = await fetch(`${BASE_URL}/admin/api/events/${id}`, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken },
            body: formData
        });
        const data = await resp.json();
        if (data.ok) {
            renderVksBoard('vks-board-active', 'active', true);
            renderVksBoard('vks-board-completed', 'completed', true);
            if (document.getElementById('page-dashboard')?.classList.contains('active')) {
                renderDashboard();
            }
            showToast(checked ? 'ВКС завершено' : 'ВКС восстановлено', 'success');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

function openConfirmEvent(id) {
    ConfirmManager.open('event', id, 'Событие ВКС', deleteEvent);
}

async function deleteEvent(id) {
    const csrfToken = getCsrfToken();
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/events/${id}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrfToken }
        });
        const data = await resp.json();
        if (data.ok) {
            renderVksBoard('vks-board-active', 'active', true);
            renderVksBoard('vks-board-completed', 'completed', true);
            if (document.getElementById('page-dashboard')?.classList.contains('active')) {
                renderDashboard();
            }
            ConfirmManager.close();
            closeEventModal();
            showToast('Удалено', 'success');
        } else {
            ConfirmManager.close();
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) { showToast('Ошибка сети', 'error'); }
}
