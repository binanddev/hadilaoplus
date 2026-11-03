import time
import secrets
from django.db import transaction
from .models import ConfessionRoom
from . import engine


def create(name, avatar):
    p = engine.player(name, avatar)
    p['seen'] = time.time()
    room = ConfessionRoom.objects.create(code=secrets.token_hex(3).upper(), state=engine.new_state(p))
    return dict(code=room.code, token=p['token'], id=p['id'])


@transaction.atomic
def join(code, name, avatar):
    room = ConfessionRoom.objects.select_for_update().get(code=code)
    s = room.state
    now = time.time()
    # Expired, non-speaking seats can be reclaimed; old sessions then require a fresh join.
    s['players'] = [p for p in s['players'] if now-p['seen'] < 180 or p['id'] == s['speaker']]
    if len(s['players']) >= 100:
        raise ValueError('Phòng đã đủ 100 người.')
    p = engine.player(name, avatar)
    p['seen'] = now
    s['players'].append(p)
    room.save(update_fields=['state', 'updated_at'])
    return dict(code=room.code, token=p['token'], id=p['id'])


@transaction.atomic
def update(code, token=None, data=None):
    room = ConfessionRoom.objects.select_for_update().get(code=code)
    s, now = room.state, time.time()
    engine.advance(s, now)
    person = None
    if token is not None:
        person = next((p for p in s['players'] if secrets.compare_digest(p['token'], token)), None)
        if not person:
            raise ValueError('Phiên không còn hợp lệ. Hãy vào lại phòng.')
        if data:
            engine.act(s, person, data, now)
    room.save(update_fields=['state', 'updated_at'])
    return engine.public(s, now), person
