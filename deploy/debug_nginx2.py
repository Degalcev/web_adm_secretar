#!/usr/bin/env python3
"""Отладка nginx - проверка загруженных конфигов."""

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
        print("=== Sites-enabled ===")
        rc, out = run(ssh, 'ls -la /etc/nginx/sites-enabled/')
        print(out)

        print("=== Test config ===")
        rc, out = run(ssh, 'cat /etc/nginx/sites-enabled/test')
        print(out)

        print("=== Nginx full config ===")
        rc, out = run(ssh, 'nginx -T 2>&1 | head -100')
        print(out)

        print("=== Test with curl ===")
        rc, out = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8082/admin')
        print(f"Direct 8082: {out}")

        rc, out = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/admin')
        print(f"Nginx: {out}")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
