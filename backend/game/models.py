from django.db import models

class Room(models.Model):
    code = models.CharField(max_length=6, unique=True)
    state = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
