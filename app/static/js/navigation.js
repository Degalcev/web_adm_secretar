// ─── Навигация ───────────────────────────────────────────────────────

let currentPage = 'users';

function toggleGroup(header) {
    const group = header.parentElement;
    group.classList.toggle('open');
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
    if (page === 'vks') loadEvents();
}
