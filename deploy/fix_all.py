#!/usr/bin/env python3
"""Исправление кодировки данных через INSERT вместо COPY."""

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
        print("[1/4] Очищаю test_db (сначала events из-за FK)...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c 'DELETE FROM events'")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c 'DELETE FROM documents'")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c 'DELETE FROM organizers'")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c 'DELETE FROM locations'")
        print("    OK")

        print("[2/4] Копирую organizers через INSERT...")
        rc, out = run(ssh, """sudo -u postgres psql -d test -t -A -F '|' -c "SELECT id, name, COALESCE(short_name,''), COALESCE(base_url,''), updated_at FROM organizers" > /tmp/org_pipe.csv 2>/dev/null""")
        # Используем другой подход - pg_dump с data-only и --inserts
        rc, out = run(ssh, "sudo -u postgres pg_dump --data-only --inserts test -t organizers | sudo -u postgres psql -d test_db 2>&1")
        print(f"    {'OK' if rc == 0 else out}")

        print("[3/4] Копирую locations через INSERT...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --data-only --inserts test -t locations | sudo -u postgres psql -d test_db 2>&1")
        print(f"    {'OK' if rc == 0 else out}")

        print("[4/4] Копирую events через INSERT...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --data-only --inserts test -t events | sudo -u postgres psql -d test_db 2>&1")
        print(f"    {'OK' if rc == 0 else out}")

        print("\n=== Проверка ===")
        for table in ['users', 'organizers', 'locations', 'events']:
            rc, out = run(ssh, f"sudo -u postgres psql -d test_db -t -A -c 'SELECT COUNT(*) FROM {table}'")
            print(f"    {table}: {out.strip()}")

        print("\n=== Примеры названий ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name, short_name FROM organizers LIMIT 5\"")
        print(out)

        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM locations LIMIT 5\"")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
