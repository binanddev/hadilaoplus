import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
DEBUG = os.environ.get('DEBUG', '1') == '1'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'local-crown-development-key-change-for-production')
if not DEBUG and SECRET_KEY.startswith('local-'):
    raise RuntimeError('Set DJANGO_SECRET_KEY for production')
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
INSTALLED_APPS = ['daphne', 'django.contrib.contenttypes', 'corsheaders', 'channels', 'game']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'corsheaders.middleware.CorsMiddleware', 'django.middleware.common.CommonMiddleware']
ROOT_URLCONF = 'crown.urls'
ASGI_APPLICATION = 'crown.asgi.application'
DATABASES = {'default': dj_database_url.config(default=f'sqlite:///{BASE_DIR / "db.sqlite3"}', conn_max_age=0)}
DATABASES['default']['ATOMIC_REQUESTS'] = False
CORS_ALLOWED_ORIGINS = os.environ.get('FRONTEND_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
REDIS_URL = os.environ.get('REDIS_URL')
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer', 'CONFIG': {'hosts': [REDIS_URL]}}} if REDIS_URL else {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
TIME_ZONE = 'UTC'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
