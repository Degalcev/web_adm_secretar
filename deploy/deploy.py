#!/usr/bin/env python3
"""Скрипт деплоя на VPS.

Использование:
    python deploy.py test   - Деплой тестового сайта (IP:8082, /opt/web_test)
    python deploy.py prod   - Деплой продакшена (bot.dlab.run, /opt/web)
"""

import sys
import paramiko
from pathlib import Path


VPS_HOST = '45.90.217.225'
VPS_USER = 'root'
VPS_PASS = 'Ghbnjr77'

CONFIGS = {
    'test': {
        'deploy_path': '/opt/web_test',
        'port': 8082,
        'env_file': 'deploy/.env.test',
        'service_name': 'web-admin-test',
    },
    'prod': {
        'deploy_path': '/opt/web',
        'port': 8081,
        'env_file': 'deploy/.env.prod',
        'service_name': 'web-admin',
    },
}


def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)
    return client


def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    return exit_code, out, err


def deploy(env_name):
    cfg = CONFIGS[env_name]
    deploy_path = cfg['deploy_path']
    env_file = cfg['env_file']

    print(f'=== Деплой {env_name.upper()} ===')
    print(f'    Путь: {deploy_path}')
    print(f'    Порт: {cfg["port"]}')
    print()

    # Читаем .env
    env_path = Path(env_file)
    if not env_path.exists():
        print(f'ОШИБКА: Файл {env_file} не найден')
        sys.exit(1)

    env_content = env_path.read_text(encoding='utf-8')

    ssh = create_ssh_client()

    try:
        # 1. Создаём папку
        print(f'[1/5] Создаю папку {deploy_path}...')
        rc, out, err = run_cmd(ssh, f'mkdir -p {deploy_path}')
        if rc != 0:
            print(f'    ОШИБКА: {err}')
        else:
            print('    OK')

        # 2. Клонируем/обновляем репозиторий
        print(f'[2/5] Клонирую репозиторий...')
        # Проверяем есть ли уже git репозиторий
        rc, _, _ = run_cmd(ssh, f'cd {deploy_path} && git status 2>/dev/null')
        if rc == 0:
            # Уже есть репозиторий - обновляем
            rc, out, err = run_cmd(ssh, f'cd {deploy_path} && git fetch origin && git reset --hard origin/develop')
        else:
            # Нет репозитория - клонируем
            rc, out, err = run_cmd(ssh, f'cd {deploy_path} && rm -rf * .* 2>/dev/null; git clone https://github.com/Degalcev/web_adm_secretar.git . && git checkout develop')
        print(f'    {out.strip() or "OK"}')

        # 3. Создаём venv и ставим зависимости
        print(f'[3/5] Устанавливаю зависимости...')
        rc, out, err = run_cmd(ssh, f'cd {deploy_path} && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt -q')
        if rc != 0:
            print(f'    ОШИБКА: {err}')
        else:
            print('    OK')

        # 4. Записываем .env
        print(f'[4/5] Записываю .env...')
        # Экранируем для shell
        escaped = env_content.replace("'", "'\\''")
        rc, out, err = run_cmd(ssh, f"cat > {deploy_path}/.env << 'ENDOFFILE'\n{env_content}\nENDOFFILE")
        if rc != 0:
            print(f'    ОШИБКА: {err}')
        else:
            print('    OK')

        # 4.5 Записываем version.json для автообновления
        commit_hash = run_cmd(ssh, f'cd {deploy_path} && git rev-parse HEAD')[1].strip()[:8]
        env_label = 'test' if env_name == 'test' else 'prod'
        version_json = f'{{"version":"{commit_hash}","env":"{env_label}","ts":"{int(__import__("time").time())}"}}'
        rc, out, err = run_cmd(ssh, f"cat > {deploy_path}/version.json << 'ENDOFFILE'\n{version_json}\nENDOFFILE")
        if rc == 0:
            print(f'    version.json: {commit_hash} ({env_label})')

        # 5. Перезапускаем сервис
        print(f'[5/5] Перезапускаю {cfg["service_name"]}...')
        rc, out, err = run_cmd(ssh, f'systemctl restart {cfg["service_name"]}')
        if rc != 0:
            print(f'    ОШИБКА: {err}')
            print(f'    Попробуйте: sudo systemctl status {cfg["service_name"]}')
        else:
            print('    OK')

        print()
        print('=== Готово ===')
        if env_name == 'test':
            print(f'Тестовый сайт: http://{VPS_HOST}:{cfg["port"]}/admin')
        else:
            print(f'Продакшен: https://bot.dlab.run/admin')

    finally:
        ssh.close()


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('test', 'prod'):
        print(__doc__)
        sys.exit(1)

    deploy(sys.argv[1])
