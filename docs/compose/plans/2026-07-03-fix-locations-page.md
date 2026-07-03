# Исправление: Локации + CSRF + esc

## Баги

1. `index.html` — дублирующийся `id="f-loc-name"` (фильтр строка 353, модалка строка 715)
2. `locations.js` — `confirmDeleteLoc()` не шлёт CSRF → 403
3. `users.js` — `confirmDelete()` не шлёт CSRF → 403
4. `utils.js` — `esc()` не экранирует `'` и `"` → ломает onclick

## Задачи

### Task 1: HTML — уникальный ID модалки локаций
`index.html:715` → `id="f-loc-name-modal"`

### Task 2: locations.js — привязать модалку к новому ID
`openAddLocationModal`, `openEditLocationModal`, `saveLocation` → `getElementById('f-loc-name-modal')`

### Task 3: locations.js — CSRF удаления
`confirmDeleteLoc()` → добавить `X-CSRF-Token`

### Task 4: users.js — CSRF удаления
`confirmDelete()` → добавить `X-CSRF-Token`

### Task 5: utils.js — esc() экранирование кавычек
Добавить `.replace(/'/g, '&#39;').replace(/"/g, '&quot;')`
