#!/usr/bin/env python3
"""Настройка nginx для тестового сайта на VPS."""

import paramiko

VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'

# Конфиг для тестового сайта (только по IP)
TEST_NGINX = """# Тестовый сайт - только по IP
server {
    listen 80;
    server_name 45.90.217.225;

    # Тестовый админ-панель
    location /admin {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Статика
    location ~ ^/static/(css|js)/admin\\.(css|js)$ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
    }

    # Корень - редирект на /admin
    location = / {
        return 302 /admin;
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
        print("[1/4] Записываю nginx конфиг для теста...")
        rc, out = run(ssh, 'cat > /etc/nginx/sites-available/test', TEST_NGINX)
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print("[2/4] Создаю symlink...")
        rc, out = run(ssh, 'ln -sf /etc/nginx/sites-available/test /etc/nginx/sites-enabled/test')
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print("[3/4] Проверяю конфиг nginx...")
        rc, out = run(ssh, 'nginx -t')
        print(f"    {out.strip()}")
        if rc != 0:
            print("    ОШИБКА в конфиге nginx!")
            return

        print("[4/4] Перезапускаю nginx...")
        rc, out = run(ssh, 'systemctl reload nginx')
        print(f"    {'OK' if rc == 0 else 'ОШИБКА: ' + out}")

        print()
        print("=== Готово ===")
        print("Тестовый сайт: http://45.90.217.225/admin")
        print("Продакшен:     https://bot.dlab.run/admin")

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
