# Agents - Проект web_adm_secretar

Директория содержит агентов для автоматизации разработки проекта.

## Доступные агенты

### Backend разработка
- **backend-agent** - Python backend: asyncio, aiohttp, SQLAlchemy

### Frontend разработка
- **frontend-agent** - HTML, CSS, JavaScript, UI/UX

### Базы данных
- **database-agent** - PostgreSQL, SQLAlchemy, миграции

### DevOps
- **devops-agent** - SSH деплой, VPS, nginx, мониторинг

### Безопасность
- **security-agent** - Авторизация, хеширование, CSRF, валидация

### Java разработка
- **java-agent** - Java, Spring Boot, JVM экосистема

### Дизайн
- **graphics-agent** - SVG графика, CSS анимации, UI/UX

## Использование

Агенты вызываются через инструмент `actor` с указанием `subagent_type`:

```python
# Пример вызова backend агента
actor({
    "operation": {
        "action": "run",
        "subagent_type": "explore",
        "description": "Поиск в коде",
        "prompt": "Найди все маршруты в admin_routes.py"
    }
})
```

## Специализации

### backend-agent
- Написание и оптимизация async Python кода
- Реализация aiohttp обработчиков
- Работа с SQLAlchemy async ORM
- REST API разработка

### frontend-agent
- Создание адаптивных HTML макетов
- CSS тёмная тема
- Vanilla JavaScript
- UI компоненты

### database-agent
- Проектирование схем БД
- Оптимизация SQL запросов
- Миграции
- CRUD операции

### devops-agent
- SSH деплой через paramiko
- Управление VPS
- Nginx конфигурация
- Мониторинг серверов

### security-agent
- Авторизация и аутентификация
- Хеширование паролей (argon2)
- CSRF защита
- Валидация ввода

### java-agent
- Spring Boot приложения
- JPA/Hibernate ORM
- REST API
- Тестирование

### graphics-agent
- SVG иконки и графика
- CSS анимации
- UI/UX проектирование
- Адаптивный дизайн

## Файлы агентов

Каждый агент содержит:
- **Роль** - Описание специализации
- **Возможности** - Что умеет делать
- **Контекст** - Информация о проекте
- **Руководства** - Правила работы
- **Примеры промптов** - Примеры задач
- **Файлы для справки** - Ключевые файлы проекта
