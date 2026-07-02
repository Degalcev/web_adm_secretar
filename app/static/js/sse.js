// ─── SSE: реалтайм обновления от бота ───────────────────────────────

let _eventSource = null;

function connectSSE() {
    if (_eventSource) _eventSource.close();
    _eventSource = new EventSource('/admin/api/events/stream');

    _eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleSSEEvent(data);
        } catch (err) {}
    };

    _eventSource.onerror = () => {
        _eventSource.close();
        setTimeout(connectSSE, 5000);
    };
}

function handleSSEEvent(data) {
    if (data.table_name !== 'events') return;
    // Просто перезагружаем данные дашборда
    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

function initSSE() {
    connectSSE();
}
