// ─── Auto-update checker ─────────────────────────────────────────────

let _currentVersion = null;
const CHECK_INTERVAL = 60000; // 1 minute

async function checkVersion() {
    try {
        const resp = await fetch('/version.json?t=' + Date.now());
        if (!resp.ok) return;
        const data = await resp.json();

        // Show env badge
        const badge = document.getElementById('env-badge');
        if (badge && data.env) {
            badge.textContent = data.env === 'test' ? 'TEST' : '';
            badge.style.display = data.env === 'test' ? 'inline-block' : 'none';
        }

        // Check for new version
        if (_currentVersion && data.version !== _currentVersion) {
            window.location.reload();
        }
        _currentVersion = data.version;
    } catch (e) {
        // version.json not available — ignore
    }
}

function initUpdater() {
    checkVersion();
    setInterval(checkVersion, CHECK_INTERVAL);
}
