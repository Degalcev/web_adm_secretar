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

    // Проверка прав: non-admin не может зайти в Администрирование
    if (window.currentUserRole !== 'admin') {
        const adminPages = ['users', 'organizers', 'locations', 'logs'];
        if (adminPages.includes(page)) {
            navigateTo('/panel/');
            return;
        }
    }

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

    // Обновить видимость кнопки «Наверх»
    const scrollBtn = document.getElementById('scroll-top-btn');
    if (scrollBtn && pageEl) {
        if (pageEl.scrollTop > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    }

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
    if (page === 'calendar') initCalendar();
}

// ─── Mobile Menu ──────────────────────────────────────────────────
function toggleMobileMenu() {
    const overlay = document.getElementById('mobile-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    if (overlay.classList.contains('show')) {
        closeMobileMenu();
    } else {
        // Копировать навигацию из основного sidebar
        const nav = document.getElementById('mobile-nav');
        const originalNav = document.querySelector('.sidebar-nav');
        if (nav && originalNav) {
            nav.innerHTML = originalNav.innerHTML;
            // Навесить обработчики на скопированные элементы
            nav.querySelectorAll('.nav-group-header').forEach(h => {
                h.setAttribute('onclick', 'toggleGroup(this)');
            });
            nav.querySelectorAll('.nav-item[data-page]').forEach(item => {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    const href = this.dataset.href;
                    if (href) navigateTo(href);
                    closeMobileMenu();
                });
            });
            nav.querySelectorAll('.nav-logout').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    closeMobileMenu();
                    logout();
                });
            });
        }
        overlay.classList.add('show');
        sidebar.classList.add('open');
        document.body.style.overflow = 'hidden';
        // Применить ограничения ролей к скопированным элементам
        applyRoleRestrictions(nav);
    }
}

function closeMobileMenu() {
    const overlay = document.getElementById('mobile-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    overlay.classList.remove('show');
    sidebar.classList.remove('open');
    document.body.style.overflow = '';
}

// ─── Role Restrictions ────────────────────────────────────────────
function applyRoleRestrictions(container) {
    const root = container || document;
    const isAdmin = window.currentUserRole === 'admin';

    root.querySelectorAll('.nav-group').forEach(group => {
        const header = group.querySelector('.nav-group-header');
        if (header) {
            const text = header.textContent || '';
            if (text.includes('Администрирование')) {
                group.style.display = isAdmin ? '' : 'none';
            }
        }
    });
}

// ─── Filter Toggle (mobile) ──────────────────────────────────────
function toggleFilter(bar) {
    bar.classList.toggle('collapsed');
    const btn = bar.querySelector('.filter-toggle');
    if (btn) btn.classList.toggle('open');
}
