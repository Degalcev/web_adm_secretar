// ─── Клиентский роутер ───────────────────────────────────────────────

const ROUTES = {
    '/':                    { page: 'users',           title: 'Пользователи' },
    '/admin/users':         { page: 'users',           title: 'Пользователи' },
    '/admin/organizers':    { page: 'organizers',      title: 'Организаторы' },
    '/admin/locations':     { page: 'locations',       title: 'Локации' },
    '/admin/logs':          { page: 'logs',            title: 'Логи' },
    '/conferences/':        { page: 'vks-active',      title: 'Текущие ВКС' },
    '/conferences/completed/': { page: 'vks-completed', title: 'Завершённые ВКС' },
    '/settings/general/':   { page: 'settings',        title: 'Настройки' },
};

const PAGE_TO_ROUTE = {};
Object.entries(ROUTES).forEach(([path, conf]) => {
    PAGE_TO_ROUTE[conf.page] = path;
});

let currentRoute = null;

function getRouteFromURL() {
    const path = window.location.pathname;
    // Убираем trailing slash кроме корня
    const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
    // Ищем точное совпадение
    if (ROUTES[normalized]) return normalized;
    // Ищем с trailing slash
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

    document.title = `${route.title} — VKS Secretar`;
    switchPage(route.page);
}

function handlePopState() {
    const path = getRouteFromURL();
    navigateTo(path, false);
}

function initRouter() {
    // Обработка кнопок назад/вперёд
    window.addEventListener('popstate', handlePopState);

    // Обработка кликов по ссылкам с data-href
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-href]');
        if (link) {
            e.preventDefault();
            navigateTo(link.dataset.href);
        }
    });

    // Начальный роут
    const initialPath = getRouteFromURL();
    if (initialPath !== '/') {
        navigateTo(initialPath, false);
    }
}
