#!/usr/bin/env python3
"""Исправление nginx для раздачи статики."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'

NGINX_CONF = """# Тестовый сайт - catch-all
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
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
        print("[1/3] Записываю nginx конфиг...")
        rc, out = run(ssh, 'cat > /etc/nginx/sites-available/test', NGINX_CONF)
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print("[2/3] Проверяю конфиг...")
        rc, out = run(ssh, 'nginx -t 2>&1')
        print(f"    {out.strip()}")
        if rc != 0:
            return

        print("[3/3] Перезапускаю nginx...")
        rc, out = run(ssh, 'systemctl reload nginx')
        print(f"    {'OK' if rc == 0 else 'ERROR: ' + out}")

        print()
        print("=== Тест CSS ===")
        rc, out = run(ssh, 'wget -q -O- http://127.0.0.1/static/css/base.css 2>&1 | head -3')
        print(out)

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
