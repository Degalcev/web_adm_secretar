import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

# Check function definitions in vks-modal.js
_, out, _ = ssh.exec_command('grep -n "function openAddEventModal\|function openEditEventModal\|function closeEventModal\|function saveEvent" /opt/web_test/app/static/js/vks-modal.js')
print('=== vks-modal.js functions ===')
print(out.read().decode())

# Check function definitions in events.js
_, out2, _ = ssh.exec_command('grep -n "function openAddEventModal\|function openEditEventModal\|function closeEventModal\|function saveEvent\|function evtOpen\|function evtClose\|function evtSave" /opt/web_test/app/static/js/events.js')
print('=== events.js functions ===')
print(out2.read().decode())

# Check auth.js login function
_, out3, _ = ssh.exec_command('grep -n "function login\|function logout" /opt/web_test/app/static/js/auth.js')
print('=== auth.js functions ===')
print(out3.read().decode())

# Check app.js for conflicts
_, out4, _ = ssh.exec_command('grep -n "function login\|function logout\|function saveEvent" /opt/web_test/app/static/js/app.js')
print('=== app.js functions ===')
print(out4.read().decode())

ssh.close()
