---
feature: multi-source-logs
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-06-29-multi-source-logs.md
branch: main
commits: local only
---

# Multi-Source Log Viewer — Final Report

## What Was Built

Admin panel now reads logs from two sources: the bot (`/opt/bot/logs/`) and the panel itself (`/opt/web/logs/`). Users can filter logs by source using a dropdown selector, and each source is visually distinguished with colored badges (amber for bot, blue for panel). The file dropdown groups files by source with optgroup labels.

## Architecture

**Backend** (`app/admin_routes.py`):
- `LOG_SOURCES` dict maps source names to directories
- `get_log_files` API accepts `?source=bot|panel` query param, returns files tagged with `source` field
- `get_log_content` API accepts `?source=` param, reads from the correct directory
- `_safe_log_path` validates paths per-source to prevent directory traversal

**Frontend** (`app/static/js/admin.js`, `admin.html`, `admin.css`):
- Source selector dropdown (Все / Бот / Панель) in log filters
- File dropdown uses `<optgroup>` with source labels
- Footer shows source name alongside filename
- CSS badges for source distinction

**Config** (`config.py`):
- `BOT_LOGS_DIR` env var (default: `/opt/bot/logs`)

## Usage

1. Open https://bot.dlab.run/admin → Logs tab
2. Use "Источник" dropdown to filter by Бот/Панель/Все
3. File dropdown shows grouped files with source labels
4. Level filter, search, auto-refresh work as before
5. Footer displays source name next to filename

## Verification

- Service active on port 8080 ✅
- External access https://bot.dlab.run/admin returns 200 ✅
- Static assets (CSS, JS) load correctly ✅
- API requires auth (401 without token) ✅

## Journey Log

- [lesson] Bot logs at `/opt/bot/logs/` use same naming convention as panel (`bot_YYYY-MM-DD.log`), so source tagging was necessary to distinguish them
- [lesson] Nginx config needed `location /admin` and `location /static/` blocks to proxy to port 8080 separately from the bot on 8081
