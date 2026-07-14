# Расширенная система мероприятий — Спецификация

## [S1] Проблема

Текущая система поддерживает только тип «ВКС». Реальные процессы включают совещания, встречи, заседания, личные приёмы — всё это не отслеживается. Нет участников, нет продолжительности, нет фильтрации по участникам, нет печати.

## [S2] Решение — обзор

Расширение модели Event: новые типы с цветами, продолжительность, участники (таблица `event_participants` привязана к `users`), организатор = организация ИЛИ сотрудник, повторяющиеся мероприятия (серия + исключения), фильтры, печать через HTML/CSS.

## [S3] Навигация — вариант A

```
📋 ВКС (без изменений)
   ├── Текущие
   └── Завершённые

📅 Мероприятия
   ├── Все
   ├── Совещания
   ├── Встречи
   ├── Заседания
   └── Личные приёмы

📆 Календарь (цвета по типам)
```

ВКС остаётся отдельным блоком — у него уникальная логика (документы, блокировка, таймлайн). Остальные типы объединены под «Мероприятия» с фильтрацией по подпунктам меню.

## [S4] Типы мероприятий и цвета

| Тип | Значение `events.type` | Цвет в календаре | CSS-переменная |
|-----|----------------------|-------------------|----------------|
| ВКС | `ВКС` | Cyan | `--accent` |
| Совещание | `Совещание` | Green | `--success` |
| Встреча | `Встреча` | Amber | `--warning` |
| Заседание | `Заседание` | Red | `--danger` |
| Личный приём | `Приём` | Серый | `--fg-muted` |

В календаре цвет карточки определяется `data-type` атрибутом, а не залом.

## [S5] Продолжительность

Поле `events.duration` (INTEGER, минуты, DEFAULT 60).

В форме:
```
Продолжительность: [60 мин ▼]
  30 мин | 45 мин | 60 мин | 90 мин | 2 часа | 3 часа
```

В календаре: высота карточки = `(duration / 60) * CAL_HOUR_H`.

## [S6] Участники

### Модель данных

```sql
CREATE TABLE event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'участник'
);
```

Все участники — сотрудники организации (users). Внешних нет.

Роли участников: `участник`, `докладчик`, `секретарь`.

### UI в модалке мероприятия

```
Участники:
┌─────────────────────────────────────────────────────┐
│ 👤 Иванов И.И.          [участник ▼]          ✕    │
│ 👤 Петров П.П.          [докладчик ▼]         ✕    │
│                                                     │
│ Начните вводить имя...                              │
│   Иванов И.И.                                       │
│   Иванова А.С.                                      │
│   Петров П.П.                                       │
└─────────────────────────────────────────────────────┘
```

Автодополнение: поиск по `users.name` / `users.username`. При выборе — добавление в список. Отправка на сервер: массив `{ user_id, role }`.

### API

```
GET  /admin/api/events/{id}/participants
POST /admin/api/events/{id}/participants  body: [{ user_id, role }]
DELETE /admin/api/events/{id}/participants/{pid}
```

## [S7] Организатор — организация ИЛИ сотрудник

### Изменение модели

```sql
ALTER TABLE events ADD COLUMN organizer_type VARCHAR(10) DEFAULT 'org';
-- 'org'  → organizer_id → organizers.id
-- 'user' → organizer_id → users.id
```

### UI в форме

```
Организатор: [Организация ▼]
  ○ Организация: [Комитет по ИТ ▼]
  ○ Сотрудник:   [Иванов И.И. ▼]
```

### Влияние на API

Текущий `events.organizer_id` сохраняется. Добавляется `organizer_type`. Backend определяет тип и возвращает:
```json
{
  "organizer_type": "org",
  "organizer_id": "uuid",
  "organizer_name": "Комитет по ИТ"
}
```

## [S8] Повторяющиеся мероприятия

### Модель данных

```sql
CREATE TABLE event_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    freq VARCHAR(10) NOT NULL,          -- weekly / monthly
    interval_val INTEGER DEFAULT 1,     -- каждые N
    by_day INTEGER[],                   -- [1,3,5] = пн,ср,пт
    until DATE,                         -- до даты
    max_occurrences INTEGER             -- макс кол-во (null = без ограничения)
);

CREATE TABLE event_series_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id UUID REFERENCES event_series(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    event_id UUID REFERENCES events(id)  -- null=пропуск, иначе=перенос
);
```

