# Спецификация: Timeline overlay + исправления UI

**Дата**: 2026-07-09
**Статус**: черновик

---

## Изменения

### 1. History как overlay/drawer (вместо side panel)

Таймлайн истории — это **надвигающийся справа drawer**, который покрывает часть модалки. Под ним форма slightly dimmed (opacity/backdrop).

**Desktop (≥768px):**
- Drawer: `position: absolute`, `right: 0`, `top: 0`, `bottom: 0`, `width: 340px`
- Z-index выше `.modal-body` — drawer поверх формы
- Форма под drawer: `opacity: 0.3` + `pointer-events: none` (dimmed, не кликабельна)
- Drawer имеет自己的 scroll, `background: var(--bg-elevated)`, `border-left: 1px solid var(--border)`
- При закрытии drawer — анимация slide-out вправо

**Mobile (<768px):**
- Drawer: `position: absolute`,覆盖整个 modal body, `inset: 0`
- Форма скрыта полностью
- Кнопка "Назад" для возврата к форме

**HTML:** drawer вынесен из `.modal-body` в `.vks-modal-body-wrapper` (уже сделано). Но теперь drawer — `position: absolute` внутри wrapper.

**JS:** При показе drawer — добавить класс `.timeline-open` на wrapper. При скрытии — убрать.

### 2. Исправление flash пустой формы

Проблема: `await loadEventSelects()` в `openEditEventModal` создаёт async gap. Решение: убрать `await` — `loadEventSelects()` не требует ожидания для отображения формы. Значения organizer/location устанавливаются ПОСЛЕ rebuild select, что уже происходит.

Альтернатива: вынести `loadEventSelects()` в preload (он уже загружает organizers/locations в store). Тогда select rebuild будет синхронным из store.

### 3. Word-wrap для длинного текста

В `.timeline-change` добавить:
```css
overflow-wrap: break-word;
word-wrap: break-word;
```

---

## Изменения в файлах

| Файл | Изменение |
|------|-----------|
| `app/static/css/vks-modal.css` | Drawer overlay стили, `.timeline-open`, `.timeline-change` word-wrap, responsive |
| `app/static/js/vks-modal.js` | Drawer show/hide через классы, убрать await loadEventSelects |

---

## Тестирование

1. Desktop: клик "История" → drawer справа, форма dimmed, скролл в drawer
2. Desktop: клик "Закрыть историю" → drawer уезжает, форма активна
3. Mobile: drawer覆盖 весь modal body
4. Длинный текст в истории — обёртка по словам
5. Открытие модалки — форма сразу с данными (без flash)
