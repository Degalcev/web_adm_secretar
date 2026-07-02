# Скилл: Разработка на Python Async

## Назначение
Руководство по разработке async Python приложений с asyncio, aiohttp и async паттернами.

## Когда использовать
- Написание async/await кода
- Работа с aiohttp веб-сервером
- Реализация async операций с БД
- Обработка параллельных операций
- Отладка async проблем

## Основные паттерны

### Async/Await основы
```python
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return {"data": "value"}

async def main():
    result = await fetch_data()
    print(result)

asyncio.run(main())
```

### aiohttp сервер
```python
from aiohttp import web

async def handler(request):
    return web.json_response({"status": "ok"})

app = web.Application()
app.router.add_get("/", handler)
web.run_app(app)
```

### Параллельные задачи
```python
async def process_items(items):
    tasks = [process_item(item) for item in items]
    results = await asyncio.gather(*tasks)
    return results
```

## Распространённые ошибки
1. **Блокирующие вызовы в async**: Используйте `asyncio.to_thread()` для блокирующего I/O
2. **Пропущенный await**: Всегда вызывайте корутины
3. **Проблемы event loop**: Не создавайте новые event loops
4. **Отмена задач**: Используйте `asyncio.TaskGroup` для структурированной конкурентности

## Специфика проекта
- **Точка входа**: `main.py` → `app/server.py` (запуск aiohttp)
- **Маршруты**: `app/routes/*.py` (users, organizers, locations, logs, vks, documents, preload, sse)
- **База данных**: `database/` пакет (models.py, requests.py, sending.py)
- **Логирование**: `loguru.logger` с ротацией
- **SSE**: `app/sse_listener.py` + `app/routes/sse.py`

## Советы по отладке
```python
# Включение debug логирования
import logging
logging.basicConfig(level=logging.DEBUG)

# Проверка запущенных задач
for task in asyncio.all_tasks():
    print(task.get_name(), task.done())
```

## Тестирование async кода
```python
import pytest

@pytest.fixture
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_handler():
    result = await some_async_function()
    assert result == expected
```

## Ссылки
- Документация asyncio: https://docs.python.org/3/library/asyncio.html
- Документация aiohttp: https://docs.aiohttp.org/
- Код проекта: `app/server.py`, `app/routes/*.py`
