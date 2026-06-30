#!/usr/bin/env python3
"""Исправление кодировки test_db."""

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
        print("=== Кодировка test_db ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"SHOW server_encoding\"")
        print(out)

        print("=== Кодировка test ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test -c \"SHOW server_encoding\"")
        print(out)

        print("=== Перекодировка test_db на UTF8 ===")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"ALTER DATABASE test_db CHARACTER SET utf8\"")
        print(f"    {out.strip() or 'OK'}")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
