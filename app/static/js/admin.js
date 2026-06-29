const BASE_URL = window.location.origin;

let allUsers    = [];
let editingId   = null;
let deletingId  = null;
let searchTimer = null;
let logAutoRefreshTimer = null;
let logAutoRefreshEnabled = false;
let lastLogLines = 0;
let lastLogFilename = '';
let lastTotalLines = 0;
let userScrolledUp = false;

// ─── Авторизация ──────────────────────────────────────────────────────────
async function login() {
    const maxId    = document.getElementById('login-max-id').value;
    const password = document.getElementById('login-password').value;
    const err      = document.getElementById('login-error');
    err.style.display = 'none';

    if (!maxId || !password) {
        err.textContent = 'Введите MAX ID и пароль';
        err.style.display = 'block';
        return;
    }

    const resp = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({max_id: parseInt(maxId), password})
    });
    const data = await resp.json();

    if (data.ok) {
        showMain();
    } else {
        err.textContent = data.error || 'Неверный логин или пароль';
        err.style.display = 'block';
    }
}

async function logout() {
    await fetch(`${BASE_URL}/admin/logout`, {method: 'POST'});
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
});
document.getElementById('login-max-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
});

// ─── Инициализация ────────────────────────────────────────────────────────
async function showMain() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display  = 'flex';
    await loadUsers();
    await loadLogDates();
}

async function checkAuth() {
    try {
        if (window.WebApp && window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user) {
            const maxId = window.WebApp.initDataUnsafe.user.user_id;
            if (maxId) {
                document.getElementById('login-max-id').value = maxId;
            }
        }
    } catch (e) {}

    const resp = await fetch(`${BASE_URL}/admin/api/users`);
    if (resp.status === 200) {
        showMain();
    }
}

// ─── Табы ─────────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    const labels = { users: 'Пользователи', logs: 'Логи', organizers: 'Организаторы', locations: 'Локации' };
    document.getElementById('topbar-tab-label').textContent = labels[tab] || tab;
    if (tab === 'logs') loadLogDates();
    if (tab === 'organizers') loadOrganizers();
    if (tab === 'locations') loadLocations();
}

function showLogin() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

// ─── Пользователи ─────────────────────────────────────────────────────────
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Загрузка...</td></tr>';

    const resp = await fetch(`${BASE_URL}/admin/api/users`);
    if (resp.status === 401) {
        document.getElementById('main-screen').style.display  = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        return;
    }
    allUsers = await resp.json();
    renderUsers(allUsers);
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Пользователей нет</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td data-label="Имя">${esc(u.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td data-label="Telegram ID" style="color:var(--muted);font-family:monospace">${u.tg_id || '—'}</td>
            <td data-label="MAX ID" style="color:var(--muted);font-family:monospace">${u.max_id || '—'}</td>
            <td data-label="Статус">
                <span class="badge ${u.status === 'admin' ? 'badge-admin' : 'badge-user'}">
                    ${u.status}
                </span>
            </td>
            <td data-label="Действия">
                <div class="actions">
                    <button class="btn-icon" onclick="openEditModal('${u.id}')">✏️ Изменить</button>
                    <button class="btn-icon danger" onclick="openConfirm('${u.id}', '${esc(u.name)}')">🗑 Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const q = document.getElementById('search').value.toLowerCase();
    const filtered = allUsers.filter(u =>
        (u.name  || '').toLowerCase().includes(q) ||
        String(u.tg_id  || '').includes(q) ||
        String(u.max_id || '').includes(q)
    );
    renderUsers(filtered);
}

// ─── Модалка ──────────────────────────────────────────────────────────────
function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent        = 'Добавить пользователя';
    document.getElementById('modal-save-btn').textContent     = 'Добавить';
    document.getElementById('f-name').value     = '';
    document.getElementById('f-tg-id').value    = '';
    document.getElementById('f-max-id').value   = '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-status').value   = 'user';
    document.getElementById('user-modal').classList.add('show');
}

function openEditModal(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    editingId = id;
    document.getElementById('modal-title').textContent    = 'Редактировать пользователя';
    document.getElementById('modal-save-btn').textContent = 'Сохранить';
    document.getElementById('f-name').value     = u.name   || '';
    document.getElementById('f-tg-id').value    = u.tg_id  || '';
    document.getElementById('f-max-id').value   = u.max_id || '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-status').value   = u.status || 'user';
    document.getElementById('user-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('user-modal').classList.remove('show');
}

