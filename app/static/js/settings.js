// ─── Настройки ───────────────────────────────────────────────────────

const THEMES = {
    default:    { accent: '#22d3ee', ambient: '#9775fa',  bg: '#0d1117', meta: '#0d1117' },
    midnight:   { accent: '#60a5fa', ambient: '#818cf8',  bg: '#0a1628', meta: '#0a1628' },
    ember:      { accent: '#f59e0b', ambient: '#f472b6',  bg: '#140f0c', meta: '#140f0c' },
    boreal:     { accent: '#14b8a6', ambient: '#22c55e',  bg: '#0a1412', meta: '#0a1412' },
    web:        { accent: '#8577f2', ambient: '#6c52c7',  bg: '#05060a', meta: '#05060a' },
    xuiClassic: { accent: '#008771', ambient: '#3ad3ba',  bg: '#0a1222', meta: '#0a1222' },
    starWars:   { accent: '#ffe81f', ambient: '#c41e3a',  bg: '#030508', meta: '#030508' },
    vision:     { accent: '#007aff', ambient: '#ff9f0a',  bg: '#f2f2f7', meta: '#f5f5f7' },
};

function applyTheme(id) {
    const root = document.documentElement;
    root.setAttribute('data-panel-theme', id);
    root.setAttribute('data-theme', id === 'vision' ? 'light' : 'dark');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[id].meta);

    // Обновить CSS переменные
    root.style.setProperty('--accent', THEMES[id].accent);
    root.style.setProperty('--accent-ambient', THEMES[id].ambient);

    // Обновить активную карточку
    document.querySelectorAll('.theme-card').forEach(card => {
        card.classList.toggle('active', card.dataset.theme === id);
    });

    // Сохранить в localStorage
    localStorage.setItem('vks-theme', id);

    // Обновить обводку календаря (border-strong меняется с темой)
    if (typeof _calScheduleShadowUpdate === 'function') _calScheduleShadowUpdate();
}

function initTheme() {
    const saved = localStorage.getItem('vks-theme') || 'default';
    applyTheme(saved);
}

// ─── Метаданные тем для рендеринга грида ───────────────────────────────

const THEMES_META = [
    { id: 'default', name: 'Default', desc: 'Базовая тёмная тема', bg: '#0d1117,#1c2128', accent: '#22d3ee' },
    { id: 'midnight', name: 'Midnight', desc: 'Ночная синяя тема', bg: '#0a1628,#0f1f35', accent: '#60a5fa' },
    { id: 'ember', name: 'Ember', desc: 'Тёплая янтарная тема', bg: '#140f0c,#1f1814', accent: '#f59e0b' },
    { id: 'boreal', name: 'Boreal', desc: 'Бореальная зелёная тема', bg: '#0a1412,#122620', accent: '#14b8a6' },
    { id: 'web', name: 'Web', desc: 'Фиолетовая веб-тема', bg: '#05060a,#0c0f18', accent: '#8577f2' },
    { id: 'xuiClassic', name: '3x-ui Classic', desc: 'Классическая тема', bg: '#0a1222,#151f31', accent: '#008771' },
    { id: 'starWars', name: 'Star Wars', desc: 'Звёздные войны', bg: '#030508,#0a0e18', accent: '#ffe81f' },
    { id: 'vision', name: 'Vision', desc: 'Светлая тема', bg: '#f2f2f7,#ffffff', accent: '#007aff' },
];

function renderThemeGrid() {
    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    grid.innerHTML = THEMES_META.map(t => `
        <div class="theme-card" data-theme="${t.id}" onclick="applyTheme('${t.id}')">
            <div class="theme-preview" style="background: linear-gradient(135deg, ${t.bg.split(',')[0]}, ${t.bg.split(',')[1]});">
                <div class="theme-accent" style="background: ${t.accent};"></div>
            </div>
            <div class="theme-name">${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
        </div>
    `).join('');
}

renderThemeGrid();
