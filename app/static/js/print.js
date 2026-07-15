// ─── Печать мероприятий ────────────────────────────────────────────

async function openPrintModal() {
    const overlay = document.getElementById('event-modal-overlay');
    if (!overlay) return;

    let url = `/admin/api/events/print?limit=10000`;
    const type = _eventsTypeFilter;
    if (type) url += `&type=${encodeURIComponent(type)}`;

    try {
        const resp = await fetch(url);
        const data = await resp.json();
        const events = data.events || [];

        if (!events.length) {
            alert('Нет мероприятий для печати');
            return;
        }

        const printHTML = _generatePrintHTML(events);
        const win = window.open('', '_blank');
        win.document.write(printHTML);
        win.document.close();
        win.print();
    } catch (e) {
        console.error('Ошибка печати:', e);
        alert('Ошибка загрузки данных для печати');
    }
}

function _generatePrintHTML(events) {
    const typeFilter = _eventsTypeFilter || 'Все типы';
    const today = new Date().toLocaleDateString('ru-RU');

    let rows = '';
    events.forEach((e, i) => {
        const dateStr = e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU') : '';
        const participants = (e.participants || []).map(p => p.name).join(', ') || '—';
        rows += `
        <tr>
            <td>${i + 1}</td>
            <td>${dateStr}</td>
            <td>${e.time || ''}</td>
            <td>${e.duration || 60} мин</td>
            <td>${e.type || 'ВКС'}</td>
            <td>${e.description || ''}</td>
            <td>${participants}</td>
        </tr>`;
    });

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Мероприятия — Печать</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        .footer { margin-top: 16px; font-size: 10px; color: #999; }
    </style>
</head>
<body>
    <h1>Мероприятия</h1>
    <div class="meta">Фильтр: ${typeFilter} | Дата печати: ${today} | Всего: ${events.length}</div>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Дата</th>
                <th>Время</th>
                <th>Длит.</th>
                <th>Тип</th>
                <th>Описание</th>
                <th>Участники</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>
    <div class="footer">АДМ Секретарь — Печать мероприятий</div>
</body>
</html>`;
}