async function saveUser() {
    const btn  = document.getElementById('modal-save-btn');
    btn.disabled = true;

    const tgIdValue  = document.getElementById('f-tg-id').value;
    const maxIdValue = document.getElementById('f-max-id').value;
    const password   = document.getElementById('f-password').value;

    const payload = {
        name:   document.getElementById('f-name').value.trim(),
        tg_id:  tgIdValue  ? parseInt(tgIdValue)  : null,
        max_id: maxIdValue ? parseInt(maxIdValue) : null,
        status: document.getElementById('f-status').value,
    };
    if (password) payload.password = password;

    try {
        let resp;
        if (editingId) {
            resp = await fetch(`${BASE_URL}/admin/api/users/${editingId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/users`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        }

        const data = await resp.json();
        if (data.ok) {
            closeModal();
            await loadUsers();
            showToast(editingId ? 'Пользователь обновлён' : 'Пользователь добавлен', 'success');
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети', 'error');
    }

    btn.disabled = false;
}

// ─── Удаление ─────────────────────────────────────────────────────────────
function openConfirm(id, name) {
    deletingId = id;
    document.getElementById('confirm-text').textContent = `Пользователь «${name}» будет удалён безвозвратно.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

function closeConfirm() {
    document.getElementById('confirm-overlay').classList.remove('show');
    deletingId = null;
}

async function confirmDelete() {
    if (deletingOrgId) { await confirmDeleteOrg(); return; }
    if (deletingLocId) { await confirmDeleteLoc(); return; }
    if (!deletingId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/users/${deletingId}`, {method: 'DELETE'});
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadUsers(); showToast('Пользователь удалён', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch(e) { showToast('Ошибка сети', 'error'); }
}

// ─── Организаторы ─────────────────────────────────────────────────────────
let allOrganizers = [];
let editingOrgId = null;
let deletingOrgId = null;

async function loadOrganizers() {
    const tbody = document.getElementById('organizers-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Загрузка...</td></tr>';
    const resp = await fetch(`${BASE_URL}/admin/api/organizers`);
    if (resp.status === 401) { showLogin(); return; }
    allOrganizers = await resp.json();
    renderOrganizers(allOrganizers);
}

function renderOrganizers(items) {
    const tbody = document.getElementById('organizers-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет организаторов</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(o => `
        <tr>
            <td>${esc(o.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td style="font-family:monospace;color:var(--muted)">${esc(o.short_name) || '—'}</td>
            <td style="font-family:monospace;color:var(--muted);font-size:13px">${esc(o.base_url) || '—'}</td>
            <td>
                <div class="actions">
                    <button class="btn-icon" onclick="openEditOrganizerModal('${o.id}')">✏️ Изменить</button>
                    <button class="btn-icon danger" onclick="openConfirmOrg('${o.id}','${esc(o.name)}')">🗑 Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddOrganizerModal() {
    editingOrgId = null;
    document.getElementById('org-modal-title').textContent = 'Добавить организатора';
    document.getElementById('f-org-name').value = '';
    document.getElementById('f-org-short-name').value = '';
    document.getElementById('f-org-base-url').value = '';
    document.getElementById('organizer-modal').classList.add('show');
}

function openEditOrganizerModal(id) {
    const o = allOrganizers.find(x => x.id === id);
    if (!o) return;
    editingOrgId = id;
    document.getElementById('org-modal-title').textContent = 'Редактировать организатора';
    document.getElementById('f-org-name').value = o.name || '';
    document.getElementById('f-org-short-name').value = o.short_name || '';
    document.getElementById('f-org-base-url').value = o.base_url || '';
    document.getElementById('organizer-modal').classList.add('show');
}

function closeOrganizerModal() {
    document.getElementById('organizer-modal').classList.remove('show');
}

async function saveOrganizer() {
    const btn = document.getElementById('org-modal-save-btn');
    btn.disabled = true;
    const payload = {
        name: document.getElementById('f-org-name').value.trim(),
        short_name: document.getElementById('f-org-short-name').value.trim(),
        base_url: document.getElementById('f-org-base-url').value.trim(),
    };
    try {
        let resp;
        if (editingOrgId) {
            resp = await fetch(`${BASE_URL}/admin/api/organizers/${editingOrgId}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/organizers`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) { closeOrganizerModal(); await loadOrganizers(); showToast(editingOrgId ? 'Обновлено' : 'Добавлено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch(e) { showToast('Ошибка сети', 'error'); }
    btn.disabled = false;
}

function openConfirmOrg(id, name) {
    deletingOrgId = id;
    document.getElementById('confirm-text').textContent = `Организатор «${name}» будет удалён.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

async function confirmDeleteOrg() {
    if (!deletingOrgId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/organizers/${deletingOrgId}`, {method: 'DELETE'});
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadOrganizers(); showToast('Удалено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch(e) { showToast('Ошибка сети', 'error'); }
}

// ─── Локации ───────────────────────────────────────────────────────────────
let allLocations = [];
let editingLocId = null;
let deletingLocId = null;

async function loadLocations() {
    const tbody = document.getElementById('locations-tbody');
    tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Загрузка...</td></tr>';
    const resp = await fetch(`${BASE_URL}/admin/api/locations`);
    if (resp.status === 401) { showLogin(); return; }
    allLocations = await resp.json();
    renderLocations(allLocations);
}

function renderLocations(items) {
    const tbody = document.getElementById('locations-tbody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Нет локаций</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(l => `
        <tr>
            <td>${esc(l.name) || '<span style="color:var(--muted)">—</span>'}</td>
            <td>
                <div class="actions">
                    <button class="btn-icon" onclick="openEditLocationModal('${l.id}')">✏️ Изменить</button>
                    <button class="btn-icon danger" onclick="openConfirmLoc('${l.id}','${esc(l.name)}')">🗑 Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddLocationModal() {
    editingLocId = null;
    document.getElementById('loc-modal-title').textContent = 'Добавить локацию';
    document.getElementById('f-loc-name').value = '';
    document.getElementById('location-modal').classList.add('show');
}

function openEditLocationModal(id) {
    const l = allLocations.find(x => x.id === id);
    if (!l) return;
    editingLocId = id;
    document.getElementById('loc-modal-title').textContent = 'Редактировать локацию';
    document.getElementById('f-loc-name').value = l.name || '';
    document.getElementById('location-modal').classList.add('show');
}

function closeLocationModal() {
    document.getElementById('location-modal').classList.remove('show');
}

async function saveLocation() {
    const btn = document.getElementById('loc-modal-save-btn');
    btn.disabled = true;
    const payload = { name: document.getElementById('f-loc-name').value.trim() };
    try {
        let resp;
        if (editingLocId) {
            resp = await fetch(`${BASE_URL}/admin/api/locations/${editingLocId}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        } else {
            resp = await fetch(`${BASE_URL}/admin/api/locations`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });
        }
        const data = await resp.json();
        if (data.ok) { closeLocationModal(); await loadLocations(); showToast(editingLocId ? 'Обновлено' : 'Добавлено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch(e) { showToast('Ошибка сети', 'error'); }
    btn.disabled = false;
}

function openConfirmLoc(id, name) {
    deletingLocId = id;
    document.getElementById('confirm-text').textContent = `Локация «${name}» будет удалена.`;
    document.getElementById('confirm-overlay').classList.add('show');
}

async function confirmDeleteLoc() {
    if (!deletingLocId) return;
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/locations/${deletingLocId}`, {method: 'DELETE'});
        const data = await resp.json();
        if (data.ok) { closeConfirm(); await loadLocations(); showToast('Удалено', 'success'); }
        else { showToast(data.error || 'Ошибка', 'error'); }
    } catch(e) { showToast('Ошибка сети', 'error'); }
}

// ─── Логи ─────────────────────────────────────────────────────────────────

async function loadLogDates() {
    const select = document.getElementById('log-date-select');
    try {
        const resp = await fetch(`${BASE_URL}/admin/api/logs/dates`);
        const dates = await resp.json();

        const prev = select.value;
        if (!dates.length) {
            select.innerHTML = '<option value="">Нет логов</option>';
        } else {
            select.innerHTML = dates.map(d => {
                const sources = d.sources.map(s => s === 'bot' ? 'Бот' : 'Панель').join(' + ');
                return `<option value="${d.date}">${d.date} (${sources}, ${formatSize(d.size)})</option>`;
            }).join('');
        }

        const changed = prev !== select.value;
        if (changed || !select.value) {
            lastLogFilename = '';
            lastLogLines = 0;
        }
        if (select.value) {
            loadLogContent(true);
        }
    } catch (e) {
        select.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
}

function renderLogLines(lines) {
    return lines.map(item => {
        const trimmed = item.text.trimEnd();
        let cls = 'log-line';
        if (item.source === 'bot') cls += ' source-bot';
        if (item.source === 'panel') cls += ' source-panel';
        if (trimmed.includes('| ERROR'))   cls += ' level-ERROR';
        if (trimmed.includes('| WARNING')) cls += ' level-WARNING';
        if (trimmed.includes('| INFO'))    cls += ' level-INFO';
        if (trimmed.includes('| DEBUG'))   cls += ' level-DEBUG';
        const badge = item.source === 'bot'
            ? '<span class="log-src-badge bot">БОТ</span>'
            : '<span class="log-src-badge panel">ПАН</span>';
        return `<div class="${cls}">${badge}${colorize(esc(trimmed))}</div>`;
    }).join('');
}

async function loadLogContent(forceScroll) {
    try {
        var dateVal  = document.getElementById('log-date-select').value;
        var level    = document.getElementById('log-level-filter').value;
        var lines    = document.getElementById('log-lines-count').value;
        var search   = document.getElementById('log-search').value;
        var container = document.getElementById('log-container');
        var footer    = document.getElementById('log-footer');

        if (!dateVal) return;

        var source = document.getElementById('log-source-filter').value;
        var params = new URLSearchParams({lines: lines, level: level, search: search});
        if (source) params.set('source', source);
        var resp = await fetch(BASE_URL + '/admin/api/logs/' + dateVal + '?' + params);
        var data = await resp.json();

        if (data.error) return;

        document.getElementById('stat-total').textContent   = data.stats.total;
        document.getElementById('stat-error').textContent   = data.stats.ERROR;
        document.getElementById('stat-warning').textContent = data.stats.WARNING;
        document.getElementById('stat-info').textContent    = data.stats.INFO;
        document.getElementById('stat-debug').textContent   = data.stats.DEBUG;

        if (!data.lines.length) {
            container.innerHTML = '<div class="empty-state">Нет записей</div>';
            footer.innerHTML = '';
            return;
        }

        var newCount = data.lines.length;
        var fileChanged = dateVal !== lastLogFilename;
        var isAppend = !fileChanged && !forceScroll && !search && !level;

        if (isAppend && lastTotalLines > 0 && data.total_lines > lastTotalLines) {
            var delta = data.total_lines - lastTotalLines;
            var extraLines = data.lines.slice(-delta);
            if (extraLines.length > 0) {
                container.insertAdjacentHTML('beforeend', renderLogLines(extraLines));
            }
        } else {
            container.innerHTML = renderLogLines(data.lines);
        }

        lastLogLines = newCount;
        lastTotalLines = data.total_lines;
        lastLogFilename = dateVal;

        footer.innerHTML = '<span>Показано: ' + data.lines.length + ' из ' + data.total_lines + '</span><span>' + esc(dateVal) + '</span>';

        if (forceScroll || fileChanged || !userScrolledUp) {
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error('loadLogContent error:', e);
    }
}

function onLogDateChange() {
    lastLogLines = 0;
    lastTotalLines = 0;
    lastLogFilename = '';
    userScrolledUp = false;
    loadLogContent(true);
}

function onLogRefresh() {
    lastLogLines = 0;
    lastTotalLines = 0;
    loadLogContent(true);
}

function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(onLogRefresh, 400);
}

function toggleAutoRefresh() {
    var checkbox = document.getElementById('auto-refresh-toggle');
    if (checkbox.checked) {
        logAutoRefreshTimer = setInterval(function() {
            var el = document.getElementById('log-date-select');
            if (el && el.value) {
                loadLogContent(false);
            }
        }, 5000);
    } else {
        if (logAutoRefreshTimer) clearInterval(logAutoRefreshTimer);
        logAutoRefreshTimer = null;
    }
}

function filterByLevel(level) {
    document.getElementById('log-level-filter').value = level;
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    if (level && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    lastLogLines = 0;
    loadLogContent(true);
}

function refreshLogs() {
    lastLogLines = 0;
    lastTotalLines = 0;
    loadLogContent(true);
}

// ─── Утилиты ─────────────────────────────────────────────────────────────
function esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
    t.textContent  = msg;
    t.className    = 'toast ' + type + ' show';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// ─── Слушатели ────────────────────────────────────────────────────────────
document.getElementById('confirm-overlay').addEventListener('click', function(e) {
    if (e.target === e.currentTarget) closeConfirm();
});

document.getElementById('log-container').addEventListener('scroll', function() {
    var c = document.getElementById('log-container');
    var atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 30;
    userScrolledUp = !atBottom;
});

document.getElementById('log-date-select').addEventListener('change', function() {
    lastLogLines = 0;
    lastTotalLines = 0;
    lastLogFilename = '';
    userScrolledUp = false;
    loadLogContent(true);
});

// Инициализация
checkAuth();
