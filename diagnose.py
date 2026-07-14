import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

# 1. Check if vks-modal.html has display:none
print("=== 1. vks-modal.html overlay ===")
_, out, _ = ssh.exec_command('grep "modal-overlay" /opt/web_test/app/static/partials/vks-modal.html')
print(out.read().decode().strip())

# 2. Check if event-modal.html onclick matches function name
print("\n=== 2. event-modal.html onclick ===")
_, out, _ = ssh.exec_command('grep "onclick" /opt/web_test/app/static/partials/event-modal.html')
print(out.read().decode().strip())

# 3. Check events.js function names
print("\n=== 3. events.js function names ===")
_, out, _ = ssh.exec_command('grep "^function\\|^async function" /opt/web_test/app/static/js/events.js')
print(out.read().decode().strip())

# 4. Check vks-modal.js function names
print("\n=== 4. vks-modal.js function names ===")
_, out, _ = ssh.exec_command('grep "^function\\|^async function" /opt/web_test/app/static/js/vks-modal.js')
print(out.read().decode().strip())

# 5. Check auth.js login/logout
print("\n=== 5. auth.js login/logout ===")
_, out, _ = ssh.exec_command('grep "^async function login\\|^async function logout\\|showLogin\\|showMain" /opt/web_test/app/static/js/auth.js')
print(out.read().decode().strip())

# 6. Check if vks-board.js onclick uses correct function
print("\n=== 6. vks-board.js onclick ===")
_, out, _ = ssh.exec_command('grep "onclick" /opt/web_test/app/static/js/vks-board.js')
print(out.read().decode().strip())

# 7. Check events.js onclick in cards
print("\n=== 7. events.js card onclick ===")
_, out, _ = ssh.exec_command('grep "onclick" /opt/web_test/app/static/js/events.js')
print(out.read().decode().strip())

# 8. Check calendar.js onclick
print("\n=== 8. calendar.js onclick ===")
_, out, _ = ssh.exec_command('grep "onclick.*openAdd\\|onclick.*openEdit" /opt/web_test/app/static/js/calendar.js')
print(out.read().decode().strip())

ssh.close()
