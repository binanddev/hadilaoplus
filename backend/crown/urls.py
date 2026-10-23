from django.urls import path
from game import views

urlpatterns = [path('api/health/', views.health), path('api/rooms/', views.create), path('api/rooms/<str:code>/join/', views.join), path('api/rooms/<str:code>/', views.detail)]
