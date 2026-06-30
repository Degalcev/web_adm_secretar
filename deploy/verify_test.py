#!/usr/bin/env python3
"""Проверка работоспособности тестового сайта."""

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
        print("=== Статус сервиса ===")
        rc, out = run(ssh, 'systemctl status web-admin-test --no-pager -l')
        print(out)

        print("=== Порт 8082 ===")
        rc, out = run(ssh, 'netstat -tlnp | grep 8082')
        print(out or "Порт не найден")

        print("=== Nginx test ===")
        rc, out = run(ssh, 'nginx -t 2>&1')
        print(out)

        print("=== Curl test (port 8082) ===")
        rc, out = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8082/admin')
        print(f"HTTP Status: {out}")

        print("=== Curl test (nginx) ===")
        rc, out = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/admin')
        print(f"HTTP Status: {out}")

        print()
        print("=== Итог ===")
        print("Тестовый сайт: http://45.90.217.225/admin")
        print("Продакшен:     https://bot.dlab.run/admin")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
