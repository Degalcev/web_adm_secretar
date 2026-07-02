// ─── Auto-update checker ─────────────────────────────────────────────

let _currentVersion = null;
const CHECK_INTERVAL = 60000;
let _topbarInterval = null;

async function checkVersion() {
    try {
        const resp = await fetch('/version.json?t=' + Date.now());
        if (!resp.ok) return;
        const data = await resp.json();

        const badge = document.getElementById('env-badge');
        if (badge && data.env) {
            badge.textContent = data.env === 'test' ? 'TEST' : '';
            badge.style.display = data.env === 'test' ? 'inline-block' : 'none';
        }

        const verEl = document.getElementById('topbar-version');
        if (verEl && data.version) {
            verEl.textContent = data.version;
        }

        if (_currentVersion && data.version !== _currentVersion) {
            window.location.reload();
        }
        _currentVersion = data.version;
    } catch (e) {}
}

function updateTopbarDateTime() {
    const el = document.getElementById('topbar-datetime');
    if (!el) return;
    const now = new Date();
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${h}:${m}:${s}`;
}

function initUpdater() {
    checkVersion();
    setInterval(checkVersion, CHECK_INTERVAL);
    updateTopbarDateTime();
    if (_topbarInterval) clearInterval(_topbarInterval);
    _topbarInterval = setInterval(updateTopbarDateTime, 1000);
}
