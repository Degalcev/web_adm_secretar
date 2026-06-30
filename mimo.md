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
- **Frontend**: Vanilla JS/CSS (модульная структура, стиль SharX Panel)
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
│   └── vks.py           # CRUD событий ВКС + документы
└── static/
    ├── admin.html
    ├── css/ (base, layout, components, tables, modals, logs, vks, settings, responsive)
    └── js/ (utils, auth, navigation, users, organizers, locations, logs, vks, settings, app)

database/
├── models.py            # User, Organizer, Location, Session, Event
├── requests.py          # Запросы (чтение)
└── sending.py           # Операции (запись)

deploy/
├── deploy.py            # Скрипт деплоя (test/prod)
├── .env.test            # Конфиг тестовой среды
├── .env.prod            # Конфиг продакшена
├── nginx/               # Конфиги nginx
└── systemd/             # Systemd сервисы
```

## Базы данных
- **vks_db** — продакшен (бот + админка)
- **test_db** — тестовая (разработка, UTF8, структура = vks_db)

## Ссылки
- Тест: `http://45.90.217.225/admin` (nginx → порт 8082)
- Продакшен: `https://bot.dlab.run/admin` (nginx → порт 8080)
- GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Меню sidebar
- **ВКС** (раскрывающееся) → Текущие, Завершённые
- **Администрирование** (раскрывающееся) → Пользователи, Организаторы, Локации, Логи
- **Настройки** (раскрывающееся) → Общие (выбор темы)
- Кнопка "Выйти" внизу навигации

## Карта сайта
- **Страница авторизации**: /
- **Страница ВКС Текущие**: /conferences/
- **Страница ВКС Завершённые**: /conferences/completed/
- **Страница Администрирование Пользователи**: /admin/users/
- **Страница Администрирование Организаторы**: /admin/organizers/
- **Страница Администрирование Локации**: /admin/locations/
- **Страница Администрирование Локации**: /admin/logs/
- **Страница Настройки Общие**: /settings/general/

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
