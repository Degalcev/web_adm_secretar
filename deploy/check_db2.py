#!/usr/bin/env python3
"""Проверка events и других таблиц."""

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
        print("=== Структура events ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d events'")
        print(out)

        print("=== Структура documents ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d documents'")
        print(out)

        print("=== Структура notifications ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d notifications'")
        print(out)

        print("=== Sample events ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c 'SELECT * FROM events LIMIT 3'")
        print(out)

        print("=== Создание test_db ===")
        rc, out = run(ssh, "sudo -u postgres createdb test_db 2>&1")
        print(out or "OK")

        print("=== Копирование структуры в test_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c \"\\dT\" | grep -v Schema | awk '{print $1}' | grep -v '^$' | while read t; do sudo -u postgres pg_dump -d vks_db -t \"$t\" | sudo -u postgres psql -d test_db; done 2>&1")
        print(out)

        print("=== Проверка test_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\dt'")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
