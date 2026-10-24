"""Run real cross-game writes against a disposable database, without a server.

This helper is a separate process so its database configuration and connections
cannot replace the calling Django test runner's database.
"""
import os
from pathlib import Path
import runpy
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch


def main():
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    temporary_root = backend / '.tmp'
    temporary_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='cross-game-sqlite-', dir=temporary_root) as folder:
        assert Path(folder).resolve().is_relative_to(temporary_root.resolve())
        os.environ['DATABASE_URL'] = f'sqlite:///{Path(folder) / "test.sqlite3"}'
        os.environ['DEBUG'] = '1'
        config = runpy.run_path(str(backend / 'crown' / 'settings.py'))

        from django.conf import settings
        settings.configure(SECRET_KEY='isolated-regression-only',
                           INSTALLED_APPS=['game', 'secret_hitler'],
                           DATABASES=config['DATABASES'],
                           DEFAULT_AUTO_FIELD='django.db.models.BigAutoField', USE_TZ=True)
        import django
        django.setup()
        from django.db import connection, connections
        from game import services as crown
        from game.models import Room
        from secret_hitler import services as secret
        from secret_hitler.models import SecretRoom

        try:
            with connection.schema_editor() as editor:
                editor.create_model(Room)
                editor.create_model(SecretRoom)
            crown_session = crown.create_room('Crown player', {})
            secret_session = secret.create_room('Secret player')
            pairs = 8
            for trial in range(pairs):
                start = threading.Barrier(2, timeout=8)

                def slow_apply(original):
                    def wrapped(*args, **kwargs):
                        # Hold the real transaction after its room read long
                        # enough for the other game's independent lock to enter.
                        time.sleep(.04)
                        return original(*args, **kwargs)
                    return wrapped

                def worker(service, session, tag):
                    try:
                        start.wait()
                        return service.mutate(session['code'], session['token'], {
                            'action': 'ready', 'ready': True,
                            'action_id': f'{tag}-{trial}',
                        })
                    finally:
                        connections.close_all()

                with patch.object(crown.engine, 'apply', slow_apply(crown.engine.apply)), \
                        patch.object(secret.engine, 'apply', slow_apply(secret.engine.apply)):
                    with ThreadPoolExecutor(max_workers=2) as workers:
                        first = workers.submit(worker, crown, crown_session, 'crown')
                        second = workers.submit(worker, secret, secret_session, 'secret')
                        first.result(timeout=15)
                        second.result(timeout=15)

            crown_state = crown.read(crown_session['code'], crown_session['token'])
            secret_state = secret.read(secret_session['code'], secret_session['token'])
            assert crown_state['version'] == 1 + pairs
            assert secret_state['version'] == 1 + pairs
            assert len(crown_state['players']) == len(secret_state['players']) == 1
            assert crown_state['players'][0]['name'] == 'Crown player'
            assert secret_state['players'][0]['name'] == 'Secret player'
            assert not crown_state['players'][0]['ready']  # old game toggles
            assert secret_state['players'][0]['ready']  # new game sets explicitly
            print(f'{pairs} simultaneous cross-game write pairs passed; states isolated.')
        finally:
            connections.close_all()


if __name__ == '__main__':
    main()