Связь `events.series_id → event_series.id`.

### Генерация экземпляров

При рендере календаря — развернуть series в экземпляры на видимый период:

```js
function expandSeries(series, weekStart, weekEnd) {
    const instances = [];
    // Вычислить даты по freq/interval/by_day/until
    // Исключить exception_date из series_exceptions
    // Для каждой даты — создать виртуальное событие
    return instances;
}
```

### UI формы

```
☐ Повторять
  Частота: [Каждую неделю ▼]
  Интервал: каждые [1] недель
  Дни: [☐Пн ☑Вт ☐Ср ☐Чт ☐Пт ☐Сб ☐Вс]
  До: [31.12.2026 ▼] или [∞]
```

## [S9] Фильтрация организаторов по частоте

### Backend

```sql
SELECT o.*, COUNT(e.id) as usage_count
FROM organizers o
LEFT JOIN events e ON e.organizer_id = o.id
GROUP BY o.id
ORDER BY usage_count DESC;
```

### UI — сортировка в select

```
Организатор: [По умолчанию ▼]
  По умолчанию (А-Я)
  По частоте использования
```

## [S10] Фильтры по участникам

На странице «Мероприятия» и в календаре — multi-select:

```
Участники: [Все ▼] [Иванов ▼] [×]
```

Логика: показывать мероприятия, где выбранный пользователь есть в `event_participants`.

Backend: `WHERE e.id IN (SELECT ep.event_id FROM event_participants ep WHERE ep.user_id = ANY($1))`

## [S11] Печать

### Формат

HTML/CSS через `window.print()` + `@media print`. Без PDF.

### Структура

```
═══════════════════════════════════════════════════
         МЕРОПРИЯТИЯ С УЧАСТИЕМ ИВАНОВА И.И.
         За период: 01.07.2026 — 31.07.2026
═══════════════════════════════════════════════════

14.07 (Пн) 10:00-11:30  ВКС
  Зал: Зал-1
  Организатор: Комитет по ИТ
  Участники: Иванов И.И., Петров П.П.

15.07 (Вт) 14:00-15:00  Совещание
  Зал: Зал-2
  Организатор: Департамент связи
  Участники: Иванов И.И., Козлов К.К.

═══════════════════════════════════════════════════
Итого: 2 мероприятия, общая продолжительность: 2ч 30мин
```

### Кнопка «Печать»

На странице «Мероприятия» и в календаре. Открывает `window.open()` с HTML-шаблоном, вызывает `window.print()`.

## [S12] Расширение API

### Изменённые endpoints

```
POST /admin/api/events        -- добавлены: duration, organizer_type, participants[]
PUT  /admin/api/events/{id}   -- добавлены: duration, organizer_type, participants[]
GET  /admin/api/events        -- добавлены фильтры: type, participant_id, from, to
```

### Новые endpoints

```
GET  /admin/api/events/{id}/participants
POST /admin/api/events/{id}/participants
DELETE /admin/api/events/{id}/participants/{pid}

GET  /admin/api/participants/search?q=иванов  -- автодополнение
GET  /admin/api/organizers?sort=usage          -- сортировка по частоте

GET  /admin/api/events/print?participant_id=&from=&to=  -- данные для печати
```

## [S13] Миграция (порядок)

1. Таблица `event_participants`
2. Таблица `event_series`
3. Таблица `event_series_exceptions`
4. `events.duration` INTEGER DEFAULT 60
5. `events.organizer_type` VARCHAR(10) DEFAULT 'org'
6. `events.series_id` UUID FK→event_series (nullable)
7. Backend: CRUD участников, расширение events, фильтры, печать
8. Frontend: UI участников в модалке, типы с цветами, фильтры, подменю

## [S14] Вопросы

- Роль участника: `участник`/`докладчик`/`секретарь` — достаточно или нужны другие?
- При удалении серии — удалять все экземпляры или оставить как одиночные?
- Печать: 한 사람의 участника или список всех за период?
- Календарь: показывать повторяющиеся серии как отдельные карточки или визуально выделять (иконка 🔁)?
