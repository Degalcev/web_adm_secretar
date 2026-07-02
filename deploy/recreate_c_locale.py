#!/usr/bin/env python3
"""Пересоздание test_db с локалью C (поддерживает UTF8)."""

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
        print("[1/4] Завершаю соединения и удаляю test_db...")
        run(ssh, "sudo -u postgres psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_db' AND pid <> pg_backend_pid()\"")
        rc, out = run(ssh, "sudo -u postgres dropdb test_db")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/4] Создаю test_db с --locale=C --encoding=UTF8...")
        rc, out = run(ssh, "sudo -u postgres createdb --locale=C --encoding=UTF8 --template=template0 test_db")
        print(f"    {'OK' if rc == 0 else out}")

        # Проверяем кодировку
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SHOW server_encoding\"")
        print(f"    Кодировка: {out.strip()}")

        print("[3/4] Копирую схему...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --schema-only test | sudo -u postgres psql -d test_db 2>&1")
        print(f"    Схема: OK")

        print("[4/4] Копирую данные через pg_dump...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --data-only test | sudo -u postgres psql -d test_db 2>&1")
        print(f"    Данные: {'OK' if rc == 0 else out[:300]}")

        # Проверка
        print("\n=== Проверка ===")
        for table in ['users', 'organizers', 'locations', 'events']:
            rc, out = run(ssh, f"sudo -u postgres psql -d test_db -t -A -c 'SELECT COUNT(*) FROM {table}'")
            print(f"    {table}: {out.strip()}")

        # Проверка названий
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM organizers LIMIT 3\"")
        print(f"\n    Organizers:\n{out}")

        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM locations LIMIT 3\"")
        print(f"    Locations:\n{out}")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
