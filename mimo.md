# MiMo Контекст Проекта

## Идентификация проекта
**Название**: web_adm_secretar
**Назначение**: Панель администратора для бота VKS Secretar (@vks_secretar_bot)
**Выделен из**: bot_secretar_2.0_MAX (2026-06-29)

## Основной стек
- **Backend**: Python 3.x + asyncio + aiohttp
- **База данных**: PostgreSQL (asyncpg) + SQLAlchemy async
- **Авторизация**: argon2-cffi, сессии в PostgreSQL
- **Логирование**: loguru
- **Frontend**: Vanilla JS/CSS (модульная структура)
- **Деплой**: paramiko SSH к VPS

## Архитектура
```
app/
├── auth.py              # Авторизация, CSRF, rate limiting, сессии
├── server.py            # Точка входа aiohttp
├── routes/
│   ├── __init__.py
│   ├── users.py         # CRUD пользователей
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов
│   └── vks.py           # CRUD событий ВКС
└── static/
    ├── admin.html
    ├── css/ (base, layout, components, tables, modals, logs, vks, responsive)
    └── js/ (utils, auth, navigation, users, organizers, locations, logs, vks, app)

database/
├── models.py            # User, Organizer, Location, Session, Event
├── requests.py          # Запросы (чтение)
└── sending.py           # Операции (запись)
```

## Базы данных
- **vks_db** — продакшен (бот + админка)
- **test_db** — тестовая (разработка, структура = vks_db)

## Правила проекта
1. Деплой через paramiko SSH на VPS
2. Тест: `http://45.90.217.225/admin` (порт 8082)
3. Продакшен: `https://bot.dlab.run/admin` (порт 8080)
4. GitHub: `https://github.com/Degalcev/web_adm_secretar`
5. При разработке использовать test_db

## Скилы и агенты
См. `.mimocode/skills/` и `.mimocode/agents/`
- python-async, sqlalchemy-async, web-frontend
- security-auth, devops-ssh, loguru-logging
- java-development, graphics-ui
