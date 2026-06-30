#!/usr/bin/env python3
"""Сравнение схем test и test_db."""

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
        print("=== Схема test.organizers ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c '\\d organizers'")
        print(out)

        print("=== Схема test_db.organizers ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\d organizers'")
        print(out)

        print("=== Схема test.locations ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c '\\d locations'")
        print(out)

        print("=== Схема test_db.locations ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\d locations'")
        print(out)

        print("=== Схема test.events ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c '\\d events'")
        print(out)

        print("=== Схема test_db.events ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\d events'")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
