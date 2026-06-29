# Multi-Source Log Viewer Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/multi-source-logs.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-source log support to the admin panel — read logs from both the bot (`/opt/bot/logs/`) and the panel (`/opt/web/logs/`), with visual separation and source filtering.

**Architecture:** Add a `BOT_LOGS_DIR` config variable. Modify the backend API to return log files tagged with their source (`bot` or `panel`). Add a source selector to the frontend with visual badges. The file dropdown groups files by source with colored indicators.

**Tech Stack:** Python 3 (aiohttp), vanilla JS, CSS

## Global Constraints

- Bot logs path: `/opt/bot/logs/` (configurable via `BOT_LOGS_DIR` env var)
- Panel logs path: `PROJECT_ROOT/logs/` (existing behavior)
- Log file naming convention: `bot_YYYY-MM-DD.log` (both bot and panel use this)
- No new dependencies — pure stdlib + existing aiohttp

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `config.py` | Modify | Add `BOT_LOGS_DIR` |
| `.env.example` | Modify | Add `BOT_LOGS_DIR` entry |
| `app/admin_routes.py` | Modify | Multi-source log API |
| `app/static/js/admin.js` | Modify | Source selector + visual distinction |
| `app/static/admin.html` | Modify | Source selector UI |
| `app/static/css/admin.css` | Modify | Source badge styles |

---

### Task 1: Add BOT_LOGS_DIR config

**Covers:** Configuration for bot log path

**Files:**
- Modify: `config.py:25`
- Modify: `.env.example:14`
- Modify: `.env` (on server)

**Interfaces:**
- Produces: `BOT_LOGS_DIR` constant usable by admin_routes.py

- [ ] **Step 1: Add BOT_LOGS_DIR to config.py**

```python
# Add after line 25 (PROJECT_ROOT):
BOT_LOGS_DIR = os.getenv('BOT_LOGS_DIR', '/opt/bot/logs')
```

- [ ] **Step 2: Add to .env.example**

Append to end of `.env.example`:
```
BOT_LOGS_DIR='/opt/bot/logs'
```

- [ ] **Step 3: Update .env on server**

Add `BOT_LOGS_DIR='/opt/bot/logs'` to the server's `/opt/web/.env`.

- [ ] **Step 4: Commit**

```bash
git add config.py .env.example
git commit -m "feat: add BOT_LOGS_DIR config for multi-source logs"
```

---

### Task 2: Backend — Multi-source log API

**Covers:** API returns logs tagged by source, supports source filter

**Files:**
- Modify: `app/admin_routes.py:233-332`

**Interfaces:**
- Consumes: `BOT_LOGS_DIR` from config
- Produces: `get_log_files` returns `[{name, size, modified, source}]`, `get_log_content` accepts `?source=bot|panel`

- [ ] **Step 1: Add LOG_SOURCES dict and update _safe_log_path**

Replace lines 233-257 with:

```python
# ─── Логи ────────────────────────────────────────────────────────────────────

LOGS_DIR = os.path.join(PROJECT_ROOT, 'logs')

LOG_SOURCES = {
    'panel': LOGS_DIR,
    'bot':   BOT_LOGS_DIR,
}

_LOGS_DIR_REALS: dict[str, str] = {}


def _get_logs_dir_real(source: str) -> str:
    if source not in _LOGS_DIR_REALS:
        _LOGS_DIR_REALS[source] = os.path.realpath(LOG_SOURCES[source])
    return _LOGS_DIR_REALS[source]


def _safe_log_path(filename: str, source: str) -> str | None:
    if source not in LOG_SOURCES:
        return None
    if '/' in filename or '\\' in filename or filename.startswith('.'):
        return None
    if not filename.endswith('.log'):
        return None

    logs_dir = LOG_SOURCES[source]
    filepath = os.path.join(logs_dir, filename)

    if not os.path.realpath(filepath).startswith(_get_logs_dir_real(source) + os.sep):
        return None

    return filepath
```

- [ ] **Step 2: Update get_log_files to return source info**

Replace the `get_log_files` function (lines 260-278) with:

