"""Offline privacy checks for per-installation configuration and packaging."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import font_assets
import local_config


class LocalPackagingTests(unittest.TestCase):
    def config(self):
        return {
            'tv': {'host': '192.0.2.10'},
            'sdk_path': '.local/tizen-sdk',
            'application': {'package_id': 'TestHome01', 'app_id': 'TestHome01.CleanFrame'},
            'signing': {'profile': 'PrivateTest', 'password_file': '.local/private/password.txt'},
        }

    def test_local_settings_and_keys_do_not_enter_widget(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'app').mkdir()
            template = (ROOT / 'app/config.xml').read_bytes()
            (root / 'app/config.xml').write_bytes(template)
            (root / 'app/index.html').write_text('<p>Public launcher</p>')
            private = root / '.local'
            private.mkdir()
            config = self.config()
            config['private_test_marker'] = 'PRIVATE_SETTINGS_SENTINEL'
            config_path = private / 'config.json'
            config_path.write_text(json.dumps(config))
            (private / 'author.p12').write_bytes(b'PRIVATE_KEY_SENTINEL')
            with patch.multiple(local_config, ROOT=root, CONFIG=config_path):
                loaded = local_config.load_config()
                manifest = local_config.installation_manifest(loaded)
            output = root / 'widget.wgt'
            font_assets.write_widget_archive(output, root=root, include_private=False, manifest=manifest)
            self.assertEqual((root / 'app/config.xml').read_bytes(), template)
            self.assertEqual(config_path.stat().st_mode & 0o777, 0o600)
            with zipfile.ZipFile(output) as archive:
                self.assertIn(b'TestHome01.CleanFrame', archive.read('config.xml'))
                for name in archive.namelist():
                    self.assertFalse(name.startswith(('.local/', 'scripts/', 'node_modules/')))
                    data = archive.read(name)
                    for secret in [b'192.0.2.10', b'PRIVATE_SETTINGS_SENTINEL', b'PRIVATE_KEY_SENTINEL', b'PrivateTest']:
                        self.assertNotIn(secret, data)

    def test_widget_rejects_private_files_inside_runtime_assets(self):
        for filename in ['author.p12', 'nested/config.local.json', '.env']:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                path = root / 'app' / filename
                path.parent.mkdir(parents=True)
                path.write_text('PRIVATE_FIXTURE')
                with self.assertRaisesRegex(ValueError, 'Private material'):
                    font_assets.write_widget_archive(root / 'widget.wgt', root=root, include_private=False)

    def test_widget_rejects_credentials_in_an_ordinary_asset(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'app').mkdir()
            token = 'github_pat_' + 'A' * 36
            (root / 'app/settings.txt').write_text(token)
            with self.assertRaises(ValueError) as caught:
                font_assets.write_widget_archive(root / 'widget.wgt', root=root, include_private=False)
            self.assertNotIn(token, str(caught.exception))

    def test_invalid_identity_or_password_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '.local').mkdir()
            config_path = root / '.local/config.json'
            for field in ['identity', 'password']:
                config = self.config()
                if field == 'identity':
                    config['application']['app_id'] = 'AnotherPkg.CleanFrame'
                else:
                    config['signing']['password_file'] = 'tracked-password.txt'
                config_path.write_text(json.dumps(config))
                with self.subTest(field=field), patch.multiple(local_config, ROOT=root, CONFIG=config_path):
                    with self.assertRaises(SystemExit):
                        local_config.load_config()

    def test_release_guard_rejects_force_tracked_private_key(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / '.local').mkdir()
            (root / '.gitignore').write_text('/.local/\n')
            (root / '.local/author.p12').write_bytes(b'PRIVATE_KEY_SENTINEL')
            subprocess.run(['git', '-C', str(root), 'add', '-f', '.local/author.p12'], check=True)
            fonts = root / 'app/assets/fonts'
            fonts.mkdir(parents=True)
            (fonts / 'SOURCES.json').write_text('[]')
            for name in ['geist/OFL.txt', 'newsreader/OFL.txt', '../manrope-OFL.txt']:
                path = fonts / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('test fixture license')
            with patch.object(font_assets, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as caught:
                    runpy.run_path(str(ROOT / 'scripts/check-public.py'), run_name='__main__')
            self.assertIn('Private/generated source path: .local/author.p12', str(caught.exception))
            self.assertNotIn('PRIVATE_KEY_SENTINEL', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
