# Скилл: Веб-фрейонтенд разработка

## Назначение
Руководство по созданию HTML, CSS и JavaScript фронтенд компонентов с поддержкой тёмной темы.

## Когда использовать
- Создание UI админ-панели
- Создание адаптивных макетов
- Реализация тёмной темы
- Написание vanilla JavaScript
- Стилизация с CSS

## Структура проекта
```
app/static/
├── admin.html      # Основная страница админа
├── css/
│   └── admin.css   # Стили тёмной темы
└── js/
    └── admin.js    # Фронтенд логика
```

## HTML структура
```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ-панель</title>
    <link rel="stylesheet" href="/static/css/admin.css">
</head>
<body class="dark-theme">
    <div class="container">
        <!-- Контент здесь -->
    </div>
    <script src="/static/js/admin.js"></script>
</body>
</html>
```

## CSS тёмная тема
```css
/* Базовые переменные тёмной темы */
:root {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --text-primary: #eee;
    --text-secondary: #aaa;
    --accent: #0f3460;
    --highlight: #e94560;
}

.dark-theme {
    background-color: var(--bg-primary);
    color: var(--text-primary);
}

/* Стилизация компонентов */
.card {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
}

.btn-primary {
    background: var(--highlight);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
}
```

## JavaScript паттерны
```javascript
// API вызовы
async function fetchData(url) {
    try {
        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Network error');
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// CRUD операции
async function createItem(data) {
    return fetchData('/admin/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

// Обработка формы
document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    await createItem(data);
});
```

## Паттерны компонентов
```javascript
// Компонент модального окна
function showModal(content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            ${content}
            <button class="close-btn">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.close-btn').onclick = () => modal.remove();
}

// Компонент таблицы
function renderTable(data, columns) {
    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${data.map(row => `
                <tr>${columns.map(col => `<td>${row[col.key]}</td>`).join('')}</tr>
            `).join('')}
        </tbody>
    `;
    return table;
}
```

## Специфика проекта
```javascript
// Авторизация админа
async function checkAdminStatus(maxId) {
    const response = await fetch(`/api/check-admin-status/${maxId}`, {
        credentials: 'include'
    });
    return response.json();
}

// Управление пользователями
async function getUsers() {
    return fetchData('/admin/api/users');
}

async function createUser(userData) {
    return createItem('/admin/api/users', userData);
}
```

## Адаптивный дизайн
```css
/* Mobile-first подход */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
}

/* Адаптивная сетка */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
}

/* Media запросы */
@media (max-width: 768px) {
    .sidebar {
        display: none;
    }
}
```

## Доступность
```html
<!-- Семантический HTML -->
<nav aria-label="Основная навигация">
    <ul role="menubar">
        <li role="menuitem"><a href="#users">Пользователи</a></li>
    </ul>
</nav>

<!-- ARIA метки -->
<button aria-label="Закрыть диалог">&times;</button>
```

## Советы по производительности
1. **Ленивая загрузка**: Загружайте компоненты по требованию
2. **Дебаунсинг**: Дебаунсивайте поля поиска
3. **Кеширование**: Кешируйте ответы API
4. **Минификация**: Минифицируйте CSS/JS для продакшена

## Распространённые ошибки
1. **CORS проблемы**: Убедитесь в правильной обработке credentials
2. **XSS**: Очищайте ввод пользователя
3. **Утечки памяти**: Очищайте обработчики событий
4. **Сломанные ссылки**: Тестируйте все пути навигации

## Отладка
```javascript
// Console отладка
console.log('Debug info:', data);

// Network вкладка: Проверяйте ответы API
// Elements вкладка: Инспектируйте изменения DOM
// Sources вкладка: Устанавливайте breakpoints
```

## Ссылки
- MDN Web Docs: https://developer.mozilla.org/
- CSS-Tricks: https://css-tricks.com/
- Фронтенд проекта: `app/static/`
