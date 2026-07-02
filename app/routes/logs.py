import os
import re

from aiohttp import web
from loguru import logger

from app.auth import admin_required
from config import PROJECT_ROOT, BOT_LOGS_DIR

LOGS_DIR = os.path.join(PROJECT_ROOT, 'logs')

LOG_SOURCES = {
    'panel': LOGS_DIR,
    'bot': BOT_LOGS_DIR,
}

_LOGS_DIR_REALS: dict[str, str] = {}


def _get_logs_dir_real(source: str) -> str:
    if source not in _LOGS_DIR_REALS:
        _LOGS_DIR_REALS[source] = os.path.realpath(LOG_SOURCES[source])
    return _LOGS_DIR_REALS[source]


def _scan_dates() -> list[dict]:
    dates: dict[str, dict] = {}
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


@admin_required
async def get_log_dates(request: web.Request) -> web.Response:
    try:
        return web.json_response(_scan_dates())
    except Exception as e:
        logger.error('Ошибка получения списка дат: {}', repr(e))
        return web.json_response([], status=500)


@admin_required
async def get_log_by_date(request: web.Request) -> web.Response:
    try:
        date_str = request.match_info['date']
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return web.json_response({'error': 'Неверный формат даты'}, status=400)

        try:
            n = max(1, int(request.query.get('lines', '500')))
        except ValueError:
            n = 500

        level_filter = request.query.get('level', '').strip()
        search = request.query.get('search', '').strip()
        source_filter = request.query.get('source', '').strip()

        all_lines: list[dict] = []
        stats = {'total': 0, 'ERROR': 0, 'WARNING': 0, 'INFO': 0, 'DEBUG': 0}

        sources = [source_filter] if source_filter in LOG_SOURCES else list(LOG_SOURCES)
        for source in sources:
            filepath = os.path.join(LOG_SOURCES[source], f'bot_{date_str}.log')
            if not os.path.exists(filepath):
                continue
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    stats['total'] += 1
                    for level in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
                        if f'| {level}' in line:
                            stats[level] += 1
                            break
                    all_lines.append({'text': line, 'source': source})

        all_lines.sort(key=lambda x: x['text'][:19])

        filtered = all_lines
        if level_filter and level_filter in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
            filtered = [l for l in filtered if f'| {level_filter}' in l['text']]
        if search:
            search_lower = search.lower()
            filtered = [l for l in filtered if search_lower in l['text'].lower()]

        recent = filtered[-n:]

        return web.json_response({
            'date': date_str,
            'lines': [{'text': l['text'], 'source': l['source']} for l in recent],
            'total_lines': stats['total'],
            'filtered_lines': len(filtered),
            'stats': stats,
        })

    except Exception as e:
        logger.error('Ошибка чтения лога: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)


def setup_logs_routes(app: web.Application):
    app.router.add_get('/admin/api/logs/dates', get_log_dates)
    app.router.add_get('/admin/api/logs/{date}', get_log_by_date)
