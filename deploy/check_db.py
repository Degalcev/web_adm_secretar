#!/usr/bin/env python3
"""Проверка структуры БД на VPS."""

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
        print("=== Таблицы vks_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\dt'")
        print(out)

        print("=== Таблицы test_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\dt' 2>&1")
        print(out)

        print("=== Структура users ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d users'")
        print(out)

        print("=== Структура organizers ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d organizers'")
        print(out)

        print("=== Структура locations ===")
        rc, out = run(ssh, "sudo -u postgres psql -d vks_db -c '\\d locations'")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
