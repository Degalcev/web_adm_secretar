import os

from dotenv import load_dotenv, find_dotenv

if not find_dotenv():
    exit("Переменные окружения не загружены т.к отсутствует файл .env")
else:
    load_dotenv()

SSH_SERVER = os.getenv("SSH_SERVER")
SSH_USER_NAME = os.getenv("SSH_USER_NAME")
SSH_USER_PASSWORD = os.getenv("SSH_USER_PASSWORD")

DB_USER = os.getenv("DB_USER")
DB_USER_PASSWORD = os.getenv("DB_USER_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')

WEBAPP_HOST = os.getenv('WEBAPP_HOST', '0.0.0.0')
WEBAPP_PORT = int(os.getenv('WEBAPP_PORT', 8080))

DEFAULT_ADMIN_PASSWORD = os.getenv('DEFAULT_ADMIN_PASSWORD', 'ivc212')

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
BOT_LOGS_DIR = os.getenv('BOT_LOGS_DIR', '/opt/bot/logs')
