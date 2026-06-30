#!/usr/bin/env python3
"""Проверка базы test на VPS."""

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
        print("=== Таблицы test ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c '\\dt' 2>&1")
        print(out)

        print("=== Структура test.users ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c '\\d users' 2>&1")
        print(out)

        print("=== Sample test.users ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c 'SELECT id, name, max_id, status FROM users LIMIT 5' 2>&1")
        print(out)

        print("=== Проверка events в test ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events')\" 2>&1")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
