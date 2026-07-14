import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

script = """
import urllib.request
urls = [
    'http://127.0.0.1:8082/static/partials/event-modal.html',
    'http://127.0.0.1:8082/static/js/events.js',
    'http://127.0.0.1:8082/static/js/vks-modal.js',
]
for url in urls:
    try:
        r = urllib.request.urlopen(url)
        print(f'{url.split("/")[-1]}: {r.status} ({len(r.read())} bytes)')
    except Exception as e:
        print(f'{url.split("/")[-1]}: ERROR {e}')

# Try loading index.html and check for event-modal reference
r = urllib.request.urlopen('http://127.0.0.1:8082/admin')
html = r.read().decode()
# Check key elements
for term in ['event-modal', 'evt-modal', 'vks-modal', 'login-screen', 'main-screen']:
    count = html.count(term)
    print(f'{term}: {count} occurrences')
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/diag2.py', 'w') as f:
    f.write(script)
sftp.close()

_, out, _ = ssh.exec_command('python3 /tmp/diag2.py')
print(out.read().decode())

ssh.close()
