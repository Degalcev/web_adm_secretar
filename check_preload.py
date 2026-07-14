import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

script = """
import urllib.request, json
try:
    r = urllib.request.urlopen('http://127.0.0.1:8082/admin/api/preload')
    d = json.loads(r.read())
    print('events:', len(d.get('events', [])))
    print('organizers:', len(d.get('organizers', [])))
    print('locations:', len(d.get('locations', [])))
    if d.get('organizers'):
        print('org[0]:', json.dumps(d['organizers'][0], ensure_ascii=False))
    if d.get('locations'):
        print('loc[0]:', json.dumps(d['locations'][0], ensure_ascii=False))
except Exception as e:
    print('ERROR:', e)
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/check_preload.py', 'w') as f:
    f.write(script)
sftp.close()

_, out, _ = ssh.exec_command('python3 /tmp/check_preload.py')
print(out.read().decode())
ssh.close()
