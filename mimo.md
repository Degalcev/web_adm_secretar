# MiMo Контекст Проекта

## Идентификация проекта
**Название**: web_adm_secretar
**Назначение**: Панель администратора для бота VKS Secretar (@vks_secretar_bot)
**Выделен из**: bot_secretar_2.0_MAX (2026-06-29)

## Основной стек
- **Backend**: Python 3.x + asyncio + aiohttp
- **База данных**: PostgreSQL (asyncpg) + SQLAlchemy async
- **Авторизация**: argon2-cffi хеширование паролей, сессии в памяти
- **Логирование**: loguru с просмотром логов из нескольких источников
- **Frontend**: Vanilla JS/CSS (тёмная тема)
- **Деплой**: paramiko SSH к VPS (45.90.217.225)

## Правила проекта
1. Область: CRUD пользователей + организаторов + локаций + просмотр логов (без логики бота)
2. Деплой через paramiko SSH на VPS `/opt/web/`, порт 8080
3. Админ-панель доступна на `https://bot.dlab.run/admin` через nginx
4. GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Архитектура
- Точка входа: `main.py` → `app/server.py` → `app/admin_routes.py`
- Модели БД: `database/models.py` (User, Organizer, Location)
- Операции БД: `database/requests.py` (чтение), `database/sending.py` (запись)
- Конфигурация: `config.py` загружает из `.env`
- Статические файлы: `app/static/` (admin.html, css/, js/)

## Направления разработки
- Python async паттерны (asyncio, aiohttp)
- SQLAlchemy async ORM
- PostgreSQL запросы и миграции
- REST API дизайн
- Frontend JavaScript (vanilla)
- CSS тёмная тема
- SSH деплой и управление VPS
- Безопасность (авторизация, хеширование, защита от CSRF)
- Java разработка ( Spring Boot и экосистема)
- Графика и UI/UX дизайн

## Специализации агентов
1. **Backend агент**: Python, asyncio, aiohttp, SQLAlchemy
2. **Frontend агент**: HTML, CSS, JavaScript, UI/UX
3. **DevOps агент**: SSH, деплой, nginx, VPS
4. **Database агент**: PostgreSQL, миграции, запросы
5. **Security агент**: Авторизация, хеширование, CSRF, валидация ввода
6. **Java агент**: Java, Spring Boot, JVM экосистема
7. **Graphics агент**: Графический дизайн, UI/UX, SVG, CSS-анимации

## Активные задачи
- Реализация CRUD организаторов с полем short_name
- Просмотр логов из нескольких источников
- Автоматизация деплоя

## Известные проблемы
- Сессии теряются при перезапуске (словарь в памяти)
- Нет защиты CSRF на маршрутах админа
- Пароль админа по умолчанию в конфиге
