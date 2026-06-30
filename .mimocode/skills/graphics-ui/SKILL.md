# Скилл: Графика и UI/UX

## Назначение
Руководство по созданию SVG графики, CSS анимаций и проектированию UI/UX интерфейсов.

## Когда использовать
- Создание SVG иконок и графики
- Реализация CSS анимаций
- Проектирование UI/UX
- Адаптивный дизайн
- Цветовые схемы и типографика

## Цветовая палитра проекта
```css
:root {
    /* Основные цвета */
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    
    /* Текст */
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    
    /* Акценты */
    --accent-primary: #2dd4bf;
    --accent-secondary: #06b6d4;
    --accent-success: #22c55e;
    --accent-warning: #f59e0b;
    --accent-danger: #ef4444;
    
    /* Границы */
    --border-color: #334155;
    --border-hover: #475569;
    
    /* Тени */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

## SVG иконки
```html
<!-- Базовая иконка пользователя -->
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
</svg>

<!-- Иконка настроек -->
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
</svg>

<!-- Иконка поиска -->
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
</svg>
```

## CSS анимации
```css
/* Плавное появление */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
    animation: fadeIn 0.3s ease-out;
}

/* Пульс для уведомлений */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Вращение для загрузки */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.animate-spin {
    animation: spin 1s linear infinite;
}

/* Hover эффекты */
.hover-lift {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hover-lift:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
}
```

## UI компоненты
```css
/* Карточка */
.card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.2s ease;
}

.card:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-md);
}

/* Кнопка */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s ease;
    cursor: pointer;
}

.btn-primary {
    background: var(--accent-primary);
    color: var(--bg-primary);
}

.btn-primary:hover {
    background: var(--accent-secondary);
}

/* Инпут */
.input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
}

.input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.1);
}

/* Таблица */
.table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.table th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-color);
}

.table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color);
}

.table tr:hover td {
    background: var(--bg-tertiary);
}
```

## Мобильный дизайн
```css
/* Адаптивный контейнер */
.container {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1rem;
}

/* Сетка */
.grid {
    display: grid;
    gap: 1rem;
}

.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 768px) {
    .grid-2,
    .grid-3,
    .grid-4 {
        grid-template-columns: 1fr;
    }
}

/* Мобильная навигация */
.mobile-nav {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    padding: 0.5rem;
    z-index: 100;
}

@media (max-width: 768px) {
    .mobile-nav {
        display: flex;
        justify-content: space-around;
    }
}
```

## Типографика
```css
/* Заголовки */
h1 { font-size: 1.875rem; font-weight: 700; line-height: 1.2; }
h2 { font-size: 1.5rem; font-weight: 600; line-height: 1.3; }
h3 { font-size: 1.25rem; font-weight: 600; line-height: 1.4; }

/* Текст */
.text-sm { font-size: 0.875rem; }
.text-xs { font-size: 0.75rem; }
.text-lg { font-size: 1.125rem; }

.text-muted { color: var(--text-muted); }
.text-accent { color: var(--accent-primary); }
.text-danger { color: var(--accent-danger); }
.text-success { color: var(--accent-success); }
```

## Интерактивные элементы
```javascript
// Тултипы
function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = e.target.dataset.tooltip;
            document.body.appendChild(tooltip);
            
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = rect.bottom + 5 + 'px';
        });
        
        el.addEventListener('mouseleave', () => {
            document.querySelector('.tooltip')?.remove();
        });
    });
}

// Уведомления (toast)
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
```

## Файлы для справки
- `app/static/admin.html` - Текущая разметка
- `app/static/css/admin.css` - Текущие стили
- `app/static/js/admin.js` - Текущая логика

## Инструменты
- Figma для прототипирования
- SVGOMG для оптимизации SVG
- Coolors.co для генерации палитр
- CSS-Tricks для референсов анимаций
