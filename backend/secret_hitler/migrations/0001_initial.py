from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [migrations.CreateModel(name='SecretRoom', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('code', models.CharField(max_length=6, unique=True)),
        ('state', models.JSONField(default=dict)),
        ('updated_at', models.DateTimeField(auto_now=True)),
    ])]
