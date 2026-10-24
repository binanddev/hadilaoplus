from django.urls import path
from . import views

urlpatterns = [
    path('rooms/', views.create),
    path('rooms/<str:code>/join/', views.join),
    path('rooms/<str:code>/action/', views.action),
    path('rooms/<str:code>/', views.detail),
]
