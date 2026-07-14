import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

# Count before
_, out, _ = ssh.exec_command("sudo -u postgres psql -d test_db -c \"SELECT type, count(*) FROM events GROUP BY type;\"")
print("=== До ===")
print(out.read().decode())

# Update VKS -> ВКС
_, out2, _ = ssh.exec_command("sudo -u postgres psql -d test_db -c \"UPDATE events SET type = 'ВКС' WHERE type = 'VKS';\"")
print(out2.read().decode())

# Count after
_, out3, _ = ssh.exec_command("sudo -u postgres psql -d test_db -c \"SELECT type, count(*) FROM events GROUP BY type;\"")
print("=== После ===")
print(out3.read().decode())

ssh.close()
