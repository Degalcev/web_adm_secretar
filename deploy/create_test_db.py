#!/usr/bin/env python3
"""Создание test_db и копирование структуры."""

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
        print("[1/4] Удаляю старый test_db...")
        rc, out = run(ssh, "sudo -u postgres dropdb if exists test_db 2>/dev/null; sudo -u postgres psql -c 'DROP DATABASE IF EXISTS test_db'")
        print(f"    {out.strip() or 'OK'}")

        print("[2/4] Создаю test_db...")
        rc, out = run(ssh, "sudo -u postgres psql -c 'CREATE DATABASE test_db'")
        print(f"    {out.strip() or 'OK'}")

        print("[3/4] Копирую структуру из vks_db...")
        # Dump schema only from vks_db and restore to test_db
        rc, out = run(ssh, "sudo -u postgres pg_dump --schema-only vks_db | sudo -u postgres psql -d test_db")
        print(f"    {out.strip() or 'OK'}")

        print("[4/4] Проверяю test_db...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\dt'")
        print(out)

        print("=== Готово ===")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
