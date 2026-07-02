# Agents — Проект web_adm_secretar

Агенты для автоматизации разработки админ-панели VKS Secretar.

## Доступные агенты

| Агент | Специализация | Файл |
|-------|--------------|------|
| **backend-agent** | Python backend: asyncio, aiohttp, SQLAlchemy, SSE | `backend-agent.md` |
| **database-agent** | PostgreSQL, SQLAlchemy async, модели, CRUD | `database-agent.md` |
| **security-agent** | Авторизация (argon2), CSRF, rate limiting, сессии | `security-agent.md` |
| **frontend-agent** | HTML, CSS, JS, SPA роутинг, темы, SSE клиент | `frontend-agent.md` |
| **devops-agent** | SSH деплой, VPS, nginx, systemd, мониторинг | `devops-agent.md` |

## Использование

Агенты вызываются через инструмент `actor`:

```python
# Backend агент
actor({
    "operation": {
        "action": "run",
        "subagent_type": "general",
        "description": "Новый CRUD endpoint",
        "prompt": "Создай endpoint для управления X"
    }
})

# Explore агент (поиск в коде)
actor({
    "operation": {
        "action": "run",
        "subagent_type": "explore",
        "description": "Поиск паттернов",
        "prompt": "Найди все маршруты с @admin_required"
    }
})
```

## Когда какой агент

- **Новый endpoint / CRUD** → backend-agent
- **Новая модель / миграция** → database-agent
- **Авторизация / CSRF / безопасность** → security-agent
- **UI / CSS / JS** → frontend-agent
- **Деплой / сервер / nginx** → devops-agent
