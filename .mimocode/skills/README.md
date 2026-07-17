# Skills — web_adm_secretar

Проектные скилы для панели администратора VKS Secretar.

## Актуальные скилы

### Архитектура
- **project-architecture** — стек, файловая структура, деплой, правила проекта

### Фронтенд
- **frontend-spa** — SPA роутинг, pageInit, кэш, SSE, vanilla JS паттерны
- **calendar-module** — календарь: загрузка диапазонов, рендер, табы, mobile
- **vks-events** — VKS и Мероприятия: fetch, фильтры, пагинация, модалка

### Бэкенд
- **backend-api** — aiohttp роуты, auth middleware, БД паттерны, SSE

## Устаревшие (можно удалить)
- **frontend** — generic Tailwind patterns (не используются)
- **web-frontend** — generic CSS (не отражает актуальную архитектуру)
- **python-async** — generic asyncio (уже покрыто backend-api)
- **sqlalchemy-async** — generic SQLAlchemy (уже покрыто backend-api)
- **security-auth** — generic auth (уже покрыто backend-api)
- **devops-ssh** — generic SSH (уже покрыто project-architecture)
- **loguru-logging** — generic loguru (одно правило: use loguru)
- **graphics-ui** — generic SVG (не относится)
- **java-development** — Java (не относится к проекту)

## Использование
Скилы загружаются через `skill` tool или при вызове `/skill-name`.
Каждый скилл содержит: назначение, когда использовать, паттерны кода, ловушки.
