# План оптимизации календаря VKS

## Контекст

Календарь VKS интегрирован в проект (v1.0.237), но содержит критические баги, дублирование кода и архитектурные проблемы. Аудит выявил 11 направлений для оптимизации.

**Файлы для изменения:**
- `app/static/js/calendar.js` — 358 строк → основные баги и дубли
- `app/static/css/calendar.css` — 363 строки → отступы, time-label, структура
- `app/static/js/navigation.js` — cleanup таймера
- `app/static/js/sse.js` — SSE-подписка на календарь

---

## Задача 1: Убрать дублирование и мёртвый код в calendar.js

**Проблема:** 6 функций определены дважды, 6 функций не используются.

### Дублирующиеся функции (удалить первые экземпляры, оставить вторые):
| Функция | Строки (первый) | Строки (второй) | Примечание |
|---|---|---|---|
| `initCalendar()` | 23-28 | 73-77 | Вторая НЕ содержит `calStartNowLineTimer()` — баг |
| `calPrevWeek()` | 81-85 | 343 | Идентичны |
| `calNextWeek()` | 87-91 | 344 | Идентичны |
| `calGoToday()` | 93-97 | 345 | Идентичны |
| `calSelectDay()` | 99-102 | 346 | Разные! Строка 99: `calActiveDay = calAddDays(calWeekStart, idx)`, строка 346: `calActiveDay = new Date(calWeekStart); calActiveDay.setDate(...)` |
| `calTimeToMin()` | 44-47 | 280-283 | Идентичны |

### Мёртвый код (удалить):
| Функция | Строки | Причина |
|---|---|---|
| `renderDayTabs()` | 113-126 | Не вызывается — renderCalendar() рендерит tabs inline |
| `calUpdateTitle()` | 106-109 | Не вызывается — заголовок рендерится inline |
| `calEventStatus()` | 54-59 | Не используется — статус вычисляется inline |
| `calGetOrgName()` | 61-64 | Не используется — логика дублируется inline |
| `calGetLocName()` | 66-69 | Не используется — логика дублируется inline |
| `calFmtFull()` | 40-42 | Не используется — заголовок форматируется через `_calFmtDate` |
| `calSetTheme()` | 352 | Не используется |
| `calAddDays()` | 30-34 | Используется только в renderDayTabs (мёртвый) и calFmtFull (мёртвый) |
| `calFmtShort()` | 36-38 | Заменена на `_calFmtShort()` |

### Решение:
1. Объединить `initCalendar()` — одна функция с `calStartNowLineTimer()`
2. Оставить **только** вторые экземпляры навигационных функций (строки 343-348)
3. Удалить все мёртвые функции
4. Вынести inline-логику статуса/организатора в отдельные хелперы (если используется >1 раза)

**Сложность:** Низкая
**Результат:** ~80 строк удалено, чистый код без конфликтов

---

## Задача 2: Исправить баг обрезки time-label 06:00

**Проблема:** Метка `06:00` positioned с `top: 0` + `transform: translateY(-50%)` — половина текста за пределами контейнера.

### Причина:
- `.cal-time-label` имеет `transform: translateY(-50%)` (calendar.css:154)
- Первая метка в цикле: `top:${(h - CAL_H_START) * CAL_HOUR_H}px` = `top: 0` при `h=6`
- `translateY(-50%)` сдвигает текст вверх — обрезается

### Решение:
1. CSS: Добавить `padding-top: 10px` на контейнер `.cal-time > div` (или внутренний div с таймлайнами)
2. JS: Первая метка `top: 0` заменить на `top: 10px`, последующие — `(h - CAL_H_START) * CAL_HOUR_H + 10px`
3. Альтернатива: убрать `translateY(-50%)` для первой метки через JS (добавить класс `.first`)

**Рекомендация:** CSS padding-top — самый чистый вариант.

**Сложность:** Низкая
**Результат:** 06:00 видна полностью

---

## Задача 3: Исправить баг `calSelectMonth()`

**Проблема:** Выбор месяца из dropdown НЕ обновляет `calWeekStart`.

### Код (строка 348):
```js
function calSelectMonth(m) { calActiveDay.setMonth(parseInt(m)); renderCalendar(); }
```

Меняет месяц `calWeekStart` остаётся в старом месяце → grid показывает события из неправильной недели.

### Решение:
```js
function calSelectMonth(m) {
    calActiveDay.setMonth(parseInt(m));
    calWeekStart = getMonday(calActiveDay); // Пересчитать неделю
    renderCalendar();
}
```

**Сложность:** Низкая
**Результат:** Месячный фильтр работает корректно

---

