// ─── Инициализация ───────────────────────────────────────────────────

// Загрузка всех модалок из partials
window._modalsLoaded = new Promise((resolve) => {
    async function _loadModals() {
        try {
            const files = [
                '/static/partials/event-modal.html',
                '/static/partials/user-modal.html',
                '/static/partials/organizer-modal.html',
                '/static/partials/location-modal.html'
            ];
            for (const url of files) {
                const resp = await fetch(url + '?v=' + (window.__VERSION || ''));
                const html = await resp.text();
                document.body.insertAdjacentHTML('beforeend', html);
            }
            resolve();
        } catch (e) {
            console.error('Failed to load modals:', e);
            resolve();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _loadModals);
    } else {
        _loadModals();
    }
});

// Обратная совместимость с VKS modal
window._vksModalLoaded = window._modalsLoaded;

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
let _currentDay = localDateStr(new Date());

function _checkDayChange() {
    const today = localDateStr(new Date());
    if (today !== _currentDay) {
        _currentDay = today;
        // Обновляем все активные страницы при смене дня
        if (typeof loadVksActive === 'function') loadVksActive();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof eventsRenderBoard === 'function') eventsRenderBoard();
        // Обновляем календарь если он открыт
        if (typeof renderCalendar === 'function') {
            calWeekStart = getMonday(new Date());
            calActiveDay = new Date();
            renderCalendar(true);
        }
    }
}
setInterval(_checkDayChange, 60000);

// Запуск
initTheme();
initPreloader();
initRouter();
checkAuth().then(() => {
    initUpdater();
    initSSE();
});

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
