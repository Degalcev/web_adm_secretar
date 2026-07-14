# План: SVG shadow для calendar tab+header

## Контекст
15+ CSS-only итераций провалились. SVG `<feDropShadow>` — последняя попытка.
Текущее состояние: CSS + JS partial готовы, но путь заполнен `var(--bg-elevated)` (перекрывает контент).

## Задачи

### T1: Исправить fill SVG path
**Файл**: `app/static/js/calendar.js` (строка 229)
**Проблема**: `fill="${bgColor}"` где `bgColor = var(--bg-elevated)` — path виден и перекрывает контент
**Решение**: Заменить на `fill="rgba(0,0,0,0.01)"` — nearly invisible fill, shadow рендерится вокруг visible alpha

### T2: Проверить вызов _calUpdateShadow
**Файл**: `app/static/js/calendar.js`
**Проблема**: `_calUpdateShadow()` использует `getBoundingClientRect()` — нужен готовый DOM
**Решение**: Убедиться что вызов идёт ПОСЛЕ `innerHTML` (строка 240/254) — уже сделано, ОК

### T3: Задеплоить и проверить
- Коммит, пуш, деплой test
- Проверить на http://45.90.217.225:8082/admin/calendar/
- Тень должна быть по контуру "вкладка+заголовок", не между ними

## Критические инсайты
- `.cal-panel { z-index: 0 }` создаёт stacking context
- SVG с `z-index: -1` рисуется ПОВЕРХ фона панели но ПОД children
- `fill="rgba(0,0,0,0.01)"` обязателен — filter без visible alpha не рисует тень
- `overflow: visible` на SVG обязателен — тень расширяется за пределы path
