# Оптимизация index.html — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** Уменьшить index.html с 745 до ~400 строк, вынеся повторяющийся контент в partials/JS-генерацию, убрав инлайн-стили и SVG-спрайт.

**Architecture:** 4 задачи по фазам: Settings → SVG-спрайт → Инлайн-стили → Деплой. Каждая задача независима и тестируема.

**Tech Stack:** HTML, vanilla JS, CSS

---

### Task 1: Settings темы → JS-генерация

**Цель:** Убрать 8 одинаковых темных карточек (71 строка) из HTML, генерировать из JS-конфига.

**Files:**
- Modify: `app/static/index.html` (строки 580-651)
- Modify: `app/static/js/settings.js`

**Steps:**

- [ ] **Step 1: Добавить массив тем в settings.js**

```javascript
const THEMES = [
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
    grid.innerHTML = THEMES.map(t => `
        <div class="theme-card" data-theme="${t.id}" onclick="applyTheme('${t.id}')">
            <div class="theme-preview" style="background: linear-gradient(135deg, ${t.bg.split(',')[0]}, ${t.bg.split(',')[1]});">
                <div class="theme-accent" style="background: ${t.accent};"></div>
            </div>
            <div class="theme-name">${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
        </div>
    `).join('');
}
```

- [ ] **Step 2: Вызвать renderThemeGrid() при загрузке settings**

Добавить вызов `renderThemeGrid()` в начало функции показа страницы настроек (или в `app.js` при загрузке).

- [ ] **Step 3: Убрать темы из index.html**

Удалить содержимое `themeGrid` div (строки 593-649), оставить пустой контейнер:
```html
<div class="theme-grid" id="themeGrid"></div>
```

- [ ] **Step 4: Commit**

```bash
git add app/static/js/settings.js app/static/index.html
git commit -m "refactor: Settings темы генерируются из JS-конфига THEMES[]"
```

**Экономия:** ~60 строк HTML.

---

### Task 2: SVG-спрайт для sidebar

**Цель:** Вынести SVG-иконки sidebar в `<defs>`, уменьшить HTML.

**Files:**
- Modify: `app/static/index.html` (строки 72-123 + добавить `<defs>` в head)

**Steps:**

- [ ] **Step 1: Добавить SVG-спрайт в `<body>` перед sidebar**

```html
<!-- SVG Sprite -->
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <symbol id="icon-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </symbol>
  <symbol id="icon-monitor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </symbol>
  <symbol id="icon-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00 .73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 00 2.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00 .73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/>
  </symbol>
  <symbol id="icon-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="6 9 12 15 18 9"/>
  </symbol>
  <symbol id="icon-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </symbol>
  <symbol id="icon-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
  </symbol>
  <symbol id="icon-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </symbol>
  <symbol id="icon-map-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </symbol>
  <symbol id="icon-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </symbol>
  <symbol id="icon-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </symbol>
  <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </symbol>
  <symbol id="icon-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </symbol>
</svg>
```

- [ ] **Step 2: Заменить inline SVG в sidebar на `<use>`**

Каждый `<svg ...>...</svg>` → `<svg width="18" height="18"><use href="#icon-NAME"/></svg>`.

- [ ] **Step 3: Commit**

```bash
git add app/static/index.html
git commit -m "refactor: SVG-спрайт для sidebar иконок"
```

**Экономия:** ~150 строк.

---

### Task 3: Убрать инлайн-стили

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/css/components.css` или `layout.css`

**Steps:**

- [ ] **Step 1: Добавить CSS-классы**

```css
.btn-full-width { width: 100%; }
.section-narrow { max-width: 420px; }
.hidden { display: none; }
```

- [ ] **Step 2: Заменить инлайн-стили в HTML**

| Строка | Было | Стало |
|--------|------|-------|
| 45 | `style="width:100%"` | `class="btn btn-primary btn-full-width"` |
| 662 | `style="max-width: 420px;"` | `class="settings-section section-narrow"` |

- [ ] **Step 3: Commit**

```bash
git add app/static/index.html app/static/css/components.css
git commit -m "refactor: инлайн-стили → CSS-классы"
```

**Экономия:** ~5 строк HTML + чистота кода.

---

### Task 4: Деплой и проверка

**Steps:**

- [ ] **Step 1: git push + deploy**

```bash
git push origin develop
python deploy/deploy.py test
```

- [ ] **Step 2: Проверить на test сервере**
  - Login screen — кнопка "Войти" на всю ширину
  - Settings — все 8 тем работают
  - Sidebar — все иконки видны
  - Все страницы — ничего не сломалось

- [ ] **Step 3: Финальный коммит документации**

```bash
git add CLAUDE.md
git commit -m "docs: обновлена архитектура после оптимизации index.html"
```
