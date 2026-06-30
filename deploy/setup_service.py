#!/usr/bin/env python3
"""Создание systemd сервиса для тестового сайта на VPS."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'

SERVICE_CONTENT = """[Unit]
Description=Web Admin Panel (Test)
After=network.target

[Service]
User=root
WorkingDirectory=/opt/web_test
ExecStart=/opt/web_test/venv/bin/python main.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
"""


def run(ssh, cmd, stdin_text=None):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    if stdin_text:
        stdin.channel.sendall(stdin_text.encode())
        stdin.channel.shutdown_write()
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    return exit_code, out


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    try:
        print("[1/4] Записываю systemd сервис...")
        rc, out = run(ssh, 'cat > /etc/systemd/system/web-admin-test.service', SERVICE_CONTENT)
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print("[2/4] daemon-reload...")
        rc, out = run(ssh, 'systemctl daemon-reload')
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print("[3/4] enable...")
        rc, out = run(ssh, 'systemctl enable web-admin-test')
        print(f"    {out.strip() or 'OK'}")

        print("[4/4] start...")
        rc, out = run(ssh, 'systemctl start web-admin-test')
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print()
        print("=== Статус ===")
        rc, out = run(ssh, 'systemctl status web-admin-test --no-pager -l')
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
