// ─── Инициализация ───────────────────────────────────────────────────

document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
});
document.getElementById('login-max-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
});

document.getElementById('confirm-overlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeConfirm();
});

document.getElementById('log-container').addEventListener('scroll', function () {
    var c = document.getElementById('log-container');
    var atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 30;
    userScrolledUp = !atBottom;
});

document.getElementById('log-date-select').addEventListener('change', function () {
    lastLogLines = 0;
    lastTotalLines = 0;
    lastLogFilename = '';
    userScrolledUp = false;
    loadLogContent(true);
});

// ─── Автообновление при смене дня ──────────────────────────────────
function _localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
let _currentDay = _localDateStr(new Date());

function _checkDayChange() {
    const today = _localDateStr(new Date());
    if (today !== _currentDay) {
        _currentDay = today;
        if (typeof loadVksActive === 'function') loadVksActive();
    }
}
setInterval(_checkDayChange, 60000);

// Запуск
initPreloader();
initTheme();
initRouter();
checkAuth();
initUpdater();
