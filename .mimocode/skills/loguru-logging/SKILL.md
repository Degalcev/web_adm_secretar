# Скилл: Loguru Логирование

## Назначение
Руководство по реализации структурированного логирования с loguru, включая управление логами из нескольких источников.

## Когда использовать
- Настройка конфигурации логирования
- Логирование событий приложения
- Отладка со структурированными логами
- Реализация просмотрщиков логов
- Управление ротацией и хранением логов

## Базовая настройка
```python
from loguru import logger

# Удаление обработчика по умолчанию
logger.remove()

# Добавление пользовательского обработчика
logger.add(
    "logs/app_{time:YYYY-MM-DD}.log",
    level="DEBUG",
    rotation="00:00",  # Новый файл в полночь
    retention="7 дней",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"
)
```

## Уровни логов
```python
logger.debug("Debug сообщение")      # Детальная информация для отладки
logger.info("Info сообщение")        # Общая информация
logger.warning("Warning сообщение")  # Потенциальные проблемы
logger.error("Error сообщение")      # Ошибки, не останавливающие выполнение
logger.critical("Critical сообщение")  # Фатальные ошибки
```

## Структурированное логирование
```python
# Добавление контекста с bind()
logger_with_context = logger.bind(user_id=123, request_id="abc-123")
logger_with_context.info("Пользователь вошёл в систему")

# Использование extra для пользовательских полей
logger.bind(extra={"ip": "127.0.0.1"}).info("Запрос получен")

# Форматирование с переменными
user_id = 42
logger.info(f"Обработка пользователя {user_id}")
logger.info("Обработка пользователя {}", user_id)  # Рекомендуется
```

## Специфика проекта
```python
# main.py - InterceptHandler для стандартного логирования
class InterceptHandler(logging.Handler):
    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 6
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())

def setup_logging():
    logger_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "{extra[user]} | <level>{message}</level>"
    )
    logger.configure(extra={"user": " "})
    logger.add(
        "./logs/bot_{time:YYYY-MM-DD}.log",
        level="DEBUG",
        rotation="00:00",
        retention="7 дней",
        format=logger_format,
    )
    
    # Подавление шумных библиотек
    for name, level in [('aiohttp', logging.WARNING), ('asyncio', logging.WARNING)]:
        log = logging.getLogger(name)
        log.setLevel(level)
        log.addHandler(InterceptHandler())
        log.propagate = False
```

## Просмотрщик логов из нескольких источников
```python
import os
import re
from datetime import datetime

LOG_SOURCES = {
    'panel': '/path/to/panel/logs',
    'bot': '/path/to/bot/logs',
}

def scan_log_dates() -> list[dict]:
    dates = {}
    for source, logs_dir in LOG_SOURCES.items():
        if not os.path.exists(logs_dir):
            continue
        for f in os.listdir(logs_dir):
            if not f.endswith('.log'):
                continue
            match = re.match(r'bot_(\d{4}-\d{2}-\d{2})\.log', f)
            if not match:
                continue
            date_str = match.group(1)
            filepath = os.path.join(logs_dir, f)
            stat = os.stat(filepath)
            if date_str not in dates:
                dates[date_str] = {'date': date_str, 'size': 0, 'sources': []}
            dates[date_str]['size'] += stat.st_size
            if source not in dates[date_str]['sources']:
                dates[date_str]['sources'].append(source)
    return sorted(dates.values(), key=lambda x: x['date'], reverse=True)

def get_log_by_date(date_str: str, source: str = None) -> dict:
    all_lines = []
    sources = [source] if source in LOG_SOURCES else list(LOG_SOURCES)
    
    for src in sources:
        filepath = os.path.join(LOG_SOURCES[src], f'bot_{date_str}.log')
        if not os.path.exists(filepath):
            continue
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                all_lines.append({'text': line, 'source': src})
    
    all_lines.sort(key=lambda x: x['text'][:19])
    return {'date': date_str, 'lines': all_lines}
```

## Фильтрация логов
```python
def filter_logs(lines: list, level: str = None, search: str = None) -> list:
    filtered = lines
    
    if level:
        filtered = [l for l in filtered if f'| {level}' in l['text']]
    
    if search:
        search_lower = search.lower()
        filtered = [l for l in filtered if search_lower in l['text'].lower()]
    
    return filtered
```

## Статистика логов
```python
def calculate_stats(lines: list) -> dict:
    stats = {'total': len(lines), 'ERROR': 0, 'WARNING': 0, 'INFO': 0, 'DEBUG': 0}
    for line in lines:
        for level in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
            if f'| {level}' in line['text']:
                stats[level] += 1
                break
    return stats
```

## Логирование исключений
```python
try:
    # Некоторая операция
    result = await some_async_function()
except Exception as e:
    logger.exception("Операция не удалась: {}", e)
    # или
    logger.opt(exception=True).error("Операция не удалась")
```

## Логирование производительности
```python
import time
from contextlib import contextmanager

@contextmanager
def log_performance(operation: str):
    start = time.time()
    yield
    duration = time.time() - start
    logger.info(f"{operation} завершена за {duration:.3f}с")

# Использование
with log_performance("Запрос к БД"):
    await db.execute(query)
```

## Стратегии ротации логов
```python
# Ротация по времени
logger.add("app.log", rotation="00:00")  # Ежедневно
logger.add("app.log", rotation="1 week")  # Еженедельно

# Ротация по размеру
logger.add("app.log", rotation="100 MB")

# Пользовательская ротация
def my_rotation(message):
    return message.record["time"].hour == 0  # Ротация в полночь

logger.add("app.log", rotation=my_rotation)
```

## Сжатие и хранение
```python
logger.add(
    "app.log",
    rotation="00:00",
    retention="30 дней",  # Хранить логи 30 дней
    compression="zip",    # Сжимать ротированные логи"
    format="..."
)
```

## Async логирование
```python
# Loguru async-безопасен по умолчанию
async def async_handler():
    logger.info("Обработка запроса")
    await asyncio.sleep(1)
    logger.info("Запрос завершён")
```

## Сериализация логов (JSON)
```python
import json

def json_format(record):
    log_entry = {
        "time": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "module": record["module"],
        "function": record["function"],
        "line": record["line"],
    }
    return json.dumps(log_entry) + "\n"

logger.add("app.json", format=json_format)
```

## Специфика проекта
```python
# Логирование запросов
logger.info("Запрос: {} {} от {}", request.method, request.path, request.remote)

# Операции с БД
logger.debug("Выполнение запроса: {}", query)

# События авторизации
logger.warning("Неудачная попытка входа для пользователя {}", max_id)
logger.info("Пользователь {} вошёл в систему", user_id)

# Ошибки
logger.error("Ошибка БД: {}", repr(e))
logger.exception("Произошла критическая ошибка")
```

## Отладка с логами
```python
# Включение debug логирования
logger.level("DEBUG")

# Трассировка выполнения
logger.trace("Вход в функцию {}", function_name)

# Логирование значений переменных
logger.debug("Состояние переменных: {}", {"key": value})
```

## Распространённые ошибки
1. **Слишком высокий уровень логов**: Используйте подходящие уровни
2. **Отсутствие контекста**: Привязывайте полезные данные
3. **Блокирующий I/O**: Используйте async-безопасное логирование
4. **Затопление логами**: Реализуйте rate limiting
5. **Чувствительные данные**: Никогда не логируйте пароли, токены

## Ссылки
- Документация Loguru: https://loguru.readthedocs.io/
- Настройка логирования: `main.py`
- Просмотрщик логов: `app/routes/logs.py`
