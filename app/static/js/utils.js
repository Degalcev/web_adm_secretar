// ─── Утилиты ─────────────────────────────────────────────────────────

function _findScrollParent(el) {
    let node = el.parentElement;
    while (node) {
        const style = getComputedStyle(node);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return node;
        }
        node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function getOrganizerName(id) {
    const o = (store.allOrganizers || []).find(x => x.id === id);
    return o ? o.short_name || o.name : '';
}

function getLocationName(id) {
    const l = (store.allLocations || []).find(x => x.id === id);
    return l ? l.name : '';
}

function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function colorize(text) {
    return text
        .replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-timestamp">$1</span>')
        .replace(/(\| ERROR)/g, '| <span class="log-level log-level-ERROR">ERROR</span>')
        .replace(/(\| WARNING)/g, '| <span class="log-level log-level-WARNING">WARNING</span>')
        .replace(/(\| INFO)/g, '| <span class="log-level log-level-INFO">INFO</span>')
        .replace(/(\| DEBUG)/g, '| <span class="log-level log-level-DEBUG">DEBUG</span>');
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
}

const BASE_URL = window.location.origin;

// ─── Централизованное хранилище данных ────────────────────────────
const store = {
    allEvents: [],
    allLocations: [],
    allOrganizers: [],
    allUsers: [],
};

const LOCK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

function getCsrfToken() {
    return document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
}

function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_GENITIVE = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// ─── Confirm Manager ─────────────────────────────────────────────
const ConfirmManager = {
    _type: null,
    _id: null,
    _onConfirm: null,

    open(type, id, name, onConfirm) {
        this._type = type;
        this._id = id;
        this._onConfirm = onConfirm;
        const textMap = {
            user: 'Пользователь',
            organizer: 'Организатор',
            location: 'Локация',
            event: 'Событие ВКС'
        };
        const label = textMap[type] || 'Элемент';
        document.getElementById('confirm-text').textContent = `${label} «${name}» будет удалён безвозвратно.`;
        document.getElementById('confirm-overlay').classList.add('show');
    },

    close() {
        const overlay = document.getElementById('confirm-overlay');
        overlay.classList.remove('show');
        document.getElementById('confirm-actions').innerHTML = `
            <button class="btn btn-ghost" onclick="ConfirmManager.close()">Отмена</button>
            <button class="btn btn-danger" onclick="ConfirmManager.dispatch()">Удалить</button>
        `;
        const icon = overlay.querySelector('.confirm-icon');
        icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
        icon.style.background = '';
        icon.style.color = '';
        overlay.querySelector('h3').textContent = 'Подтвердите удаление';
        overlay.querySelector('p').textContent = 'Это действие нельзя отменить.';
        this._type = null;
        this._id = null;
        this._onConfirm = null;
    },

    async dispatch() {
        const overlay = document.getElementById('confirm-overlay');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        if (okBtn) {
            okBtn.disabled = true;
            okBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Выполняю...';
        }
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.style.pointerEvents = 'none';
            cancelBtn.style.opacity = '0.5';
        }
        overlay.querySelector('.confirm-icon').innerHTML = '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
        overlay.querySelector('h3').textContent = 'Выполняю...';
        overlay.querySelector('p').textContent = '';
        if (this._onConfirm) await this._onConfirm(this._id);
    }
};

// Обратная совместимость
function closeConfirm() { ConfirmManager.close(); }
function confirmDelete() { ConfirmManager.dispatch(); }

// ─── CRUD Module Factory ────────────────────────────────────────
function createCrudModule(config) {
    const { name, api, modalId, titleId, saveBtnId, fields, render, stats, filters, modalLoaded } = config;
    let editingId = null;

    return {
        get editingId() { return editingId; },
        set editingId(v) { editingId = v; },

        async load() {
            try {
                const resp = await fetch(`${BASE_URL}${api}`);
                if (resp.status === 401) { showLogin(); return; }
                const items = await resp.json();
                if (config.storeKey) store[config.storeKey] = items;
                config._items = items;
                if (render) render(items);
                if (stats) stats(items);
                return items;
            } catch (e) {
                showToast(`Ошибка загрузки ${name}`, 'error');
            }
        },

        async openAdd() {
            if (modalLoaded && window._modalsLoaded) await window._modalsLoaded;
            editingId = null;
            document.getElementById(titleId).textContent = `Добавить ${name}`;
            fields.forEach(f => { const el = document.getElementById(f.id); if (el) el.value = f.default || ''; });
            document.getElementById(modalId).classList.add('show');
        },

        async openEdit(id) {
            if (modalLoaded && window._modalsLoaded) await window._modalsLoaded;
            const items = config._items || [];
            const item = items.find(x => x.id === id);
            if (!item) return;
            editingId = id;
            document.getElementById(titleId).textContent = `Редактировать ${name}`;
            fields.forEach(f => { const el = document.getElementById(f.id); if (el) el.value = item[f.key] || ''; });
            document.getElementById(modalId).classList.add('show');
        },

        closeModal() {
            document.getElementById(modalId).classList.remove('show');
        },

        async save() {
            const btn = document.getElementById(saveBtnId);
            btn.disabled = true;
            btn.classList.add('loading');
            const origText = btn.textContent;
            btn.textContent = 'Сохранение...';
            const payload = config.buildPayload ? config.buildPayload() : (() => {
                const p = {};
                fields.forEach(f => { p[f.key] = document.getElementById(f.id).value.trim(); });
                return p;
            })();
            try {
                const csrfToken = getCsrfToken();
                const url = editingId ? `${BASE_URL}${api}/${editingId}` : `${BASE_URL}${api}`;
                const resp = await fetch(url, {
                    method: editingId ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify(payload)
                });
                const data = await resp.json();
                if (data.ok) {
                    await this.load();
                    this.closeModal();
                    const msg = config.messages
                        ? (editingId ? config.messages.updated : config.messages.created)
                        : (editingId ? 'Обновлено' : 'Добавлено');
                    showToast(msg, 'success');
                } else { showToast(data.error || 'Ошибка', 'error'); }
            } catch (e) { showToast('Ошибка сети', 'error'); }
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = origText;
        },

        async delete(id) {
            try {
                const csrfToken = getCsrfToken();
                const resp = await fetch(`${BASE_URL}${api}/${id}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken }
                });
                const data = await resp.json();
                if (data.ok) { ConfirmManager.close(); await this.load(); showToast('Удалено', 'success'); }
                else { ConfirmManager.close(); showToast(data.error || 'Ошибка', 'error'); }
            } catch (e) { ConfirmManager.close(); showToast('Ошибка сети', 'error'); }
        },

        openConfirm(id, displayName) {
            ConfirmManager.open(config.confirmType, id, displayName, (delId) => this.delete(delId));
        },

        filter() {
            if (!filters) return;
            const items = config._items || [];
            const filtered = items.filter(item => {
                return filters.every(f => {
                    const val = (document.getElementById(f.inputId)?.value || '').toLowerCase();
                    return !val || String(item[f.key] || '').toLowerCase().includes(val);
                });
            });
            if (render) render(filtered);
            if (stats && stats.shown) stats.shown(filtered);
        },

        resetFilters() {
            if (!filters) return;
            filters.forEach(f => { const el = document.getElementById(f.inputId); if (el) el.value = ''; });
            this.filter();
        }
    };
}
