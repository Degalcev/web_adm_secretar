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
initTheme();
initRouter();
checkAuth();
initUpdater();
initSSE();

// ─── Кнопка «Наверх» ─────────────────────────────────────────────
(function () {
    const btn = document.getElementById('scroll-top-btn');
    if (!btn) return;

    function getScrollContainer() {
        return document.querySelector('.page.active') || document.querySelector('.content-area');
    }

    // Слушаем скролл на активной странице (capture для всплытия)
    document.addEventListener('scroll', function (e) {
        const container = getScrollContainer();
        if (e.target === container) {
            if (container.scrollTop > 300) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        }
    }, true);

    btn.addEventListener('click', function () {
        const container = getScrollContainer();
        container.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();
