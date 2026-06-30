#!/usr/bin/env python3
"""Копирование данных через Python и SQLAlchemy."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    return exit_code, out + err


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        # Создаём Python скрипт на VPS для копирования
        script = '''
import psycopg2

# Подключение к test (источник)
src = psycopg2.connect(dbname="test", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")
src_cursor = src.cursor()

# Подключение к test_db (приёмник)
dst = psycopg2.connect(dbname="test_db", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")
dst.autocommit = False
dst_cursor = dst.cursor()

# Очистка
dst_cursor.execute("DELETE FROM events")
dst_cursor.execute("DELETE FROM documents")
dst_cursor.execute("DELETE FROM organizers")
dst_cursor.execute("DELETE FROM locations")
dst.commit()

# Копирование organizers
src_cursor.execute("SELECT id, name, short_name, base_url, updated_at FROM organizers")
orgs = src_cursor.fetchall()
print(f"Organizers from source: {len(orgs)}")
for org in orgs:
    dst_cursor.execute(
        "INSERT INTO organizers (id, name, short_name, base_url, updated_at) VALUES (%s, %s, %s, %s, %s)",
        org
    )
dst.commit()
print(f"Organizers inserted: {dst_cursor.rowcount}")

# Копирование locations
src_cursor.execute("SELECT id, name, updated_at FROM locations")
locs = src_cursor.fetchall()
print(f"Locations from source: {len(locs)}")
for loc in locs:
    dst_cursor.execute(
        "INSERT INTO locations (id, name, updated_at) VALUES (%s, %s, %s)",
        loc
    )
dst.commit()
print(f"Locations inserted: {dst_cursor.rowcount}")

# Копирование events
src_cursor.execute("SELECT * FROM events")
events = src_cursor.fetchall()
print(f"Events from source: {len(events)}")
# Получаем названия столбцов
src_cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'events' ORDER BY ordinal_position")
cols = [row[0] for row in src_cursor.fetchall()]
placeholders = ", ".join(["%s"] * len(cols))
col_names = ", ".join(cols)
for event in events:
    dst_cursor.execute(f"INSERT INTO events ({col_names}) VALUES ({placeholders})", event)
dst.commit()
print(f"Events inserted: {dst_cursor.rowcount}")

# Проверка
for table in ['users', 'organizers', 'locations', 'events']:
    dst_cursor.execute(f"SELECT COUNT(*) FROM {table}")
    count = dst_cursor.fetchone()[0]
    print(f"{table}: {count}")

# Проверка названий
dst_cursor.execute("SELECT name, short_name FROM organizers LIMIT 5")
print("\\nOrganizer names:")
for row in dst_cursor.fetchall():
    print(f"  {row[0]} | {row[1]}")

dst_cursor.execute("SELECT name FROM locations LIMIT 5")
print("\\nLocation names:")
for row in dst_cursor.fetchall():
    print(f"  {row[0]}")

src.close()
dst.close()
print("\\nDone!")
'''

        print("[1/2] Записываю скрипт копирования...")
        rc, out = run(ssh, f"cat > /tmp/copy_data.py << 'PYEOF'\n{script}\nPYEOF")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/2] Запускаю копирование...")
        rc, out = run(ssh, "python3 /tmp/copy_data.py")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
