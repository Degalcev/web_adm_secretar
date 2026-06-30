// ─── Логи ────────────────────────────────────────────────────────────

let searchTimer = null;
let logAutoRefreshTimer = null;
let lastLogLines = 0;
let lastLogFilename = '';
let lastTotalLines = 0;
let userScrolledUp = false;

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
        if (trimmed.includes('| ERROR')) cls += ' level-ERROR';
        if (trimmed.includes('| WARNING')) cls += ' level-WARNING';
        if (trimmed.includes('| INFO')) cls += ' level-INFO';
        if (trimmed.includes('| DEBUG')) cls += ' level-DEBUG';
        const badge = item.source === 'bot'
            ? '<span class="log-src-badge bot">БОТ</span>'
            : '<span class="log-src-badge panel">ПАН</span>';
        return `<div class="${cls}">${badge}${colorize(esc(trimmed))}</div>`;
    }).join('');
}

async function loadLogContent(forceScroll) {
    try {
        var dateVal = document.getElementById('log-date-select').value;
        var level = document.getElementById('log-level-filter').value;
        var lines = document.getElementById('log-lines-count').value;
        var search = document.getElementById('log-search').value;
        var container = document.getElementById('log-container');
        var footer = document.getElementById('log-footer');

        if (!dateVal) return;

        var source = document.getElementById('log-source-filter').value;
        var params = new URLSearchParams({ lines: lines, level: level, search: search });
        if (source) params.set('source', source);
        var resp = await fetch(BASE_URL + '/admin/api/logs/' + dateVal + '?' + params);
        var data = await resp.json();

        if (data.error) return;

        document.getElementById('stat-total').textContent = data.stats.total;
        document.getElementById('stat-error').textContent = data.stats.ERROR;
        document.getElementById('stat-warning').textContent = data.stats.WARNING;
        document.getElementById('stat-info').textContent = data.stats.INFO;
        document.getElementById('stat-debug').textContent = data.stats.DEBUG;

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
        logAutoRefreshTimer = setInterval(function () {
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

function filterByLevel(level, event) {
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
