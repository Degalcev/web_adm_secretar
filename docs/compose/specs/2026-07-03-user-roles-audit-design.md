# Спецификация: Роли пользователей и аудит изменений

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/user-roles-audit.md)

## [S1] Проблема

Сейчас все пользователи панели — администраторы. Нет роли "обычный пользователь". Нет аудита изменений VKS-событий (кто, когда, что изменил). Модель пользователя содержит только поле `name` без ФИО.

## [S2] Модель пользователя — расширение полей

**Текущая модель User:**
```python
name = mapped_column(String())  # одно поле
status = mapped_column(String())  # 'admin' / 'user'
```

**Новая модель:**
```python
first_name = mapped_column(String(), nullable=True)   # Имя
last_name = mapped_column(String(), nullable=True)     # Фамилия
patronymic = mapped_column(String(), nullable=True)    # Отчество
username = mapped_column(String(), nullable=True)      # Юзернейм
```

Поле `name` оставляем для обратной совместимости (заполняется из first_name + last_name).

## [S3] Авторизация — роли пользователей

**Текущая логика (auth.py:121):**
```python
if not user or user.status != 'admin':
    return 403 "Доступ только для администраторов"
```

**Новая логика:**
- Вход разрешён для `admin` и `user`
- `admin_required` — только для маршрутов Администрирования (users, organizers, locations, logs)
- Новый декоратор `auth_required` — для всех остальных маршрутов (VKS, dashboard, documents)
- Обычные пользователи видят: Dashboard, VKS (текущие/завершённые)
- Администраторы видят всё + Администрирование

## [S4] Скрытие Администрирования для non-admin

**Backend:**
- `/admin/api/users`, `/admin/api/organizers`, `/admin/api/locations`, `/admin/api/logs` — `@admin_required`
- `/admin/api/events/*`, `/admin/api/documents/*` — `@auth_required` (доступно всем)
- `/admin/api/users/me` — новый маршрут, возвращает текущего пользователя (для определения роли на фронте)

**Frontend:**
- При загрузке страницы запрашивать `/admin/api/users/me`
- Если `status != 'admin'` — скрыть nav-group "Администрирование" через CSS/JS
- Проверка при навигации: если URL начинается с `/admin/` и пользователь не admin — редирект на dashboard

## [S5] Аудит изменений VKS-событий

**Текущая модель Event:**
```python
updated_at = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**Новые поля:**
```python
last_changed_by = mapped_column(String(), nullable=True)     # user_id кто изменил
last_changed_at = mapped_column(DateTime, nullable=True)     # когда изменил
last_change_action = mapped_column(String(), nullable=True)  # что сделал (create/update/complete/delete)
```

**Логика:**
- При создании события: `last_changed_by = current_user.id`, `last_change_action = 'create'`
- При обновлении: аналогично с `action = 'update'`
- При завершении: `action = 'complete'`
- При удалении: `action = 'delete'` (перед удалением)

## [S6] Отображение аудита в модалке VKS

**UI:**
- В модалке VKS (при редактировании) показывать строку:
  `Последнее изменение: [ФИО] [Дата] [Время] — [действие]`
- Отображать только если `last_changed_by` не null
- Стиль: мелкий серый текст под заголовком модалки

## [S7] Предложения по дополнительным механизмам

### 7.1 Журнал аудита (Audit Log)
Отдельная страница/раздел в логах для отслеживания всех действий пользователей:
- Кто создал/изменил/удалил событие
- Кто вошёл в систему
- Кто изменил организатора/локацию
- Фильтры по пользователю, действию, дате

### 7.2 Ограничения прав для non-admin
- Обычные пользователи не могут: создавать/уделять организаторов, локации, пользователей
- Обычные пользователи могут: создавать/редактировать/завершать VKS-события, загружать документы
- Настройка: опционально запретить удаление событий для non-admin

### 7.3 Профиль пользователя
- Страница "Профиль" (существует `page-profile`) — показывать/редактировать ФИО, username, смена пароля
- Администратор может редактировать профиль любого пользователя

### 7.4 Активные сессии
- Показать список активных сессий пользователя (IP, User-Agent, дата входа)
- Возможность завершить сессию (для себя или админу для любого)

### 7.5 Уведомления о изменениях
- При изменении VKS-события другим пользователем — SSE уведомление
- Уже реализовано через PostgreSQL триггеры + SSE, но можно добавить метаданные (кто изменил)

## [S8] Файлы для изменения

| Файл | Изменения |
|---|---|
| `database/models.py` | Новые поля User + Event |
| `database/sending.py` | Обновить add_user, update_user, add_event, update_event |
| `database/requests.py` | get_user_by_id возвращает все поля |
| `app/auth.py` | Новый `auth_required`, изменить `admin_login` |
| `app/routes/users.py` | Новый маршрут `/me`, обновить create/update |
| `app/routes/vks.py` | Передавать user_id в audit поля |
| `app/static/js/auth.js` | Запрос роли при входе |
| `app/static/js/navigation.js` | Скрытие Администрирования |
| `app/static/js/vks.js` | Отображение аудита в модалке |
| `app/static/js/users.js` | Новые поля в форме |
| `app/static/index.html` | Новые поля в форме пользователя |
| `app/static/css/` | Стили для аудит-строки |

## [S9] Порядок реализации

1. Миграция БД (новые поля User + Event)
2. Backend: auth_required + роли
3. Backend: аудит в VKS
4. Frontend: скрытие Администрирования
5. Frontend: аудит в модалке VKS
6. Frontend: новые поля пользователя
