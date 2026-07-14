import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

# Check CSRF token function in vks-modal.js
_, out, _ = ssh.exec_command('grep -n "csrfToken\\|X-CSRF" /opt/web_test/app/static/js/vks-modal.js')
print("=== vks-modal.js CSRF ===")
print(out.read().decode())

# Check ensureOrgsAndLocs in vks-filters.js
_, out2, _ = ssh.exec_command('grep -n "credentials" /opt/web_test/app/static/js/vks-filters.js')
print("=== vks-filters.js credentials ===")
print(out2.read().decode())

# Check events.js evtSaveEvent
_, out3, _ = ssh.exec_command('grep -n "csrfToken\\|X-CSRF\\|credentials" /opt/web_test/app/static/js/events.js')
print("=== events.js CSRF ===")
print(out3.read().decode())

ssh.close()
