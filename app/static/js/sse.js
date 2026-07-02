// ─── SSE: реалтайм обновления от бота ───────────────────────────────

let _eventSource = null;

function connectSSE() {
    if (_eventSource) _eventSource.close();
    console.log('SSE: connecting to /admin/api/events/stream');
    _eventSource = new EventSource('/admin/api/events/stream');

    _eventSource.onopen = () => {
        console.log('SSE: connected');
    };

    _eventSource.onmessage = (e) => {
        console.log('SSE: received', e.data);
        try {
            const data = JSON.parse(e.data);
            handleSSEEvent(data);
        } catch (err) {
            console.log('SSE: parse error', err);
        }
    };

    _eventSource.onerror = (e) => {
        console.log('SSE: error', e);
        _eventSource.close();
        setTimeout(connectSSE, 5000);
    };
}

function handleSSEEvent(data) {
    if (data.table_name === 'events') {
        preloadAllData().then(() => {
            if (document.getElementById('page-dashboard')?.classList.contains('active')) {
                renderDashboard();
            }
        });
    }
}

function initSSE() {
    connectSSE();
}
