# VKS Documents — Карточки с отдельной кнопкой удалить

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent or compose:execute.

**Goal:** Заменить inline-удаление документов в модалке VKS на карточный вид с отдельной кнопкой удалить справа от каждой карточки + длинная кнопка "Добавить документ" под списком.

**Architecture:** Изменения затрагивают 3 файла: CSS (новые стили карточек), JS (рендер refreshEventDocs), HTML (замена секции документов в модалке).

**Tech Stack:** Vanilla CSS/JS, существующие CSS-переменные проекта.

## Global Constraints
- Использовать CSS-переменные проекта (var(--accent), var(--surface) и т.д.)
- Hover-эффекты на карточках и кнопках
- Обрезка длинных имён файлов через text-overflow: ellipsis
- Кнопка "Добавить документ" — 100% ширины, пунктирная рамка, margin-top: 10px
- Кнопка удалить — отдельный 36px блок справа от карточки
- На мобильном: компактнее

---

### Task 1: CSS — Стили карточек документов

**Files:**
- Modify: `app/static/css/vks.css` — добавить новые стили после существующих `.event-doc-*`

**Steps:**

- [ ] **Step 1: Добавить CSS карточек документов**

В `app/static/css/vks.css` после существующих стилей `.event-doc-*` (после ~строки 519) добавить:

```css
/* ─── Doc Cards (variant: standalone delete) ────────────────── */
.doc-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-card-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.doc-card {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all var(--motion-fast) var(--ease-standard);
}

.doc-card::before {
  content: '';
  position: absolute;
  top: 0; left: -100%; width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(34,211,238,0.06), transparent);
  transition: left 0.5s ease;
}

.doc-card:hover {
  border-color: var(--accent);
}

.doc-card:hover::before {
  left: 100%;
}

.doc-card:hover .doc-card-icon {
  transform: scale(1.08);
}

.doc-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5rem;
  font-weight: 700;
  flex-shrink: 0;
  transition: transform var(--motion-fast) var(--ease-standard);
}

.doc-card-info {
  flex: 1;
  min-width: 0;
}

.doc-card-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-card-meta {
  font-size: 0.625rem;
  color: var(--fg-subtle);
  margin-top: 1px;
}

.doc-card-pending {
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: rgba(34, 211, 238, 0.12);
  color: var(--accent);
  flex-shrink: 0;
}

.doc-card-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid rgba(248,113,113,0.12);
  background: transparent;
  color: var(--fg-subtle);
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease-standard);
}

.doc-card-delete:hover {
  background: rgba(248,113,113,0.1);
  border-color: rgba(248,113,113,0.3);
  color: var(--danger);
}

.doc-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  margin-top: 10px;
  border-radius: 8px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: all var(--motion-fast) var(--ease-standard);
}

.doc-add-btn:hover {
  border-color: var(--accent);
  background: rgba(34,211,238,0.08);
}
```

- [ ] **Step 2: Добавить мобильные стили**

В `app/static/css/responsive.css` в секцию модалок (~строка 178) добавить:

```css
  /* Doc cards — compact */
  .doc-card { padding: 8px 10px; gap: 8px; }
  .doc-card-icon { width: 30px; height: 30px; font-size: 0.4375rem; }
  .doc-card-delete { width: 30px; }
  .doc-card-delete svg { width: 12px; height: 12px; }
  .doc-add-btn { padding: 6px 10px; font-size: 0.75rem; }
```

- [ ] **Step 3: Commit**

```bash
git add app/static/css/vks.css app/static/css/responsive.css
git commit -m "feat: стили карточек документов с отдельной кнопкой удалить"
```

---

### Task 2: JS — Рендер карточек документов

**Files:**
- Modify: `app/static/js/vks.js:661-687` — функция `refreshEventDocs()`

**Steps:**

- [ ] **Step 1: Переписать refreshEventDocs()**

Заменить функцию `refreshEventDocs()` (строки 661-687) на:

```javascript
function refreshEventDocs() {
    const docsContainer = document.getElementById('f-event-docs');

    const existing = (editingEventId)
        ? (allEvents.find(x => x.id === editingEventId)?.documents || [])
            .filter(d => !removedDocIds.includes(d.id))
        : [];

    const all = [
        ...existing.map(d => ({ id: d.id, name: d.name, size: d.size, pending: false })),
        ...pendingFiles.map((f, i) => ({ id: `pending-${i}`, name: f.name, size: f.size, pending: true }))
    ];

    if (all.length) {
        docsContainer.innerHTML = all.map(d => {
            const ext = (d.name || '').split('.').pop().toLowerCase();
            const icon = getDocIcon(ext);
            const deleteBtn = d.pending
                ? `<button class="doc-card-delete" onclick="event.stopPropagation();removePendingFile('${d.id}')" title="Убрать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`
                : `<button class="doc-card-delete" onclick="event.stopPropagation();removeExistingDoc('${d.id}')" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>`;
            const clickAttr = d.pending ? '' : `onclick="event.stopPropagation();downloadDoc('${d.id}','${esc(d.name)}')"`;
            const pendingBadge = d.pending ? '<span class="doc-card-pending">новый</span>' : '';
            const sizeText = d.size ? `<span>${formatSize(d.size)}</span>` : '';
            return `<div class="doc-card-row"><div class="doc-card ${d.pending ? '' : 'event-doc-downloadable'}" ${clickAttr}><div class="doc-card-icon ${icon.cls}">${icon.label}</div><div class="doc-card-info"><div class="doc-card-name">${esc(d.name)}</div><div class="doc-card-meta">${sizeText}${pendingBadge}</div></div></div>${deleteBtn}</div>`;
        }).join('');
    } else {
        docsContainer.innerHTML = '';
    }
}
```

- [ ] **Step 2: Проверить getDocIcon — должен возвращать {cls, label}**

Найти `getDocIcon` и убедиться что он возвращает объект с `cls` и `label`. Если нет — адаптировать.

- [ ] **Step 3: Commit**

```bash
git add app/static/js/vks.js
git commit -m "feat: рендер документов карточками с отдельной кнопкой удалить"
```

---

### Task 3: HTML — Замена секции документов в модалке

**Files:**
- Modify: `app/static/index.html:866-880` — секция документов в event-modal

**Steps:**

- [ ] **Step 1: Заменить секцию документов**

Заменить строки 866-880 (секция `<!-- Документы -->`) на:

```html
      <!-- Документы -->
      <div id="f-event-docs-group" style="display:none">
        <div class="form-separator">
          <div class="docs-header">
            <span class="docs-label" id="f-event-docs-count"></span>
          </div>
          <div id="f-event-docs" class="doc-card-list"></div>
          <label class="doc-add-btn" id="event-doc-upload-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Добавить документ
            <input type="file" id="event-doc-upload" style="display:none" multiple onchange="addPendingFiles(this.files); this.value=''">
          </label>
        </div>
      </div>
```

- [ ] **Step 2: Обновить JS для подсчёта документов**

В `refreshEventDocs()` добавить обновление счётчика. После формирования `all`, добавить:

```javascript
const countEl = document.getElementById('f-event-docs-count');
if (countEl) {
    countEl.textContent = all.length ? `${all.length} ${all.length === 1 ? 'документ' : all.length < 5 ? 'документа' : 'документов'}` : 'Нет документов';
}
```

- [ ] **Step 3: Commit**

```bash
git add app/static/index.html app/static/js/vks.js
git commit -m "feat: секция документов модалки — карточки + кнопка добавить"
```

---

### Task 4: Проверка и деплой

**Steps:**

- [ ] **Step 1: Проверить синтаксис Python**

```bash
python -m py_compile app/server.py
```

- [ ] **Step 2: Проверить что HTML валиден** — убедиться что все теги закрыты

- [ ] **Step 3: Git push**

```bash
git push origin develop
```

- [ ] **Step 4: Деплой на test**

```bash
python deploy/deploy.py test
```

- [ ] **Step 5: Проверить на test сервере** — открыть VKS модалку, проверить карточки документов и кнопку удалить
