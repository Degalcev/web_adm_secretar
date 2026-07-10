# Timeline Overlay — Implementation Plan

**Goal:** Drawer overlay для таймлайна, word-wrap, исправление flash формы.

---

### Task 1: CSS — drawer overlay + word-wrap

**Files:** `app/static/css/vks-modal.css`

1. Заменить `.vks-modal-body-wrapper .event-timeline` на drawer overlay стили:
   - `position: absolute; right: 0; top: 0; bottom: 0; width: 340px; z-index: 10`
   - `transform: translateX(100%)` (скрыт по умолчанию)
   - `transition: transform 0.3s ease`
   - `background: var(--bg-elevated); border-left: 1px solid var(--border)`

2. Добавить `.vks-modal-body-wrapper.timeline-open .event-timeline`:
   - `transform: translateX(0)` (показан)

3. Добавить `.vks-modal-body-wrapper.timeline-open .modal-body`:
   - `opacity: 0.3; pointer-events: none` (dimmed)

4. Добавить `.timeline-change` word-wrap:
   - `overflow-wrap: break-word; word-wrap: break-word`

5. Mobile override: drawer = `inset: 0; width: 100%`

### Task 2: JS — drawer show/hide + flash fix

**Files:** `app/static/js/vks-modal.js`

1. `loadEventHistory()`: вместо `container.style.display = 'block'` → добавить `.timeline-open` на `.vks-modal-body-wrapper`
2. `hideEventHistory()`: вместо `container.style.display = 'none'` → убрать `.timeline-open` с wrapper
3. Убрать `await` перед `loadEventSelects()` в `openEditEventModal` (строка ~89) — он создаёт async gap

### Task 3: Deploy

`git push origin develop && python deploy/deploy.py test`