```python
@admin_required
async def get_log_files(request: web.Request) -> web.Response:
    try:
        source_filter = request.query.get('source', '').strip()
        files = []

        sources_to_scan = [source_filter] if source_filter in LOG_SOURCES else list(LOG_SOURCES)

        for source in sources_to_scan:
            logs_dir = LOG_SOURCES[source]
            if not os.path.exists(logs_dir):
                continue

            for f in sorted(os.listdir(logs_dir), reverse=True):
                if f.endswith('.log'):
                    filepath = os.path.join(logs_dir, f)
                    stat = os.stat(filepath)
                    files.append({
                        'name':     f,
                        'size':     stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'source':   source,
                    })

        files.sort(key=lambda x: x['modified'], reverse=True)
        return web.json_response(files)
    except Exception as e:
        logger.error('Ошибка получения списка логов: {}', repr(e))
        return web.json_response([], status=500)
```

- [ ] **Step 3: Update get_log_content to accept source param**

Replace the `get_log_content` function (lines 281-332) with:

```python
@admin_required
async def get_log_content(request: web.Request) -> web.Response:
    try:
        filename = request.match_info['filename']
        source = request.query.get('source', 'panel').strip()
        if source not in LOG_SOURCES:
            source = 'panel'

        filepath = _safe_log_path(filename, source)

        if filepath is None:
            return web.json_response({'error': 'Недопустимое имя файла'}, status=400)

        if not os.path.exists(filepath):
            return web.json_response({'error': 'Файл не найден'}, status=404)

        try:
            n = max(1, int(request.query.get('lines', '500')))
        except ValueError:
            n = 500

        level_filter = request.query.get('level', '').strip()
        search       = request.query.get('search', '').strip()

        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()

        stats = {'total': len(all_lines), 'ERROR': 0, 'WARNING': 0, 'INFO': 0, 'DEBUG': 0}
        for line in all_lines:
            for level in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
                if f'| {level}' in line:
                    stats[level] += 1
                    break

        total_lines_in_file = len(all_lines)

        if level_filter and level_filter in ('ERROR', 'WARNING', 'INFO', 'DEBUG'):
            all_lines = [l for l in all_lines if f'| {level_filter}' in l]

        if search:
            search_lower = search.lower()
            all_lines = [l for l in all_lines if search_lower in l.lower()]

        recent_lines = all_lines[-n:]

        return web.json_response({
            'filename':       filename,
            'source':         source,
            'lines':          recent_lines,
            'total_lines':    total_lines_in_file,
            'filtered_lines': len(all_lines),
            'stats':          stats,
        })

    except Exception as e:
        logger.error('Ошибка чтения лога: {}', repr(e))
        return web.json_response({'error': str(e)}, status=500)
```

- [ ] **Step 4: Commit**

```bash
git add app/admin_routes.py
git commit -m "feat: multi-source log API with bot/panel source tags"
```

---

### Task 3: Frontend — Source selector and visual distinction

**Covers:** Source filter UI, colored badges, grouped file dropdown

**Files:**
- Modify: `app/static/admin.html:131-198`
- Modify: `app/static/js/admin.js:252-387`
- Modify: `app/static/css/admin.css` (add source badge styles)

**Interfaces:**
- Consumes: API returns `source` field in log files and content responses
- Produces: Source selector dropdown, source badges in file list

- [ ] **Step 1: Add source selector to admin.html**

In the log-filters section (around line 134), add a source selector before the file select. Replace the `.log-filters-main` div content:

