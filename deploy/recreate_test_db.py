#!/usr/bin/env python3
"""Пересоздание test_db с UTF8 кодировкой и копирование данных."""

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
        print("[1/5] Удаляю test_db...")
        rc, out = run(ssh, "sudo -u postgres dropdb test_db")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/5] Создаю test_db с UTF8...")
        rc, out = run(ssh, "sudo -u postgres createdb -E UTF8 test_db")
        print(f"    {'OK' if rc == 0 else out}")

        print("[3/5] Копирую схему из test...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --schema-only test | sudo -u postgres psql -d test_db 2>&1")
        print(f"    {'OK' if rc == 0 else out}")

        print("[4/5] Копирую данные из test...")
        # Используем pg_dump --data-only для копирования данных
        rc, out = run(ssh, "sudo -u postgres pg_dump --data-only test | sudo -u postgres psql -d test_db 2>&1")
        print(f"    {'OK' if rc == 0 else out}")

        print("[5/5] Проверяю результат...")
        for table in ['users', 'organizers', 'locations', 'events']:
            rc, out = run(ssh, f"sudo -u postgres psql -d test_db -t -A -c 'SELECT COUNT(*) FROM {table}'")
            count = out.strip() if rc == 0 else 'ERROR'
            print(f"    {table}: {count}")

        # Проверяем кодировку
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SHOW server_encoding\"")
        print(f"\n    Кодировка: {out.strip()}")

        # Проверяем названия
        print("\n    Примеры названий организаторов:")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SELECT name FROM organizers LIMIT 5\"")
        print(out)

        print("\n=== Готово ===")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
