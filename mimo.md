# MiMo Контекст Проекта

## Идентификация проекта
**Название**: web_adm_secretar
**Назначение**: Панель администратора для бота VKS Secretar (@vks_secretar_bot)
**Выделен из**: bot_secretar_2.0_MAX (2026-06-29)

## Основной стек
- **Backend**: Python 3.x + asyncio + aiohttp
- **База данных**: PostgreSQL (asyncpg) + SQLAlchemy async
- **Авторизация**: argon2-cffi, сессии в PostgreSQL (таблица sessions)
- **Логирование**: loguru (ротация ежедневно, хранение 7 дней)
- **Frontend**: Vanilla JS/CSS (SPA с клиентским роутингом)
- **Real-time**: SSE (Server-Sent Events) через PostgreSQL LISTEN/NOTIFY
- **Деплой**: paramiko SSH к VPS

## Архитектура
```
app/
├── __init__.py
├── auth.py              # Авторизация (argon2), CSRF, rate limiting, сессии (PostgreSQL)
├── server.py            # Точка входа aiohttp (SPA маршруты + API + static)
├── sse_listener.py      # SSE listener (PostgreSQL LISTEN/NOTIFY → broadcast)
├── routes/
│   ├── __init__.py      # Экспорт всех setup_*_routes
│   ├── users.py         # CRUD пользователей + смена пароля
│   ├── organizers.py    # CRUD организаторов
│   ├── locations.py     # CRUD локаций
│   ├── logs.py          # Просмотр логов (panel + bot)
│   ├── vks.py           # CRUD событий ВКС + dashboard stats
│   ├── documents.py     # CRUD документов (download/upload/delete)
│   ├── preload.py       # Preload API (events + organizers + locations)
│   └── sse.py           # SSE endpoint (/admin/api/events/stream)
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

### User
```
id (String PK), tg_id (Integer unique), max_id (Integer unique),
name (String), password (String nullable), status (String),
fsm_id (Integer), fsm_user_message_id (Integer),
all_event_message_id (BigInteger), chat_id (BigInteger),
notification (Boolean), bot_listen (Boolean),
updated_at (DateTime), max_all_event_message_id (String),
max_fsm_id (String), max_fsm_user_message_id (String)
```

### Organizer
```
id (String PK), name (String 40), base_url (String nullable),
short_name (String 20 nullable), updated_at (DateTime)
```
Индекс: `idx_organizer_name`

### Location
```
id (String PK), name (String 20), updated_at (DateTime)
```
Индекс: `idx_location_name`

### Session
```
id (String PK), token (String 64 unique), user_id (String FK→users.id),
ip_address (String 45 nullable), user_agent (String 500 nullable),
created_at (DateTime), expires_at (DateTime)
```
Индексы: `idx_session_token`, `idx_session_expires`

### Event
```
id (String PK), type (String 20 default 'ВКС'), date (Date),
time (Time nullable), organizer_id (String FK→organizers.id),
location_id (String FK→locations.id), url (String nullable),
description (String nullable), completed (Boolean default False),
doc_id (String nullable), notification (Boolean default True),
updated_at (DateTime), locked_by (Integer nullable),
locked_at (DateTime nullable)
```
Индексы: `idx_event_date`, `idx_event_date_time`, `idx_event_organizer_id`, `idx_event_location_id`, `idx_event_completed`

### Document
```
id (String PK), event_id (String FK→events.id nullable),
name (String 80), size (Integer default 0),
file_path (String nullable), content (LargeBinary nullable),
updated_at (DateTime)
```
Индексы: `idx_document_event_id`, `idx_document_name`

## Базы данных
- **vks_db** — продакшен (бот + админка)
- **test_db** — тестовая (разработка, структура = vks_db)

## API Endpoints

### Auth
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/admin/login` | Вход (max_id + password) |
| POST | `/admin/logout` | Выход |

### Users
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/users` | Список пользователей |
| POST | `/admin/api/users` | Создание пользователя |
| PUT | `/admin/api/users/{id}` | Обновление пользователя |
| DELETE | `/admin/api/users/{id}` | Удаление пользователя |
| GET | `/api/check-admin-status/{max_id}` | Проверка admin статуса |
| POST | `/admin/api/change-password` | Смена пароля |

### Organizers
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/organizers` | Список организаторов |
| POST | `/admin/api/organizers` | Создание организатора |
| PUT | `/admin/api/organizers/{id}` | Обновление организатора |
| DELETE | `/admin/api/organizers/{id}` | Удаление организатора |