```html
<div class="log-filters-main">
  <div class="log-filter-group">
    <label>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Источник
    </label>
    <select id="log-source-filter" onchange="onLogSourceChange()">
      <option value="">Все</option>
      <option value="bot">Бот</option>
      <option value="panel">Панель</option>
    </select>
  </div>
  <div class="log-file-select">
    <label>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Файл лога
    </label>
    <select id="log-file-select" onchange="onLogRefresh()">
      <option value="">Загрузка...</option>
    </select>
  </div>
  <div class="log-filter-group">
    <label>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      Уровень
    </label>
    <select id="log-level-filter" onchange="onLogRefresh()">
      <option value="">Все</option>
      <option value="ERROR">ERROR</option>
      <option value="WARNING">WARNING</option>
      <option value="INFO">INFO</option>
      <option value="DEBUG">DEBUG</option>
    </select>
  </div>
  <div class="log-filter-group log-filter-narrow">
    <label>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      Строк
    </label>
    <select id="log-lines-count" onchange="onLogRefresh()">
      <option value="100">100</option>
      <option value="500" selected>500</option>
      <option value="1000">1000</option>
      <option value="5000">5000</option>
    </select>
  </div>
  <div class="log-filter-group log-search-wrap">
    <label>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Поиск
    </label>
    <div class="search-wrap">
      <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-input" id="log-search" placeholder="Текст..." oninput="debounceSearch()">
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update admin.js loadLogFiles with source support**

Replace the `loadLogFiles` function:

```javascript
async function loadLogFiles() {
    const select = document.getElementById('log-file-select');
    const source = document.getElementById('log-source-filter').value;
    try {
        const params = source ? `?source=${source}` : '';
        const resp = await fetch(`${BASE_URL}/admin/api/logs${params}`);
        const files = await resp.json();

        const prev = select.value;
        if (!files.length) {
            select.innerHTML = '<option value="">Нет файлов логов</option>';
        } else {
            let html = '';
            let currentSource = '';
            for (const f of files) {
                if (f.source !== currentSource) {
                    if (currentSource !== '') html += '</optgroup>';
                    const label = f.source === 'bot' ? 'Бот' : 'Панель';
                    const cls = f.source === 'bot' ? 'source-bot' : 'source-panel';
                    html += `<optgroup label="${label}" class="${cls}">`;
                    currentSource = f.source;
                }
                html += `<option value="${esc(f.name)}" data-source="${f.source}">${esc(f.name)} (${formatSize(f.size)})</option>`;
            }
            html += '</optgroup>';
            select.innerHTML = html;
        }

        const changed = prev !== select.value;
        if (changed || !select.value) {
            lastLogFilename = '';
            lastLogLines = 0;
        }
        if (select.value) {
            loadLogContent(true);
        }
    } catch (e) {
        select.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
}
```

- [ ] **Step 3: Update loadLogContent to pass source param**

In the `loadLogContent` function, update the fetch URL to include source:

```javascript
// Replace the params line (around line 301):
var source = document.getElementById('log-source-filter').value || 'panel';
var selectedOpt = document.querySelector('#log-file-select option:checked');
if (selectedOpt && selectedOpt.dataset.source) {
    source = selectedOpt.dataset.source;
}
var params = new URLSearchParams({lines: lines, level: level, search: search, source: source});
```

- [ ] **Step 4: Add onLogSourceChange function**

Add this function in admin.js (after `loadLogFiles`):

```javascript
function onLogSourceChange() {
    lastLogLines = 0;
    lastLogLines = 0;
    lastTotalLines = 0;
    lastLogFilename = '';
    loadLogFiles();
}
```

- [ ] **Step 5: Add source badge to log footer**

In `loadLogContent`, update the footer to show source:

```javascript
// Replace the footer line:
var sourceLabel = source === 'bot' ? 'Бот' : 'Панель';
footer.innerHTML = '<span>Показано: ' + data.lines.length + ' из ' + data.total_lines + '</span><span>' + sourceLabel + ' / ' + esc(filename) + '</span>';
```

- [ ] **Step 6: Add source badge CSS**

Add to `admin.css` before the responsive section:

```css
/* ─── Source badges ──────────────────────────────────────────────────── */
.log-filter-group select optgroup.source-bot {
    color: #f59e0b;
    font-weight: 600;
}
.log-filter-group select optgroup.source-panel {
    color: var(--accent);
    font-weight: 600;
}
.log-filter-group select option {
    color: var(--text);
    font-weight: 400;
}

.log-source-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 10px;
    margin-right: 6px;
}
.log-source-badge.bot {
    background: rgba(245,158,11,0.15);
    color: #f59e0b;
}
.log-source-badge.panel {
    background: rgba(79,110,247,0.15);
    color: var(--accent);
}
```

- [ ] **Step 7: Commit**

```bash
git add app/static/admin.html app/static/js/admin.js app/static/css/admin.css
git commit -m "feat: multi-source log viewer with bot/panel filter and visual badges"
```

---

### Task 4: Deploy to server

**Covers:** Upload updated code, restart service

**Files:**
- Server: `/opt/web/` (all modified files)

- [ ] **Step 1: Upload modified files to server**

Upload: `config.py`, `.env.example`, `app/admin_routes.py`, `app/static/admin.html`, `app/static/js/admin.js`, `app/static/css/admin.css`

- [ ] **Step 2: Update .env on server**

Ensure `BOT_LOGS_DIR='/opt/bot/logs'` is in `/opt/web/.env`

- [ ] **Step 3: Restart service**

```bash
systemctl restart web_admin
```

- [ ] **Step 4: Verify**

Check `https://bot.dlab.run/admin` — Logs tab should show files from both sources with source badges.

- [ ] **Step 5: Cleanup temp files**

Remove `tmp_logs.py` from project root.
