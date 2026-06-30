#!/usr/bin/env python3
"""Исправление кодировки и копирование данных с правильной кодировкой."""

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
        print("[1/6] Добавляю short_name обратно в organizers...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"ALTER TABLE organizers ADD COLUMN IF NOT EXISTS short_name varchar(20)\"")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/6] Увеличиваю organizers.name → varchar(100)...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"ALTER TABLE organizers ALTER COLUMN name TYPE varchar(100)\"")
        print(f"    {'OK' if rc == 0 else out}")

        print("[3/6] Увеличиваю locations.name → varchar(50)...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"ALTER TABLE locations ALTER COLUMN name TYPE varchar(50)\"")
        print(f"    {'OK' if rc == 0 else out}")

        print("[4/6] Копирую organizers с правильной кодировкой...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "SET client_encoding TO 'UTF8'; COPY (SELECT id, name, base_url, updated_at FROM organizers) TO '/tmp/organizers.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM organizers"
            sudo -u postgres psql -d test_db -c "SET client_encoding TO 'UTF8'; COPY organizers(id, name, base_url, updated_at) FROM '/tmp/organizers.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[5/6] Копирую locations с правильной кодировкой...")
        rc, out = run(ssh, """
            sudo -u postgres psql -d test -c "SET client_encoding TO 'UTF8'; COPY (SELECT * FROM locations) TO '/tmp/locations.csv' WITH CSV HEADER"
            sudo -u postgres psql -d test_db -c "DELETE FROM locations"
            sudo -u postgres psql -d test_db -c "SET client_encoding TO 'UTF8'; COPY locations FROM '/tmp/locations.csv' WITH CSV HEADER"
        """)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[6/6] Проверяю кодировку...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM organizers LIMIT 5\"")
        print(out)

        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM locations LIMIT 5\"")
        print(out)

        print("\n=== Готово ===")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
