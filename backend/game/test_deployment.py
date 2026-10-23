import os
import runpy
from pathlib import Path
from unittest.mock import patch
from django.core.exceptions import DisallowedHost
from django.test import SimpleTestCase, RequestFactory, override_settings


class DeploymentHostTests(SimpleTestCase):
    def test_render_hostname_is_accepted_without_allowing_other_hosts(self):
        with patch.dict(os.environ, {
            'ALLOWED_HOSTS': ' example.onrender.com, localhost, ',
            'RENDER_EXTERNAL_HOSTNAME': 'hadilaoplus.onrender.com',
            'FRONTEND_ORIGINS': ' https://hadilaoplus.netlify.app, ',
        }):
            config = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'crown' / 'settings.py'))
        self.assertEqual(config['CORS_ALLOWED_ORIGINS'], ['https://hadilaoplus.netlify.app'])
        with override_settings(ALLOWED_HOSTS=config['ALLOWED_HOSTS']):
            self.assertEqual(RequestFactory().get('/', HTTP_HOST='hadilaoplus.onrender.com').get_host(), 'hadilaoplus.onrender.com')
            with self.assertRaises(DisallowedHost):
                RequestFactory().get('/', HTTP_HOST='unrelated.example').get_host()
