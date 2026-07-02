#!/bin/bash
# Настройка VPS для тестового и продакшена сайтов.
# Запускать на VPS: bash setup_vps.sh

set -e

echo "=== Настройка VPS ==="

# 1. Создаём папки
echo "[1/5] Создаю папки..."
mkdir -p /opt/web_test
mkdir -p /opt/web

# 2. Устанавливаем Python и pip
echo "[2/5] Проверяю Python..."
if ! command -v python3 &> /dev/null; then
    apt update && apt install -y python3 python3-venv python3-pip
fi

# 3. Устанавливаем nginx
echo "[3/5] Проверяю nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

# 4. Копируем конфиги nginx
echo "[4/5] Настраиваю nginx..."

# Тестовый сайт (только по IP)
cat > /etc/nginx/sites-available/test << 'EOF'
server {
    listen 80;
    server_name 45.90.217.225;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Продакшен (по домену)
cat > /etc/nginx/sites-available/prod << 'EOF'
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

    location /admin {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }

    location = / {
        return 302 /admin;
    }
}
EOF

# Включаем сайты
ln -sf /etc/nginx/sites-available/test /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/prod /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# 5. Создаём systemd сервисы
echo "[5/5] Создаю systemd сервисы..."

cat > /etc/systemd/system/web-admin-test.service << 'EOF'
[Unit]
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
EOF

cat > /etc/systemd/system/web-admin.service << 'EOF'
[Unit]
Description=Web Admin Panel (Production)
After=network.target

[Service]
User=root
WorkingDirectory=/opt/web
ExecStart=/opt/web/venv/bin/python main.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable web-admin-test web-admin

echo ""
echo "=== Настройка завершена ==="
echo ""
echo "Тестовый сайт: http://45.90.217.225:8081/admin"
echo "Продакшен:     https://bot.dlab.run/admin"
echo ""
echo "Для запуска теста: systemctl start web-admin-test"
echo "Для запуска прода: systemctl start web-admin"
