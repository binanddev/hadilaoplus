from django.db import models


class SecretRoom(models.Model):
    """Separate table: never shares room state with One King One Crown."""
    code = models.CharField(max_length=6, unique=True)
    state = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
