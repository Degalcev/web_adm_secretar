#!/usr/bin/env python3
"""Пересоздание test_db с UTF8 и копирование данных."""

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
        print("[1/3] Завершаю соединения и удаляю test_db...")
        rc, out = run(ssh, "sudo -u postgres psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_db' AND pid <> pg_backend_pid()\"")
        rc, out = run(ssh, "sudo -u postgres dropdb test_db")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/3] Создаю test_db с UTF8...")
        # Используем template0 для обеспечения UTF8
        rc, out = run(ssh, "sudo -u postgres createdb -E UTF8 --template=template0 test_db")
        print(f"    {'OK' if rc == 0 else out}")

        # Проверяем кодировку
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SHOW server_encoding\"")
        print(f"    Кодировка: {out.strip()}")

        print("[3/3] Копирую схему и данные...")
        # Копируем схему
        rc, out = run(ssh, "sudo -u postgres pg_dump --schema-only test | sudo -u postgres psql -d test_db 2>&1")
        print(f"    Схема: {'OK' if rc == 0 else out}")

        # Копируем данные через Python
        script = """
import psycopg2

src = psycopg2.connect(dbname="test", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")
dst = psycopg2.connect(dbname="test_db", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")

src_c = src.cursor()
dst_c = dst.cursor()

# Очистка FK
dst_c.execute("DELETE FROM events")
dst_c.execute("DELETE FROM documents")
dst_c.execute("DELETE FROM organizers")
dst_c.execute("DELETE FROM locations")
dst.commit()

# Organizers
src_c.execute("SELECT id, name, base_url, updated_at FROM organizers")
for row in src_c.fetchall():
    dst_c.execute("INSERT INTO organizers (id, name, base_url, updated_at) VALUES (%s,%s,%s,%s)", row)
dst.commit()

# Locations
src_c.execute("SELECT id, name, updated_at FROM locations")
for row in src_c.fetchall():
    dst_c.execute("INSERT INTO locations (id, name, updated_at) VALUES (%s,%s,%s)", row)
dst.commit()

# Events
src_c.execute("SELECT * FROM events")
events = src_c.fetchall()
src_c.execute("SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position")
cols = [r[0] for r in src_c.fetchall()]
ph = ", ".join(["%s"]*len(cols))
cn = ", ".join(cols)
for e in events:
    dst_c.execute(f"INSERT INTO events ({cn}) VALUES ({ph})", e)
dst.commit()

# Проверка
for t in ['users','organizers','locations','events']:
    dst_c.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"{t}: {dst_c.fetchone()[0]}")

dst_c.execute("SELECT name FROM organizers LIMIT 3")
print("Organizers:", [r[0] for r in dst_c.fetchall()])

dst_c.execute("SELECT name FROM locations LIMIT 3")
print("Locations:", [r[0] for r in dst_c.fetchall()])

src.close()
dst.close()
"""
        rc, out = run(ssh, f"cat > /tmp/cp.py << 'EOF'\n{script}\nEOF")
        rc, out = run(ssh, "python3 /tmp/cp.py")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
