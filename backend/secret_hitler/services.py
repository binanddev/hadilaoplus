import secrets
import string
import threading
from contextlib import contextmanager
from django.db import transaction, IntegrityError
from .models import SecretRoom
from . import engine


_lock = threading.RLock()


def credentials(room, person):
    return dict(code=room.code, player_id=person['id'], token=person['token'])


def create_room(name):
    state = engine.new_state(name)
    for _ in range(20):
        code = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(6))
        try:
            with transaction.atomic():
                room = SecretRoom.objects.create(code=code, state=state)
            return credentials(room, state['players'][0])
        except IntegrityError:
            continue
    raise engine.RuleError('Không tạo được mã phòng; hãy thử lại.')


@contextmanager
def locked_room(code):
    with _lock, transaction.atomic():
        try:
            room = SecretRoom.objects.select_for_update().get(code=code.upper())
        except SecretRoom.DoesNotExist:
            raise engine.RuleError('Không tìm thấy phòng Secret Hitler.')
        yield room


def join_room(code, name):
    with locked_room(code) as room:
        s = room.state
        engine.require(s['phase'] == 'lobby', 'Ván đã bắt đầu. Dùng phiên cũ để quay lại.')
        engine.require(len(s['players']) < 10, 'Phòng đã đủ 10 người.')
        p = engine.player(name, len(s['players']))
        s['players'].append(p)
        s['presentation_event'] = dict(id=secrets.token_hex(12), kind='join', actor_id=p['id'])
        if s['host_id'] is None:
            s['host_id'] = p['id']
        s['version'] += 1
        room.save()
        return credentials(room, p)


def read(code, token):
    with locked_room(code) as room:
        pid = engine.authenticate(room.state, token)
        engine.require(pid, 'Phiên Secret Hitler không hợp lệ.')
        return engine.snapshot(room.state, pid, room.code)


def mutate(code, token, data):
    with locked_room(code) as room:
        pid = engine.authenticate(room.state, token)
        engine.require(pid, 'Phiên Secret Hitler không hợp lệ.')
        if engine.apply(room.state, pid, data):
            room.save()
        # A lobby departure revokes this token; don't serialize a removed player.
        return engine.snapshot(room.state, pid, room.code) if engine.authenticate(room.state, token) else None
