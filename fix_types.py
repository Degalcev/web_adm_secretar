import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')

updates = [
    ("Интервью", "Встреча"),
    ("Координация", "Совещание"),
    ("Презентация", "Совещание"),
    ("Согласование", "Совещание"),
    ("Нарада", "Совещание"),
    ("Отчёт", "Совещание"),
    ("Ставка", "Совещание"),
    ("Обзор", "Совещание"),
    ("Брифинг", "Совещание"),
    ("Планёрка", "Совещание"),
    ("Селектор", "Совещание"),
    ("Доклад", "Совещание"),
]

for old, new in updates:
    _, out, _ = ssh.exec_command(f"sudo -u postgres psql -d test_db -c \"UPDATE events SET type = '{new}' WHERE type = '{old}';\"")
    result = out.read().decode().strip()
    if 'UPDATE' in result:
        count = result.split()[-1]
        print(f"{old} -> {new}: {count}")

# Итог
_, out, _ = ssh.exec_command("sudo -u postgres psql -d test_db -c \"SELECT type, count(*) FROM events GROUP BY type ORDER BY count DESC;\"")
print("\n=== Итог ===")
print(out.read().decode())

ssh.close()
