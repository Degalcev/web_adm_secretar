# Mobile Optimization Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mobile-optimization.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оптимизировать панель администратора для мобильных устройств (<= 768px и <= 480px)

**Architecture:** Добавить гамбургер-меню в topbar, горизонтальный скролл для таблиц, адаптивные фильтры/формы/карточки. Все изменения в медиа-запросах — desktop версия не затрагивается.

**Tech Stack:** CSS media queries, vanilla JS

## Global Constraints

- Все изменения ТОЛЬКО в медиа-запросах — desktop не трогаем
- Два брейкпоинта: `max-width: 768px` (планшет) и `max-width: 480px` (мобильный)
- Язык: русский для коммитов и сообщений
- Логирование: loguru (не print)
- Деплой: `develop` → test (`python deploy/deploy.py test`)

---

### Task 1: Мобильное гамбургер-меню

**Covers:** [S3]

**Files:**
- Modify: `app/static/index.html` — добавить кнопку `.mobile-menu-btn` в topbar
- Modify: `app/static/css/responsive.css` — стили overlay и кнопки
- Modify: `app/static/js/navigation.js` — логика открытия/закрытия

**Interfaces:**
- Consumes: `switchPage()` из navigation.js, `toggleGroup()` из navigation.js
- Produces: `openMobileMenu()`, `closeMobileMenu()` функции в navigation.js

- [ ] **Step 1: Добавить кнопку-гамбургер в HTML**

В `app/static/index.html`, в блок `.topbar-left` (после `.topbar-badge`), добавить кнопку:

```html
<button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Меню">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>
```

- [ ] **Step 2: Добавить стили в responsive.css**

В `app/static/css/responsive.css` добавить:

```css
/* ─── Mobile Menu Button ────────────────────────────────────────── */
.mobile-menu-btn {
  display: none;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--fg);
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mobile-menu-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Mobile menu overlay */
.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 90;
}

.mobile-overlay.show {
  display: block;
}

.mobile-sidebar {
  position: fixed;
  top: 0;
  left: -280px;
  width: 280px;
  height: 100vh;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  z-index: 91;
  transition: left 0.25s ease;
  overflow-y: auto;
  padding: 1rem 0;
}

.mobile-sidebar.open {
  left: 0;
}

.mobile-sidebar .sidebar-nav {
  padding: 0 0.75rem;
}

.mobile-sidebar .nav-item {
  padding: 0.75rem;
}

.mobile-sidebar-close {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  color: var(--fg-muted);
  font-size: 0.875rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
  cursor: pointer;
  background: none;
  border-left: none;
  border-right: none;
  border-top: none;
  width: 100%;
  text-align: left;
}

.mobile-sidebar-close:hover {
  color: var(--accent);
}

@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; align-items: center; justify-content: center; }
}
```

- [ ] **Step 3: Добавить HTML для overlay и мобильного sidebar**

В `app/static/index.html`, перед закрывающим `</body>`, добавить:

```html
<!-- Mobile menu overlay -->
<div class="mobile-overlay" id="mobile-overlay" onclick="closeMobileMenu()"></div>
<div class="mobile-sidebar" id="mobile-sidebar">
  <button class="mobile-sidebar-close" onclick="closeMobileMenu()">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    Закрыть
  </button>
  <nav class="sidebar-nav" id="mobile-nav"></nav>
</div>
```

- [ ] **Step 4: Добавить JS логику**

В `app/static/js/navigation.js` добавить:

```javascript
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
    }
}

function closeMobileMenu() {
    const overlay = document.getElementById('mobile-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    overlay.classList.remove('show');
    sidebar.classList.remove('open');
    document.body.style.overflow = '';
}
```

- [ ] **Step 5: Commit**

```bash
git add app/static/index.html app/static/css/responsive.css app/static/js/navigation.js
git commit -m "feat: мобильное гамбургер-меню для навигации"
```

---

### Task 2: Адаптивные таблицы

