import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crown.settings')
from django.core.asgi import get_asgi_application
http_application = get_asgi_application()
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.urls import path
from game.consumers import RoomConsumer

application = ProtocolTypeRouter({'http': http_application, 'websocket': OriginValidator(URLRouter([path('ws/rooms/<str:code>/', RoomConsumer.as_asgi())]), settings.CORS_ALLOWED_ORIGINS)})
