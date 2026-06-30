#!/usr/bin/env python3
"""Обновление .env файла на VPS и перезапуск сервиса."""

import time
import paramiko
from pathlib import Path

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'


def run(ssh, cmd, stdin_text=None):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    if stdin_text:
        stdin.channel.sendall(stdin_text.encode())
        stdin.channel.shutdown_write()
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    return exit_code, out


def main():
    env_content = Path('deploy/.env.test').read_text(encoding='utf-8')

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        print("[1/3] Записываю .env...")
        rc, out = run(ssh, "cat > /opt/web_test/.env", env_content)
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print("[2/3] Перезапускаю сервис...")
        rc, out = run(ssh, 'systemctl restart web-admin-test')
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        time.sleep(2)

        print("[3/3] Проверяю статус...")
        rc, out = run(ssh, 'systemctl status web-admin-test --no-pager')
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
