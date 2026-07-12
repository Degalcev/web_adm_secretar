# План: Redesign вкладок календаря (стиль kartoteka-nedeli.html)

## Контекст
Шаблон `templates/kartoteka-nedeli.html` показывает стиль "единая карточка" — вкладки и таблица объединены в один rounded контейнер. Активная вкладка визуально "врастает" в таблицу через tab-bridge (белый элемент скрывающий border panel под активной вкладкой).

## Что меняем
Переделываем `.cal-panel` (tabs + grid) под стиль шаблона.

## Задачи

### 1. CSS: Единая карточка `.cal-panel`
**Файл**: `app/static/css/calendar.css`
- Добавить `overflow: hidden` (для скругления углов табов)
- `box-shadow` усилить как в шаблоне: `0 2px 10px rgba(...), 0 26px 55px rgba(...), 0 8px 18px rgba(...)`
- `border-radius: var(--radius-lg)` (уже есть)

### 2. CSS: Tab Bridge
**Файл**: `app/static/css/calendar.css`
- Новый элемент `.cal-tab-bridge`:
  - `position: absolute; top: -1px; height: 2px`
  - `background: var(--bg-elevated)` (цвет фона panel — скрывает border-top)
  - `pointer-events: none`
  - `transition: left 0.18s ease, width 0.18s ease`

### 3. CSS: Вкладки (дубли `.cal-day-tab` — объединить)
**Файл**: `app/static/css/calendar.css`
- Убрать дублирующиеся правила `.cal-day-tab` (строки 113-165 и 166-214)
- Переписать в одном блоке:
  - `flex: 1; padding: 12px 4px 13px` (как в шаблоне)
  - `border-radius: 10px 10px 0 0` (скругление сверху)
  - `background: var(--surface)` (неактивные — как tab-bg в шаблоне)
  - `color: var(--fg-muted)`
  - `transition: background 0.18s ease, color 0.18s ease`
  - Hover: `background: color-mix(in srgb, var(--surface) 80%, var(--bg))` (чуть светлее)
  - Active: `background: var(--bg-elevated); color: var(--accent); font-weight: 600`
  - Weekends: `color: var(--danger)`
  - Убрать `margin-top` hover/active (шаблон не использует)
  - Убрать `box-shadow` с неактивных (тень на карточке)
  - `.dn` (день недели): `font-weight: 600; font-size: 0.875rem`
  - `.dd` (дата): `font-size: 0.6875rem; opacity: 0.7`

### 4. CSS: Контейнер табов
**Файл**: `app/static/css/calendar.css`
- `.cal-day-tabs`: `padding: 10px 10px 0; gap: 6px` (как `.tabs` в шаблоне)
- Убрать `background` (табы на фоне карточки)

### 5. CSS: `.cal-wrap` — убрать border-radius
**Файл**: `app/static/css/calendar.css`
- Убрать `border-radius: 0 0 var(--radius-lg) var(--radius-lg)` — карточка `.cal-panel` скругляет через `overflow: hidden`

### 6. JS: Bridge + позиционирование
**Файл**: `app/static/js/calendar.js`
- В `renderCalendar()` (full rebuild) добавить `<div class="cal-tab-bridge" id="cal-tab-bridge"></div>` внутрь `.cal-panel`
- Новая функция `_calPositionBridge()`:
  ```js
  function _calPositionBridge() {
      const activeTab = document.querySelector('.cal-day-tab.active');
      const panel = document.querySelector('.cal-panel');
      const bridge = document.getElementById('cal-tab-bridge');
      if (!activeTab || !panel || !bridge) return;
      const btnRect = activeTab.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      bridge.style.left = (btnRect.left - panelRect.left) + 'px';
      bridge.style.width = btnRect.width + 'px';
  }
  ```
- Вызывать `_calPositionBridge()` после:
  - `renderCalendar(true)` — full rebuild
  - `renderCalendar(false)` — partial (tab switch)
  - `resize` — window resize
- Добавить `window.addEventListener('resize', _calPositionBridge)` в `initCalendar()`

### 7. Mobile: адаптация
**Файл**: `app/static/css/calendar.css`
- В `@media (max-width: 768px)`:
  - `.cal-day-tab`: `font-size: 0.75rem; padding: 8px 4px 10px`
  - `.cal-day-tabs`: `padding: 8px 8px 0; gap: 4px`

## Файлы
1. `app/static/css/calendar.css` — CSS изменения (~60 строк перезаписано)
2. `app/static/js/calendar.js` — bridge + позиционирование (~25 строк)

## Что НЕ меняем
- Структуру грида (time column + location columns)
- Event cards (hover, color-mix, now-line)
- Toolbar (фильтры, навигация)
- Hover логику (position:fixed)
- Now-line таймер
- `.cal-col-hdr` (цветные заголовки — уже как в шаблоне)
