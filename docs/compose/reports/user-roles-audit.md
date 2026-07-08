---
feature: user-roles-audit
status: delivered
specs:
  - docs/compose/specs/2026-07-03-user-roles-audit-design.md
plans:
  - docs/compose/plans/2026-07-03-user-roles-audit.md
branch: develop
commits: bac1824
---

# Роли пользователей и аудит изменений — Final Report

## What Was Built

Система ролей пользователей (admin/user) с разграничением прав доступа и аудитом изменений VKS-событий. Администраторы видят всё, обычные пользователи — только Dashboard и VKS. При каждом изменении VKS-события сохраняется информация о том, кто, когда и что сделал. Эта информация отображается в модалке VKS.

## Architecture

### Модель данных

**User** — новые поля: `first_name`, `last_name`, `patronymic`, `username` (все nullable).

**Event** — audit-поля: `last_changed_by` (user_id), `last_changed_at` (datetime), `last_change_action` (create/update/complete/delete).

### Backend

- `auth_required` декоратор — допускает admin и user роли (в `app/auth.py`)
- `admin_required` — только для маршрутов Администрирования (users, organizers, locations, logs)
- VKS/document маршруты используют `@auth_required`
- Маршрут `/admin/api/users/me` — возвращает текущего пользователя (для определения роли на фронте)
- `get_events_handler` — resolve user name для audit-полей через `get_user_by_id`

### Frontend

- `checkAuth()` — запрашивает `/me` и сохраняет `window.currentUserRole`
- `applyRoleRestrictions()` — скрывает nav-group "Администрирование" и "Настройки" для non-admin
- `switchPage()` — блокирует переход на admin-страницы для non-admin
- Модалка VKS — отображает строку аудита "Последнее изменение: [ФИО], [дата] — [действие]"

### Design Decisions

- `auth_required` раздельно от `admin_required` — чтобы не менять существующие admin-маршруты
- Audit resolve имен через `get_user_by_id` в цикле — просто, достаточно для ≤100 событий
- Новые поля user nullable — обратная совместимость со старыми записями

## Usage

- Вход: любой пользователь с `max_id` + пароль (раньше только admin)
- Non-admin: видит Dashboard + VKS, не видит Администрирование
- Аудит: при создании/редактировании/завершении VKS — автоматически сохраняется
- Форма пользователя: новые поля ФИО и username

## Verification

- Деплой: v1.0.141
- Миграция: 7 столбцов добавлены (4 User + 3 Event)
- Тест: http://45.90.217.225:8082/admin

## Journey Log

- [lesson] `create_all(checkfirst=True)` не добавляет столбцы к существующим таблицам — нужна SQL-миграция через ALTER TABLE
- [lesson] Audit resolve имён в цикле (N+1) —.acceptable для ≤100 событий, для масштаба нужен JOIN

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-07-03-user-roles-audit-design.md` | Спецификация | Секции S1-S9 |
| `docs/compose/plans/2026-07-03-user-roles-audit.md` | План реализации | 8 задач |
