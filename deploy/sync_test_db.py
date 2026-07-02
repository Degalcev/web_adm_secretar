#!/usr/bin/env python3
"""Копирование структуры из vks_db в test_db."""

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
        print("[1/2] Копирую схему из vks_db в test_db...")
        rc, out = run(ssh, "sudo -u postgres pg_dump --schema-only vks_db | sudo -u postgres psql -d test_db 2>&1")
        if rc == 0:
            print("    OK")
        else:
            print(f"    ОШИБКА: {out}")

        print("[2/2] Проверяю test_db...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c '\\dt'")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
