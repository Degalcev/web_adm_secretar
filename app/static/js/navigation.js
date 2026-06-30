// ─── Навигация ───────────────────────────────────────────────────────

let currentPage = 'users';

function toggleGroup(header) {
    const group = header.parentElement;
    const wasOpen = group.classList.contains('open');
    group.classList.toggle('open');

    // Если группа открылась и нет активного элемента — активировать первый
    if (!wasOpen && group.classList.contains('open')) {
        const firstItem = group.querySelector('.nav-item:not(.active)');
        if (firstItem) {
            const page = firstItem.dataset.page;
            if (page) switchPage(page);
        }
    }
}

function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');
    if (page === 'users') loadUsers();
    if (page === 'organizers') loadOrganizers();
    if (page === 'locations') loadLocations();
    if (page === 'logs') loadLogDates();
    if (page === 'vks-active') loadVksActive();
    if (page === 'vks-completed') loadVksCompleted();
    if (page === 'settings') initTheme();
}
