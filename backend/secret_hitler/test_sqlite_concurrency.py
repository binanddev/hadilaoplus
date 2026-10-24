"""Shared database regression tests. No server or production database is used."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
from unittest.mock import patch

import dj_database_url
from django.test import SimpleTestCase


class SQLiteIsolationTests(SimpleTestCase):
    def config(self, url):
        with patch.dict(os.environ, {'DATABASE_URL': url, 'DEBUG': '1'}):
            return runpy.run_path(str(Path(__file__).resolve().parents[1] / 'crown' / 'settings.py'))['DATABASES']['default']

    def test_sqlite_reserves_writer_before_room_read(self):
        database = self.config('sqlite:///:memory:')
        self.assertEqual(database['ENGINE'], 'django.db.backends.sqlite3')
        self.assertEqual(database['OPTIONS']['transaction_mode'], 'IMMEDIATE')
        self.assertFalse(database['ATOMIC_REQUESTS'])

    def test_postgresql_configuration_is_unchanged(self):
        url = 'postgresql://test:test@localhost:5432/test?sslmode=require'
        expected = dj_database_url.parse(url, conn_max_age=0)
        expected['ATOMIC_REQUESTS'] = False
        self.assertEqual(self.config(url), expected)
        self.assertNotIn('transaction_mode', self.config(url).get('OPTIONS', {}))

    def test_simultaneous_games_commit_without_lock_upgrade_failure(self):
        helper = Path(__file__).with_name('sqlite_concurrency_probe.py')
        result = subprocess.run([sys.executable, str(helper)],
                                cwd=helper.parents[1], capture_output=True,
                                text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('8 simultaneous cross-game write pairs passed', result.stdout)
