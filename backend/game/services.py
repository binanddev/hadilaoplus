import secrets
import string
import threading
from contextlib import contextmanager
from django.db import transaction
from .models import Room
from . import engine

# SQLite development uses a single process; PostgreSQL additionally locks rows.
_lock = threading.RLock()

def credentials(room, p):
    return dict(code=room.code, player_id=p['id'], token=p['token'])

def create_room(name, settings, character='regent'):
    state = engine.new_state(name, settings, character)
    for _ in range(20):
        code = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(6))
        if not Room.objects.filter(code=code).exists():
            room = Room.objects.create(code=code, state=state)
            return credentials(room, state['players'][0])
    raise engine.RuleError('Không tạo được mã phòng, hãy thử lại.')

@contextmanager
def locked_room(code):
    with _lock, transaction.atomic():
        try:
            room = Room.objects.select_for_update().get(code=code.upper())
        except Room.DoesNotExist:
            raise engine.RuleError('Không tìm thấy phòng.')
        if engine.upgrade(room.state):
            room.save()
        yield room

def join_room(code, name, character='regent'):
    with locked_room(code) as room:
        engine.require(room.state['phase'] == 'lobby', 'Ván đã bắt đầu; cần mã phiên cũ để vào lại.')
        engine.require(len(room.state['players']) < 8, 'Phòng đã đủ 8 người.')
        p = engine.player(name, len(room.state['players']), character)
        room.state['players'].append(p)
        if room.state['host_id'] is None:
            room.state['host_id'] = p['id']
        room.state['version'] += 1
        room.save()
        return credentials(room, p)

def read(code, token):
    with locked_room(code) as room:
        pid = engine.authenticate(room.state, token)
        engine.require(pid, 'Phiên không hợp lệ.')
        if engine.advance_expired(room.state):
            room.save()
        return engine.snapshot(room.state, pid, room.code)

def mutate(code, token, action):
    with locked_room(code) as room:
        pid = engine.authenticate(room.state, token)
        engine.require(pid, 'Phiên không hợp lệ.')
        expired = engine.advance_expired(room.state)
        # Persist elapsed timer even if the subsequent action is rejected.
        try:
            engine.apply(room.state, pid, action)
        except engine.RuleError as error:
            if expired:
                room.save()
            return str(error)
        room.save()
        return None

def tick(code):
    with locked_room(code) as room:
        if engine.advance_expired(room.state):
            room.save()
            return True
        return False
