# Скилл: DevOps SSH Деплой

## Назначение
Руководство по деплою приложений через SSH, управлению VPS и настройке nginx.

## Когда использовать
- Деплой в продакшен на VPS
- Управление конфигурацией сервера
- Настройка nginx reverse proxy
- Управление SSH туннелями
- Мониторинг состояния сервера

## Информация о деплое проекта
- **VPS**: 45.90.217.225
- **SSH пользователь**: root
- **Путь деплоя**: `/opt/web/`
- **Порт**: 8080
- **URL**: `https://bot.dlab.run/admin`

## SSH подключение
```python
import paramiko

def create_ssh_client(hostname, username, password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=hostname, username=username, password=password)
    return client

# Использование
ssh = create_ssh_client('45.90.217.225', 'root', 'Ghbnjr77')
```

## Удалённые команды
```python
def run_command(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    return exit_status, stdout.read().decode(), stderr.read().decode()

# Пример
status, out, err = run_command(ssh, 'cd /opt/web && git pull')
```

## Скрипт деплоя
```python
import paramiko
from pathlib import Path

def deploy_to_vps():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('45.90.217.225', username='root', password='Ghbnjr77')
    
    commands = [
        'cd /opt/web',
        'git pull origin main',
        'source venv/bin/activate',
        'pip install -r requirements.txt',
        'sudo systemctl restart web-admin',
    ]
    
    for cmd in commands:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print(f"Ошибка: {stderr.read().decode()}")
            return False
    
    ssh.close()
    return True
```

## SSH Tunnel для базы данных
```python
from sshtunnel import SSHTunnelForwarder

def create_db_tunnel():
    server = SSHTunnelForwarder(
        ('45.90.217.225', 22),
        ssh_username='root',
        ssh_password='Ghbnjr77',
        remote_bind_address=('localhost', 5432)
    )
    server.start()
    return server.local_bind_port
```

## Nginx конфигурация
```nginx
# /etc/nginx/sites-available/bot
server {
    listen 80;
    server_name bot.dlab.run;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name bot.dlab.run;
    
    ssl_certificate /etc/letsencrypt/live/bot.dlab.run/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.dlab.run/privkey.pem;
    
    # Админ-панель
    location /admin {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Bot API
    location /bot {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Systemd сервис
```ini
# /etc/systemd/system/web-admin.service
[Unit]
Description=Web Admin Panel
After=network.target

[Service]
User=root
WorkingDirectory=/opt/web
ExecStart=/opt/web/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Передача файлов
```python
# Загрузка файла
sftp = ssh.open_sftp()
sftp.put('local_file.py', '/opt/web/remote_file.py')
sftp.close()

# Скачивание файла
sftp = ssh.open_sftp()
sftp.get('/opt/web/logs/bot.log', 'local_logs/bot.log')
sftp.close()
```

## Команды мониторинга
```bash
# Проверка состояния сервиса
sudo systemctl status web-admin

# Просмотр логов
sudo journalctl -u web-admin -f

# Проверка использования порта
netstat -tlnp | grep 8080

# Проверка дискового пространства
df -h

# Проверка памяти
free -m
```

## Обновление SSL сертификата
```bash
# Авто-обновление (обычно cron)
sudo certbot renew --dry-run

# Ручное обновление
sudo certbot renew
sudo systemctl reload nginx
```

## Устранение неполадок
```bash
# Проверка конфигурации nginx
sudo nginx -t

# Перезапуск nginx
sudo systemctl restart nginx

# Проверка файрвола
sudo ufw status

# Тест SSH подключения
ssh -v root@45.90.217.225
```

## Лучшие практики безопасности
1. **Используйте SSH ключи** вместо паролей
2. **Ограничивайте SSH доступ** правилами файрвола
3. **Используйте fail2ban** для защиты от brute force
4. **Регулярные обновления**: `apt update && apt upgrade`
5. **Резервное копирование БД** регулярно

## Специфика проекта для деплоя
```python
# database/models.py обрабатывает SSH туннель
if SSH_SERVER:
    from sshtunnel import SSHTunnelForwarder
    server = SSHTunnelForwarder(
        (SSH_SERVER, 22),
        ssh_username=SSH_USER_NAME,
        ssh_password=SSH_USER_PASSWORD,
        remote_bind_address=('localhost', 5432)
    )
    server.start()
```

## Ссылки
- Документация Paramiko: https://www.paramiko.org/
- Документация Nginx: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/docs/
