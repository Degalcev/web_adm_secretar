// ─── Клиентский роутер ───────────────────────────────────────────────

const ROUTES = {
    '/':                        { page: 'login',          title: 'Вход' },
    '/panel/':                  { page: 'dashboard',      title: 'Обзор' },
    '/admin/':                  { page: 'users',          title: 'Пользователи' },
    '/admin/users/':            { page: 'users',          title: 'Пользователи' },
    '/admin/organizers/':       { page: 'organizers',     title: 'Организаторы' },
    '/admin/locations/':        { page: 'locations',      title: 'Локации' },
    '/admin/logs/':             { page: 'logs',           title: 'Логи' },
    '/conferences/':            { page: 'vks-active',     title: 'Текущие ВКС' },
    '/conferences/completed/':  { page: 'vks-completed',  title: 'Завершённые ВКС' },
    '/settings/general/':       { page: 'settings',       title: 'Настройки' },
    '/settings/profile/':       { page: 'profile',        title: 'Пользователь' },
};

const PAGE_TO_ROUTE = {};
Object.entries(ROUTES).forEach(([path, conf]) => {
    if (conf.page !== 'login' && !PAGE_TO_ROUTE[conf.page]) {
        PAGE_TO_ROUTE[conf.page] = path;
    }
});

let currentRoute = null;
let routerInitialized = false;

function getRouteFromURL() {
    const path = window.location.pathname;
    const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTES[normalized]) return normalized;
    if (ROUTES[normalized + '/']) return normalized + '/';
    return '/';
}

function navigateTo(path, pushState = true) {
    const route = ROUTES[path];
    if (!route) return;

    currentRoute = path;

    if (pushState) {
        history.pushState({ path }, '', path);
    }

    document.title = `${route.title} — АДМ Секретарь`;

    if (route.page === 'login') {
        showLogin();
    } else {
        showMain();
        switchPage(route.page);
    }
}

function handlePopState() {
    const path = getRouteFromURL();
    if (path !== '/' && !isAuthenticated) {
        navigateTo('/', false);
        return;
    }
    navigateTo(path, false);
}

function initRouter() {
    if (routerInitialized) return;
    routerInitialized = true;

    window.addEventListener('popstate', handlePopState);

    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-href]');
        if (link) {
            e.preventDefault();
            navigateTo(link.dataset.href);
        }
    });

    // Начальный роут (если не логин)
    const initialPath = getRouteFromURL();
    if (initialPath !== '/') {
        navigateTo(initialPath, false);
    }
}
