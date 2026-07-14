# План оптимизации календаря VKS v2

## Контекст

Календарь интегрирован (v1.0.277), работает, но содержит хардкод цветов, баг с now-line таймером и избыточный код.

**Файлы:**
- `app/static/js/calendar.js` — 336 строк
- `app/static/css/calendar.css` — 433 строки
- `app/static/css/base.css` — темы (8 шт.)

---

## Задача 1: Исправить now-line таймер (баг)

**Проблема:** `setInterval(calUpdateNowLine, 60000)` запускается при `initCalendar()`. Интервал начинается с момента вызова, НЕ привязан к текущему времени. Если пользователь зашёл в 14:07:30, first update через 60с = 14:08:30, а не 14:08:00. Полоска "прыгает" раз в минуту вместо плавного движения.

**Решение:**
```js
function calStartNowLineTimer() {
    if (calNowLineTimer) clearInterval(calNowLineTimer);
    calUpdateNowLine();
    // Следующий тик — через остаток до следующей минуты
    const now = new Date();
    const msUntilNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    calNowLineTimer = setTimeout(function tick() {
        calUpdateNowLine();
        calNowLineTimer = setTimeout(tick, 60000);
    }, msUntilNextMin);
}
```

**Сложность:** Низкая
**Результат:** now-line обновляется точно каждую минуту, привязан к реальному времени

---

## Задача 2: Заменить хардкод цветов на CSS color-mix()

**Проблема:** 12 мест с захардкоженными rgba-цветами, не адаптируются под тему.

**Замены:**

| Селектор | Было | Стало |
|----------|------|-------|
| `.cal-ev` | `rgba(34,211,238,0.2)` | `color-mix(in srgb, var(--accent) 20%, transparent)` |
| `.cal-ev.h1` | `rgba(74,222,128,0.2)` | `color-mix(in srgb, var(--success) 20%, transparent)` |
| `.cal-ev.h2` | `rgba(251,191,36,0.2)` | `color-mix(in srgb, var(--warning) 20%, transparent)` |
| `.cal-ev.h3` | `rgba(248,113,113,0.2)` | `color-mix(in srgb, var(--danger) 20%, transparent)` |
| `.cal-ev:hover.h0` | `rgba(45,210,230,0.95)` | `color-mix(in srgb, var(--accent) 75%, var(--bg))` |
| `.cal-ev:hover.h1` | `rgba(60,220,120,0.95)` | `color-mix(in srgb, var(--success) 75%, var(--bg))` |
| `.cal-ev:hover.h2` | `rgba(230,190,50,0.95)` | `color-mix(in srgb, var(--warning) 75%, var(--bg))` |
| `.cal-ev:hover.h3` | `rgba(240,110,110,0.95)` | `color-mix(in srgb, var(--danger) 75%, var(--bg))` |
| `.now-time` | `rgba(248,113,113,0.3)` | `color-mix(in srgb, var(--danger) 30%, transparent)` |
| `box-shadow ×3` | `rgba(0,0,0,0.15)` | `var(--shadow-sm)` (новая переменная) |
| `.cal-ev:hover` | `rgba(0,0,0,0.35)` | `var(--shadow-lg)` (новая переменная) |

**Hover текст:** `#1a1a1a` → `var(--bg)` (адаптируется к теме)

**Сложность:** Низкая
**Результат:** Все цвета автоматически следуют теме

---

## Задача 3: Добавить shadow-переменные в темы

**Файл:** `app/static/css/base.css`

Добавить в каждую тему:
```css
--shadow-sm: 0 1px 6px rgba(0, 0, 0, 0.15);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.35);
```

Для светлых тем (starWars, vision):
```css
--shadow-sm: 0 1px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
```

**Сложность:** Низкая
**Результат:** Тени следуют теме

---

## Задача 4: Убрать дублирование месяцев в JS

**Проблема:** `CAL_MONTHS_FULL` (строка 10) и `months` (строка 105 в toolbar) — разные массивы для одного и того же.

**Решение:** Удалить `months` на строке 105, использовать `CAL_MONTHS_FULL`:
```js
CAL_MONTHS_FULL.forEach((m, i) => {
    const sel = i === calActiveDay.getMonth() ? ' selected' : '';
    html += `<option value="${i}"${sel}>${m}</option>`;
});
```

**Сложность:** Низкая
**Результат:** Единый источник для месяцев

---

## Задача 5: Убрать CSS hover background (конфликт с JS)

**Проблема:** CSS `.cal-ev:hover` задаёт `background: var(--bg-elevated)`, но JS hover (`_calOnEvEnter`) полностью перехватывает управление стилями через inline. Двойное управление.

**Решение:** Из CSS `.cal-ev:hover` оставить только:
- `z-index: 100`
- `box-shadow: var(--shadow-lg)`
- `min-height: fit-content`

Убрать: `background`, `border`, `opacity`, `overflow`, `font-size` — это управляет JS.

**Сложность:** Низкая
**Результат:** Единый источник стилей hover — JS

---

## Задача 6: Оптимизация now-line DOM

**Проблема:** `calUpdateNowLine()` каждые 60с делает 6+ `createElement` + `removeChild`. На странице с 10 локациями = 20 DOM-операций.

**Решение:** Кэшировать DOM-элементы, обновлять только `style.top`:
```js
// При первом вызове — создать, сохранить ссылки
// При последующих — обновить top
```

**Сложность:** Средняя
**Результат:** Меньше DOM-манипуляций

---

## Порядок выполнения

| # | Задача | Сложность | Зависимости |
|---|--------|-----------|-------------|
| 1 | Now-line таймер баг | Низкая | — |
| 2 | Хардкод цветов → color-mix | Низкая | — |
| 3 | Shadow-переменные в темы | Низкая | — |
| 4 | Дублирование месяцев | Низкая | — |
| 5 | Убрать CSS hover | Низкая | Задача 2 |
| 6 | Now-line DOM оптимизация | Средняя | Задача 1 |

Задачи 1-4 независимы, можно делать параллельно.

---

## Верификация

1. Календарь отображается корректно на всех 8 темах
2. Now-line обновляется точно каждую минуту
3. Hover работает: элемент расширяется, текст читается
4. Нет хардкода rgba/hex в calendar.css
5. Цвета элементов следуют цветовой схеме темы
