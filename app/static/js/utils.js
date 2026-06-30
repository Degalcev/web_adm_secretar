// ─── Утилиты ─────────────────────────────────────────────────────────

function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
