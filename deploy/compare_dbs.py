#!/usr/bin/env python3
"""Сравнение структуры test_db и vks_db."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    return exit_code, out


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        print("=== Таблицы test_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\dt'")
        print(out)

        print("=== Таблицы vks_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\dt'")
        print(out)

        # Проверяем каждую таблицу в test_db
        for table in ['users', 'organizers', 'locations', 'events', 'documents', 'sessions', 'notifications']:
            print(f"\n=== Структура test_db.{table} ===")
            rc, out = run(ssh, f"sudo -u postgres psql -d test_db -c '\\d {table}' 2>&1")
            if "does not exist" in out:
                print(f"  ТАБЛИЦА НЕ СУЩЕСТВУЕТ")
            else:
                print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
