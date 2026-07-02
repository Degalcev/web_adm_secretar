#!/usr/bin/env python3
"""Тест подключения к тестовому сайту."""

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
        test_script = """
import urllib.request
try:
    resp = urllib.request.urlopen('http://127.0.0.1:8082/admin')
    print(f'Port 8082: HTTP {resp.status}')
except Exception as e:
    print(f'Port 8082: ERROR {e}')

try:
    resp = urllib.request.urlopen('http://127.0.0.1/admin')
    print(f'Nginx: HTTP {resp.status}')
except Exception as e:
    print(f'Nginx: ERROR {e}')
"""

        print("=== Тест подключения ===")
        rc, out = run(ssh, f"python3 -c '{test_script}'")
        print(out)

        print("=== Итог ===")
        print("Тестовый сайт: http://45.90.217.225/admin")
        print("Продакшен:     https://bot.dlab.run/admin")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
