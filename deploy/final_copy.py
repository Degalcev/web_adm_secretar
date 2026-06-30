#!/usr/bin/env python3
"""Финальное копирование данных с обработкой кодировки."""

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
        script = r'''
import psycopg2

src = psycopg2.connect(dbname="test", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")
dst = psycopg2.connect(dbname="test_db", user="bot_secretar", password=",jnctrhtnfhm2024", host="localhost")

src_c = src.cursor()
dst_c = dst.cursor()

# Очистка
dst_c.execute("DELETE FROM events")
dst_c.execute("DELETE FROM documents")
dst_c.execute("DELETE FROM organizers")
dst_c.execute("DELETE FROM locations")
dst.commit()

# Organizers
src_c.execute("SELECT id, name, base_url, updated_at FROM organizers")
orgs = src_c.fetchall()
print(f"Organizers: {len(orgs)}")
for row in orgs:
    # Декодируем если нужно
    name = row[1]
    if isinstance(name, bytes):
        name = name.decode('utf-8')
    dst_c.execute(
        "INSERT INTO organizers (id, name, base_url, updated_at) VALUES (%s, %s, %s, %s)",
        (row[0], name, row[2], row[3])
    )
dst.commit()

# Locations
src_c.execute("SELECT id, name, updated_at FROM locations")
locs = src_c.fetchall()
print(f"Locations: {len(locs)}")
for row in locs:
    name = row[1]
    if isinstance(name, bytes):
        name = name.decode('utf-8')
    dst_c.execute(
        "INSERT INTO locations (id, name, updated_at) VALUES (%s, %s, %s)",
        (row[0], name, row[2])
    )
dst.commit()

# Events
src_c.execute("SELECT * FROM events")
events = src_c.fetchall()
print(f"Events: {len(events)}")
src_c.execute("SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position")
cols = [r[0] for r in src_c.fetchall()]
ph = ", ".join(["%s"]*len(cols))
cn = ", ".join(cols)
for e in events:
    decoded = []
    for v in e:
        if isinstance(v, bytes):
            decoded.append(v.decode('utf-8'))
        else:
            decoded.append(v)
    dst_c.execute(f"INSERT INTO events ({cn}) VALUES ({ph})", decoded)
dst.commit()

# Проверка
for t in ['users','organizers','locations','events']:
    dst_c.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"{t}: {dst_c.fetchone()[0]}")

dst_c.execute("SELECT name FROM organizers LIMIT 3")
print("\nOrganizers:")
for r in dst_c.fetchall():
    print(f"  {r[0]}")

dst_c.execute("SELECT name FROM locations LIMIT 3")
print("Locations:")
for r in dst_c.fetchall():
    print(f"  {r[0]}")

src.close()
dst.close()
print("\nDone!")
'''
        rc, out = run(ssh, f"cat > /tmp/cp2.py << 'EOF'\n{script}\nEOF")
        rc, out = run(ssh, "python3 /tmp/cp2.py")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
