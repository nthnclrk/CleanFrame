"""Exercise the actual Git boundary using synthetic secrets in temporary repos."""
import contextlib
import io
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import font_assets


class PublicGuardTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Test fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        fonts = self.root / 'app/assets/fonts'
        fonts.mkdir(parents=True)
        (fonts / 'SOURCES.json').write_text('[]')
        for name in ['geist/OFL.txt', 'newsreader/OFL.txt', '../manrope-OFL.txt']:
            path = fonts / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('Fixture licence')
        self.git('add', '.')
        self.commit('Clean baseline')
        self.token = 'ghp_' + 'A' * 36  # Deliberately constructed; never a real token.

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.PIPE)

    def commit(self, message):
        self.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message)

    def guard(self):
        with patch.object(font_assets, 'ROOT', self.root), patch.object(sys, 'argv', ['check-public.py']), contextlib.redirect_stdout(io.StringIO()):
            try:
                runpy.run_path(str(ROOT / 'scripts/check-public.py'), run_name='__main__')
            except SystemExit as error:
                return str(error)
        return ''

    def test_clean_repository_passes(self):
        self.assertEqual(self.guard(), '')

    def test_staged_secret_is_rejected_after_working_copy_is_cleaned(self):
        path = self.root / 'notes.txt'
        path.write_text(self.token)
        self.git('add', 'notes.txt')
        path.write_text('Redacted working copy')
        result = self.guard()
        self.assertIn('Credential pattern', result)
        self.assertNotIn(self.token, result)

    def test_staged_secret_is_rejected_when_working_file_is_missing(self):
        path = self.root / 'notes.txt'
        path.write_text(self.token)
        self.git('add', 'notes.txt')
        path.unlink()
        self.assertIn('Credential pattern', self.guard())

    def test_secret_in_deleted_historical_file_is_rejected(self):
        path = self.root / 'notes.txt'
        path.write_text(self.token)
        self.git('add', 'notes.txt')
        self.commit('Synthetic token fixture')
        path.unlink()
        self.git('add', '-u')
        self.commit('Remove fixture')
        result = self.guard()
        self.assertIn('Credential pattern', result)
        self.assertNotIn(self.token, result)

    def test_nested_local_config_is_rejected(self):
        (self.root / 'app/config.local.json').write_text('{"private": "fixture"}')
        self.assertIn('Private/generated source path', self.guard())

    def test_private_historical_rename_is_rejected_even_with_same_blob(self):
        path = self.root / 'notes.txt'
        path.write_text('Ordinary fixture bytes')
        self.git('add', 'notes.txt')
        self.commit('Fixture')
        path.rename(self.root / 'author.p12')
        self.git('add', '-A')
        self.commit('Rename fixture')
        (self.root / 'author.p12').unlink()
        self.git('add', '-u')
        self.commit('Remove fixture')
        self.assertIn('Private/generated path in reachable Git history', self.guard())


if __name__ == '__main__':
    unittest.main()
