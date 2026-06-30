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
- **Frontend**: Vanilla JS/CSS (SPA с клиентским роутингом)
- **Деплой**: paramiko SSH к VPS

## Архитектура
```
app/
├── __init__.py
├── auth.py              # Авторизация, CSRF, rate limiting, сессии
├── server.py            # Точка входа aiohttp (SPA маршруты + API)
├── routes/
│   ├── __init__.py      # Экспорт всех setup_*_routes
│   ├── users.py         # CRUD пользователей
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов
│   ├── vks.py           # CRUD событий ВКС
│   └── documents.py     # CRUD документов к событиям
└── static/
    ├── index.html       # SPA entry point
    ├── css/ (base, layout, components, tables, modals, logs, vks, settings, filters, responsive)
    └── js/ (utils, auth, router, navigation, users, organizers, locations, logs, vks, settings, app)

database/
├── __init__.py
├── models.py            # User, Organizer, Location, Session, Event, Document
├── requests.py          # Запросы (чтение)
└── sending.py           # Операции (запись)

deploy/
├── deploy.py            # Скрипт деплоя (test/prod)
├── .env.test            # Конфиг тестовой среды
├── .env.prod            # Конфиг продакшена
├── nginx/
│   ├── test.conf        # Nginx тест (catch-all на порт 8082)
│   └── prod.conf        # Nginx прод (SSL, /admin → 8080)
└── systemd/
    ├── web-admin.service
    └── web-admin-test.service
```

## Модели базы данных
- **User** — пользователи бота (tg_id, max_id, name, status, fsm_id, chat_id, notification)
- **Organizer** — организаторы ВКС (name, base_url, short_name)
- **Location** — локации (name)
- **Session** — сессии админки (token, user_id, ip_address, expires_at)
- **Event** — события ВКС (date, time, organizer_id, location_id, url, description, completed, doc_id, notification, locked_by)
- **Document** — документы к событиям (event_id, name, size, file_path, content)

## Базы данных
- **vks_db** — продакшен (бот + админка)
- **test_db** — тестовая (разработка, структура = vks_db)

## Ссылки
- Тест: `http://45.90.217.225/admin` (nginx → порт 8082)
- Продакшен: `https://bot.dlab.run/admin` (nginx → порт 8080)
- GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Карта сайта (SPA маршруты)
- `/` — страница авторизации
- `/admin/` — главная админки
- `/admin/users/` — пользователи
- `/admin/organizers/` — организаторы
- `/admin/locations/` — локации
- `/admin/logs/` — логи
- `/conferences/` — текущие ВКС
- `/conferences/completed/` — завершённые ВКС
- `/settings/` — настройки
- `/settings/general/` — общие настройки (темы)

## Меню sidebar
- **ВКС** (раскрывающееся) → Текущие, Завершённые
- **Администрирование** (раскрывающееся) → Пользователи, Организаторы, Локации, Логи
- **Настройки** (раскрывающееся) → Общие (выбор темы)
- Кнопка "Выйти" внизу навигации

## Темы (8 штук из sharx-themes-demo)
default, midnight, ember, boreal, web, xuiClassic, starWars, vision

## Правила проекта
1. Деплой через paramiko SSH на VPS
2. Тест: `http://45.90.217.225/admin` (порт 8082)
3. Продакшен: `https://bot.dlab.run/admin` (порт 8080)
4. GitHub: `https://github.com/Degalcev/web_adm_secretar`
5. При разработке использовать test_db
6. **ОБЯЗАТЕЛЬНО**: Перед любой задачей читать скилы из `.mimocode/skills/` и при необходимости использовать агентов из `.mimocode/agents/`

## Порядок работы
1. Получил задачу → читаю `.mimocode/skills/` (подходящий скилл)
2. Определяю нужен ли агент → `.mimocode/agents/`
3. Выполняю по паттернам из скила
4. Если задача сложная — dispatch subagent'а с описанием из агента

## Скилы и агенты
См. `.mimocode/skills/` и `.mimocode/agents/`
- python-async, sqlalchemy-async, web-frontend
- security-auth, devops-ssh, loguru-logging
- java-development, graphics-ui

## Конфигурация (config.py)
- SSH_SERVER, SSH_USER_NAME, SSH_USER_PASSWORD — SSH туннель (опционально)
- DB_USER, DB_USER_PASSWORD, DB_NAME, DB_HOST, DB_PORT — подключение к PostgreSQL
- WEBAPP_HOST, WEBAPP_PORT — хост и порт веб-сервера
- DEFAULT_ADMIN_PASSWORD — пароль администратора по умолчанию
- BOT_LOGS_DIR — директория логов бота
