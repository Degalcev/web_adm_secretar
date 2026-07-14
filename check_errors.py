import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

script = r'''
import urllib.request
import re

# Fetch the page
r = urllib.request.urlopen('http://127.0.0.1:8082/admin')
html = r.read().decode()

# Check all JS files load (200)
js_files = re.findall(r'src="/static/js/([^"?]+)', html)
print(f"JS files in index.html: {len(js_files)}")

for f in js_files:
    try:
        jr = urllib.request.urlopen(f'http://127.0.0.1:8082/static/js/{f}')
        content = jr.read().decode()
        # Check for syntax errors by looking for common issues
        if 'function closeEventModal()' in content and 'events.js' in f:
            print(f"CONFLICT: {f} defines closeEventModal()")
        if 'function saveEvent()' in content and 'events.js' in f:
            print(f"CONFLICT: {f} defines saveEvent()")
        print(f"  {f}: OK ({len(content)} bytes)")
    except Exception as e:
        print(f"  {f}: ERROR {e}")

# Check partials load
for p in ['vks-modal.html', 'user-modal.html', 'organizer-modal.html', 'location-modal.html', 'event-modal.html']:
    try:
        pr = urllib.request.urlopen(f'http://127.0.0.1:8082/static/partials/{p}')
        content = pr.read().decode()
        # Check for display:none on overlays
        if 'style="display:none"' in content and 'modal-overlay' in content:
            print(f"  WARNING: {p} has inline display:none on modal-overlay")
        print(f"  {p}: OK ({len(content)} bytes)")
    except Exception as e:
        print(f"  {p}: ERROR {e}")
'''

sftp = ssh.open_sftp()
with sftp.file('/tmp/check_err.py', 'w') as f:
    f.write(script)
sftp.close()

_, out, _ = ssh.exec_command('python3 /tmp/check_err.py')
print(out.read().decode())
ssh.close()