### Locations
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/locations` | Список локаций |
| POST | `/admin/api/locations` | Создание локации |
| PUT | `/admin/api/locations/{id}` | Обновление локации |
| DELETE | `/admin/api/locations/{id}` | Удаление локации |

### Events (ВКС)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/events?status=active/completed` | Список событий |
| POST | `/admin/api/events` | Создание (multipart: поля + файлы) |
| PUT | `/admin/api/events/{id}` | Обновление (multipart) |
| DELETE | `/admin/api/events/{id}` | Удаление события |
| GET | `/admin/api/dashboard` | Статистика dashboard |

### Documents
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/documents/{id}/download` | Скачивание документа |
| POST | `/admin/api/events/{event_id}/documents` | Загрузка документа |
| DELETE | `/admin/api/documents/{id}` | Удаление документа |

### Logs
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/logs/dates` | Список дат с логами |
| GET | `/admin/api/logs/{date}?lines=500&level=&search=&source=` | Чтение лога |

### Preload & SSE
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/api/preload` | Загрузка всех данных |
| GET | `/admin/api/events/stream` | SSE поток обновлений |
| GET | `/version.json` | Версия для автообновления |

## Ссылки
- Тест: `http://45.90.217.225/admin` (nginx → порт 8082)
- Продакшен: `https://bot.dlab.run/admin` (nginx → порт 8080)
- GitHub: `https://github.com/Degalcev/web_adm_secretar`

## Карта сайта (SPA маршруты)
- `/` — страница авторизации
- `/panel/` — панель (dashboard)
- `/admin/` — главная админки
- `/admin/users/` — пользователи
- `/admin/organizers/` — организаторы
- `/admin/locations/` — локации
- `/admin/logs/` — логи
- `/conferences/` — текущие ВКС
- `/conferences/completed/` — завершённые ВКС
- `/settings/` — настройки
- `/settings/general/` — общие настройки (темы)
- `/settings/profile/` — профиль пользователя

## Меню sidebar
- **ВКС** (раскрывающееся) → Текущие, Завершённые
- **Администрирование** (раскрывающееся) → Пользователи, Организаторы, Локации, Логи
- **Настройки** (раскрывающееся) → Общие (выбор темы)
- Кнопка "Выйти" внизу навигации

## Темы (8 штук из sharx-themes-demo)
default, midnight, ember, boreal, web, xuiClassic, starWars, vision

## Паттерны проекта

### Авторизация
- `@admin_required` — декоратор для защищённых маршрутов (проверка сессии + admin статус)
- `@require_csrf` — декоратор CSRF проверки (POST/PUT/DELETE)
- Rate limiter: 5 запросов/минуту на вход
- Cookie: `admin_token` (httponly) + `csrf_token` (js-readable)
- Сессии хранятся в PostgreSQL (таблица sessions), TTL 24ч

### Ошибки в маршрутах
```python
@admin_required
async def handler(request: web.Request) -> web.Response:
    try:
        # логика
        return web.json_response({'ok': True})
    except Exception as e:
        logger.error('Ошибка: {}', repr(e))
        return web.json_response({'ok': False, 'error': str(e)}, status=500)
```

### CRUD паттерн (database)
```python
# reading → database/requests.py
async def get_items():
    async with async_session() as session:
        result = await session.scalars(select(Model))
        return list(result)

# writing → database/sending.py
async def add_item(**kwargs) -> str:
    new_id = str(uuid.uuid4())
    new_obj = Model(id=new_id, **kwargs)
    async with async_session() as session:
        session.add(new_obj)
        await session.commit()
        return new_id
```

### SSE паттерн
```python
# sse_listener.py — PostgreSQL LISTEN/NOTIFY
# При изменении events → триггер update_event → NOTIFY → broadcast

# sse.py — клиентский endpoint
async def event_stream(request):
    queue = subscribe()  # создаёт очередь
    # ... stream events via SSE
```

### Multipart (события с файлами)
```python
# Events принимают multipart/form-data
# Поля: type, date, time, organizer_id, location_id, url, description, completed, notification
# Файлы: field name = 'files' (множественные)
# keep_doc_ids — запятые ID документов для сохранения при обновлении
```

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

## Конфигурация (config.py)
- SSH_SERVER, SSH_USER_NAME, SSH_USER_PASSWORD — SSH туннель (опционально)
- DB_USER, DB_USER_PASSWORD, DB_NAME, DB_HOST, DB_PORT — подключение к PostgreSQL
- WEBAPP_HOST, WEBAPP_PORT — хост и порт веб-сервера
- DEFAULT_ADMIN_PASSWORD — пароль администратора по умолчанию
- BOT_LOGS_DIR — директория логов бота
- PROJECT_ROOT — корень проекта (авто)
