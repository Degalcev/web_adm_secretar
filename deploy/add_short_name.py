#!/usr/bin/env python3
"""Добавление short_name в organizers."""

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
        print("[1/2] Добавляю short_name в organizers...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"ALTER TABLE organizers ADD COLUMN IF NOT EXISTS short_name varchar(20)\"")
        print(f"    {'OK' if rc == 0 else out}")

        print("[2/2] Проверяю структуру...")
        rc, out = run(ssh, "sudo -u postgres psql -d test_db -c \"\\d organizers\"")
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
