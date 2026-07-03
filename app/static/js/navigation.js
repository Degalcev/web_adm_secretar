// ─── Навигация ───────────────────────────────────────────────────────

let currentPage = 'users';

function toggleGroup(header) {
    const group = header.parentElement;
    const wasOpen = group.classList.contains('open');
    group.classList.toggle('open');

    // Если группа открылась — перейти на первый пункт
    if (!wasOpen && group.classList.contains('open')) {
        const firstItem = group.querySelector('.nav-item');
        if (firstItem) {
            const href = firstItem.dataset.href;
            if (href) navigateTo(href);
        }
    }
}

function switchPage(page) {
    currentPage = page;

    // Подсветка активного пункта меню
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) {
        navItem.classList.add('active');
        // Открыть родительскую группу если закрыта
        const group = navItem.closest('.nav-group');
        if (group && !group.classList.contains('open')) {
            group.classList.add('open');
        }
    }

    // Показать нужную страницу
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    // Загрузить данные
    if (page === 'dashboard') initDashboard();
    if (page === 'profile') initProfile();
    if (page === 'users') loadUsers();
    if (page === 'organizers') loadOrganizers();
    if (page === 'locations') loadLocations();
    if (page === 'logs') loadLogDates();
    if (page === 'vks-active') loadVksActive();
    if (page === 'vks-completed') loadVksCompleted();
    if (page === 'settings') initTheme();
}
