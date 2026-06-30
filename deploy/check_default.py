#!/usr/bin/env python3
"""Проверка default nginx конфига."""

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
        print("=== Default config ===")
        rc, out = run(ssh, 'cat /etc/nginx/sites-available/default')
        print(out[:2000])

        print("=== Remove default ===")
        rc, out = run(ssh, 'rm -f /etc/nginx/sites-enabled/default')
        print("Removed default")

        print("=== Reload nginx ===")
        rc, out = run(ssh, 'systemctl reload nginx')
        print("Reloaded" if rc == 0 else f"Error: {out}")

        print("=== Test again ===")
        rc, out = run(ssh, 'wget -S -O- http://127.0.0.1/admin 2>&1 | head -20')
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