**Covers:** [S4]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.table-wrap`, `table` из tables.css

- [ ] **Step 1: Добавить горизонтальный скролл для таблиц**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 768px) {
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { min-width: 600px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: горизонтальный скролл таблиц на мобильных"
```

---

### Task 3: Адаптивные фильтры

**Covers:** [S5]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.filter-bar`, `.filter-group`, `.filter-date-group`, `.log-filters-main` из filters.css и logs.css

- [ ] **Step 1: Добавить адаптивные фильтры**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 768px) {
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-group, .filter-group.narrow, .filter-group.wide { min-width: 100%; flex: none; }
  .filter-date-group { min-width: auto; width: 100%; }
  .filter-date-selects { flex-wrap: wrap; }
  .filter-actions { justify-content: flex-end; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: адаптивные фильтры на мобильных"
```

---

### Task 4: Адаптивный top bar

**Covers:** [S6]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.topbar`, `.topbar-right`, `.topbar-version`, `.topbar-datetime` из layout.css

- [ ] **Step 1: Добавить адаптивный top bar**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 768px) {
  .topbar { padding: 0.625rem 1rem; }
  .topbar-right { gap: 0.75rem; }
  .topbar-version { display: none; }
}

@media (max-width: 480px) {
  .topbar-datetime { font-size: 0.75rem; padding-right: 0.75rem; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: адаптивный top bar на мобильных"
```

---

### Task 5: Адаптивные VKS карточки

**Covers:** [S7]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.vks-card`, `.vks-card-left`, `.vks-card-body`, `.vks-card-actions` из vks.css

- [ ] **Step 1: Добавить адаптивные VKS карточки**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 768px) {
  .vks-card-left { min-width: 48px; padding-right: 0.75rem; }
  .vks-card { padding: 0.875rem 1rem; }
}

@media (max-width: 480px) {
  .vks-card { flex-direction: column; }
  .vks-card-left {
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-right: 0;
    padding-bottom: 0.75rem;
    gap: 0.5rem;
    min-width: auto;
  }
  .vks-card-actions { flex-direction: row; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: адаптивные VKS карточки на мобильных"
```

---

### Task 6: Адаптивные формы и модалки

**Covers:** [S8]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.form-row`, `.modal`, `.modal-body` из modals.css

- [ ] **Step 1: Добавить адаптивные формы**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 768px) {
  .form-row { flex-direction: column; gap: 0.75rem; }
  .form-row .form-group { flex: none; }
  .modal { max-height: 90vh; }
  .modal-body { padding: 1rem; margin: 1rem; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: адаптивные формы и модалки на мобильных"
```

---

### Task 7: Адаптивный дашборд и логи

**Covers:** [S9, S10]

**Files:**
- Modify: `app/static/css/responsive.css`

**Interfaces:**
- Consumes: `.dash-chart-bars`, `.log-container`, `.log-footer` из dashboard.css и logs.css

- [ ] **Step 1: Добавить адаптивный дашборд и логи**

В `app/static/css/responsive.css` добавить:

```css
@media (max-width: 480px) {
  .dash-chart-bars { height: 140px; min-height: 140px; }
  .log-container { min-height: 200px; }
  .log-footer { flex-direction: column; gap: 4px; text-align: center; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/static/css/responsive.css
git commit -m "fix: адаптивный дашборд и логи на мобильных"
```

---

### Task 8: Финальная сборка и деплой

**Covers:** Все секции

**Files:**
- Нет — проверка и деплой

- [ ] **Step 1: Проверить все изменения**

Убедиться что responsive.css содержит все медиа-запросы, index.html содержит mobile overlay, navigation.js содержит логику меню.

- [ ] **Step 2: Финальный коммит (если есть незакоммиченные изменения)**

```bash
git status
git add -A
git commit -m "feat: мобильная оптимизация панели администратора"
```

- [ ] **Step 3: Деплой на test**

```bash
python deploy/deploy.py test
```

Expected: Деплой успешен, сайт доступен на http://45.90.217.225:8082/admin
