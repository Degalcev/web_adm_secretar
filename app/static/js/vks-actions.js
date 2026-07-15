// ─── VKS: Действия ─────────────────────────────────────────────────────

function toggleEventComplete() {
    if (!editingEventId) return;
    const cb = document.getElementById('f-event-completed');
    cb.checked = !cb.checked;
    const btn = document.getElementById('event-modal-complete-btn');
    const statusEl = document.getElementById('event-modal-status');
    const pillLabel = btn.querySelector('.pill-label');
    const accent = document.getElementById('event-modal-accent');
    if (cb.checked) {
        btn.classList.add('active');
        if (pillLabel) pillLabel.textContent = 'Завершено';
        statusEl.className = 'modal-event-status status-completed';
        statusEl.innerHTML = '<span class="status-dot"></span>Завершено';
        accent.className = 'event-modal-accent status-completed';
    } else {
        btn.classList.remove('active');
        if (pillLabel) pillLabel.textContent = 'Завершить';
        const e = _currentEvent;
        const today = localDateStr(new Date());
        if (!e || !e.date || e.date < today) {
            statusEl.className = 'modal-event-status status-missed';
            statusEl.innerHTML = '<span class="status-dot"></span>Пропущено';
            accent.className = 'event-modal-accent status-missed';
        } else {
            statusEl.className = 'modal-event-status status-active';
            statusEl.innerHTML = '<span class="status-dot"></span>В работе';
            accent.className = 'event-modal-accent';
        }
    }
}

function confirmDeleteFromModal() {
    if (!editingEventId) return;
    const e = _currentEvent;
    const desc = e ? (e.description || 'без описания') : '';
    ConfirmManager.open('event', editingEventId, desc, deleteEvent);
}

function confirmCompleteEvent(id, checked) {
    try {
        const action = checked ? 'завершить' : 'снять завершение с';
        document.getElementById('confirm-text').textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} событие?`;
        document.getElementById('confirm-actions').innerHTML = `
            <button class="btn btn-ghost" id="confirm-cancel-btn">Отмена</button>
            <button class="btn btn-primary" id="confirm-ok-btn">Подтвердить</button>
        `;
        document.getElementById('confirm-cancel-btn').onclick = closeConfirm;
        document.getElementById('confirm-ok-btn').onclick = async function () {
            this.disabled = true;
            const cancelBtn = document.getElementById('confirm-cancel-btn');
            cancelBtn.disabled = true;
            cancelBtn.style.pointerEvents = 'none';
            cancelBtn.style.opacity = '0.5';
            // Спиннер вместо иконки + текст
            const overlay = document.getElementById('confirm-overlay');
            overlay.querySelector('.confirm-icon').innerHTML = '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
            overlay.querySelector('h3').textContent = 'Выполняю...';
            overlay.querySelector('p').textContent = '';
            await completeEvent(id, checked);
            closeConfirm();
        };
        // Меняем заголовок и иконку
        const overlay = document.getElementById('confirm-overlay');
        const icon = overlay.querySelector('.confirm-icon');
        const title = overlay.querySelector('h3');
        const origIconHTML = icon.innerHTML;
        const origTitle = title.textContent;
        icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>';
        icon.style.background = 'rgba(74, 222, 128, 0.1)';
        icon.style.color = 'var(--success)';
        title.textContent = checked ? 'Завершить ВКС?' : 'Снять завершение?';
        overlay.classList.add('show');
        // Восстановить при закрытии
        const observer = new MutationObserver(() => {
            if (!overlay.classList.contains('show')) {
                icon.innerHTML = origIconHTML;
                icon.style.background = '';
                icon.style.color = '';
                title.textContent = origTitle;
                observer.disconnect();
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    } catch (err) {
        console.error('[VKS] confirmCompleteEvent error:', err);
        completeEvent(id, checked);
    }
}

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
            renderVksBoard('vks-board-active', 'active');
            renderVksBoard('vks-board-completed', 'completed');
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
            renderVksBoard('vks-board-active', 'active');
            renderVksBoard('vks-board-completed', 'completed');
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