## Задача 4: Исправить CSS-структуру календаря

**Проблемы:**
1. `.cal-page` определён, но не используется (HTML: `#page-calendar` → `.cal-container`)
2. `.cal-wrap` не имеет верхнего отступа — tabs и grid слипаются
3. `.cal-time-header` не sticky — при прокрутке заголовок времени исчезает

### Решения:

#### 4a. Привязать стили к реальной структуре
- Переименовать `.cal-page` → `#page-calendar .cal-container` или удалить
- Убрать `margin: -2rem` (компенсация content-area padding — календарь должен иметь свой padding)

#### 4b. Отступы
```css
.cal-wrap {
    flex: 1;
    overflow: auto;
    margin: 0 12px 12px;
    padding-top: 0; /* Уже есть cal-time-header */
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
}
```
Добавить зазор между day-tabs и cal-wrap:
```css
.cal-day-tabs {
    padding: 8px 16px 4px; /* Уменьшить нижний padding */
}
```

#### 4c. Sticky time-header
```css
.cal-time-header {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 36px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
}
```

**Сложность:** Низкая
**Результат:** Визуально аккуратный календарь без обрезки и слипания

---

## Задача 5: Cleanup now-line timer при уходе со страницы

**Проблема:** `setInterval` в `calStartNowLineTimer()` никогда не останавливается.

### Решение:
В `navigation.js`, функция `switchPage()`, добавить:
```js
if (page !== 'calendar' && typeof calStopNowLineTimer === 'function') {
    calStopNowLineTimer();
}
```

**Сложность:** Низкая
**Результат:** Таймер не потребляет ресурсы на других страницах

---

## Задача 6: SSE-интеграция для календаря

**Проблема:** Календарь не обновляется при изменениях VKS на других вкладках/клиентах.

### Решение:
В `sse.js`, в обработчике `update_event`, добавить:
```js
// Обновить календарь если он активен
if (currentPage === 'calendar' && typeof renderCalendar === 'function') {
    renderCalendar();
}
```

### Ограничение:
Полный re-render при каждом SSE-событии может быть тяжёлым. Оптимизация:
- Добавить debounce (300ms) — если пришло несколько событий подряд, перерисовать один раз
- Или: обновлять только affected day (сравнить `event.date` с `calActiveDay`)

**Сложность:** Средняя
**Результат:** Live-обновление календаря

---

## Задача 7: Оптимизация re-render (разделение рендеринга)

**Проблема:** `renderCalendar()` перестраивает **весь** HTML при каждом действии.

### Решение — разделить на 3 функции:
1. `renderCalToolbar()` — toolbar (навигация + фильтры) — редко меняется
2. `renderCalTabs()` — вкладки дней — меняется при навигации по неделе
3. `renderCalGrid()` — сетка + события — меняется при смене дня

### Флаги:
```js
let _calToolbarRendered = false;

function renderCalendar(full = true) {
    if (full) {
        renderCalToolbar();
        _calToolbarRendered = true;
    }
    renderCalTabs();
    renderCalGrid();
}
```

### Вызовы:
- `calGoToday()` → `renderCalendar(true)` (перерисовать toolbar — неделя изменилась)
- `calSelectDay()` → `renderCalendar(false)` (только tabs + grid)
- `calPrevWeek()` / `calNextWeek()` → `renderCalendar(true)` (неделя изменилась)

**Сложность:** Средняя
**Результат:** Быстрый re-render при смене дня (без пересоздания toolbar)

---

## Порядок выполнения

| # | Задача | Сложность | Зависимости |
|---|--------|-----------|-------------|
| 1 | Убрать дубли и мёртвый код | Низкая | — |
| 2 | Исправить time-label 06:00 | Низкая | — |
| 3 | Исправить calSelectMonth() | Низкая | — |
| 4 | CSS-структура календаря | Низкая | — |
| 5 | Cleanup now-line timer | Низкая | Задача 1 |
| 6 | SSE-интеграция | Средняя | Задача 1 |
| 7 | Оптимизация re-render | Средняя | Задача 1 |

Задачи 2, 3, 4, 5 независимы и могут выполняться параллельно.
Задачи 6, 7 зависят от задачи 1 (после очистки кода).

---

## Верификация

После каждой задачи:
1. Открыть календарь на `http://45.90.217.225:8082/calendar/`
2. Проверить: навигация ←/→/Сегодня работает
3. Проверить: 06:00 видна полностью
4. Проверить: выбор месяца обновляет неделю
5. Проверить: now-line обновляется и исчезает при уходе
6. Проверить: SSE обновляет календарь при изменении VKS
7. Проверить: переключение между днями быстрое (нет задержки)
