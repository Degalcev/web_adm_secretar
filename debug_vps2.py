import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

# Check print.js for conflicts
_, out, _ = ssh.exec_command('grep -n "function" /opt/web_test/app/static/js/print.js')
print('=== print.js functions ===')
print(out.read().decode())

# Check all JS files for openAddEventModal, openEditEventModal, closeEventModal, saveEvent
_, out2, _ = ssh.exec_command('grep -rn "function openAddEventModal\|function openEditEventModal\|function closeEventModal\|function saveEvent" /opt/web_test/app/static/js/')
print('=== All JS function definitions ===')
print(out2.read().decode())

# Check index.html script order
_, out3, _ = ssh.exec_command('grep -n "script src" /opt/web_test/app/static/index.html')
print('=== Script order ===')
print(out3.read().decode())

ssh.close()
