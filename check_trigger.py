import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

_, out, _ = ssh.exec_command("""sudo -u postgres psql -d test_db -c "
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'events';
" """)
print(out.read().decode())

ssh.close()
