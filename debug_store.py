import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

script = """
import urllib.request, json

# Login first to get session cookie
import http.cookiejar
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Try to login
login_data = json.dumps({"login": "admin", "password": "ivc212"}).encode()
req = urllib.request.Request('http://127.0.0.1:8082/admin/login', data=login_data, headers={'Content-Type': 'application/json'})
try:
    r = opener.open(req)
    print('Login:', r.status)
except Exception as e:
    print('Login error:', e)

# Now check preload
try:
    r = opener.open('http://127.0.0.1:8082/admin/api/preload')
    d = json.loads(r.read())
    print('events:', len(d.get('events', [])))
    print('organizers:', len(d.get('organizers', [])))
    print('locations:', len(d.get('locations', [])))
    if d.get('organizers'):
        print('org[0]:', json.dumps(d['organizers'][0], ensure_ascii=False))
    if d.get('locations'):
        print('loc[0]:', json.dumps(d['locations'][0], ensure_ascii=False))
except Exception as e:
    print('Preload error:', e)

# Check events endpoint
try:
    r = opener.open('http://127.0.0.1:8082/admin/api/events?limit=10000')
    d = json.loads(r.read())
    if isinstance(d, dict):
        print('events endpoint: dict with keys:', list(d.keys()))
        if 'events' in d:
            print('events count:', len(d['events']))
    else:
        print('events endpoint: list with', len(d), 'items')
except Exception as e:
    print('Events error:', e)
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/debug_store.py', 'w') as f:
    f.write(script)
sftp.close()

_, out, _ = ssh.exec_command('python3 /tmp/debug_store.py')
print(out.read().decode())
ssh.close()
