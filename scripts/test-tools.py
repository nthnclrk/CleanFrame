"""Offline regression checks. All credentials and SDK responses are synthetic."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from font_assets import write_widget_archive
from local_config import ROOT, load_settings, manifest_identity, override_identity, read_password
import package
from private_files import check_signed_widget, check_widget, generated_path, private_path, secret_content


class ToolTests(unittest.TestCase):
    def setUp(self):
        # Retain isolated fixtures rather than permanently delete files on an owner's Mac.
        self.root = Path(tempfile.mkdtemp(prefix='cleanframe-tools-')).resolve()
        (self.root / 'app').mkdir()
        (self.root / '.local').mkdir()
        (self.root / 'app/config.xml').write_bytes((ROOT / 'app/config.xml').read_bytes())
        (self.root / 'app/index.html').write_text('<html>Offline test fixture</html>')

    def config(self, **values):
        (self.root / '.local/signing.json').write_text(json.dumps(values))
        return load_settings(self.root)

    def password(self, name='.local/password.txt', value=b'synthetic password\n', mode=0o600):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
        path.chmod(mode)
        return path

    def test_existing_identity_and_sdk_defaults(self):
        settings = load_settings(self.root)
        self.assertEqual(settings['profile'], 'FrameHome')
        self.assertEqual(settings['sdk_path'], self.root / '.local/tizen-sdk')
        self.assertEqual(settings['identity']['app_id'], 'nClrkHome1.FrameHome')
        self.assertIsNone(settings['password_file'])
        password = self.password('.local/certificates/private/certificate-password.txt')
        self.assertEqual(load_settings(self.root)['password_file'], password)
        self.assertIsNone(self.config(profile='Other profile')['password_file'])

    def test_sdk_symlink_resolution_preserves_password_no_follow(self):
        sdk = self.root / '.local/real-sdk'
        sdk.mkdir()
        alias = self.root / '.local/SDK path with spaces'
        alias.symlink_to(sdk, target_is_directory=True)
        password = self.password()
        link = self.root / '.local/password-link.txt'
        link.symlink_to(password)
        settings = self.config(profile='Synthetic profile', sdk_path=str(alias), password_file=str(link))
        self.assertEqual(settings['sdk_path'], sdk.resolve())
        self.assertEqual(settings['password_file'], link)
        with self.assertRaises(OSError):
            read_password(settings['password_file'], self.root)

    def test_config_identity_validation_and_no_secret_errors(self):
        with self.assertRaisesRegex(ValueError, 'Set profile'):
            self.config(sdk_path='/opt/my sdk')
        selected = self.config(sdk_path='/opt/my sdk', profile='My profile',
                               package_id='AbCdEf1234', app_id='AbCdEf1234.MyHome')
        self.assertEqual(selected['sdk_path'], Path('/opt/my sdk'))
        for values in [dict(package_id='AbCdEf1234'), dict(package_id='../unsafe', app_id='../unsafe.Home'),
                       dict(package_id='AbCdEf1234', app_id='Other12345.Home'),
                       dict(password='synthetic secret'), dict(profile='bad\nprofile')]:
            with self.subTest(values=tuple(values)):
                with self.assertRaises(ValueError) as result:
                    self.config(**{'profile': 'Synthetic profile', **values})
                self.assertNotIn('synthetic secret', str(result.exception))
        (self.root / '.local/signing.json').write_text('{invalid synthetic secret')
        with self.assertRaises(ValueError) as result:
            load_settings(self.root)
        self.assertNotIn('synthetic secret', str(result.exception))
        (self.root / '.local/signing.json').write_bytes((ROOT / 'signing.example.json').read_bytes())
        with self.assertRaisesRegex(ValueError, 'ten-character'):
            load_settings(self.root)

    def test_password_permissions_paths_and_contents(self):
        good = self.password()
        self.assertEqual(read_password(good, self.root), b'synthetic password')
        for name in ['app/password.txt', 'password.txt', '.git/password.txt']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                read_password(self.password(name), self.root)
        for mode in [0o644, 0o640, 0o666, 0o700]:
            good.chmod(mode)
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                read_password(good, self.root)
        good.chmod(0o600)
        link = self.root / '.local/link.txt'
        link.symlink_to(good)
        with self.assertRaises(OSError):
            read_password(link, self.root)
        with patch('local_config.os.getuid', return_value=os.getuid() + 1), self.assertRaises(ValueError):
            read_password(good, self.root)
        for value in [b'', b'first\nsecond', b'x\x00y', b'x\n\n', b'x' * 4097, b'x' * 4096 + b'\nextra']:
            good.write_bytes(value)
            with self.subTest(length=len(value)), self.assertRaises(ValueError):
                read_password(good, self.root)

    def test_widget_identity_overlay_and_private_files(self):
        original = (self.root / 'app/config.xml').read_bytes()
        identity = {'package_id': 'AbCdEf1234', 'app_id': 'AbCdEf1234.MyHome'}
        output = self.root / 'widget.wgt'
        # Files outside app/ are not included, even when they contain test credentials.
        self.password()
        write_widget_archive(output, root=self.root, include_private=False, identity=identity)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(manifest_identity(archive.read('config.xml')), identity)
            expected = original.replace(b'nClrkHome1.FrameHome', b'AbCdEf1234.MyHome').replace(b'nClrkHome1', b'AbCdEf1234')
            self.assertEqual(archive.read('config.xml'), expected)
            self.assertFalse(any('password' in name for name in archive.namelist()))
        self.assertEqual((self.root / 'app/config.xml').read_bytes(), original)
        duplicate = original.replace(b'</widget>', b'<tizen:application id="AbCdEf1234.Other" package="AbCdEf1234"/></widget>')
        with self.assertRaises(ValueError):
            override_identity(duplicate, identity)
        for index, name in enumerate(['config.local.json', 'author.pfx', 'profiles.xml', '.local/signing.json']):
            app_root = self.root / ('unsafe-' + str(index))
            (app_root / 'app' / name).parent.mkdir(parents=True, exist_ok=True)
            (app_root / 'app' / name).write_text('synthetic')
            with self.subTest(name=name), self.assertRaises(ValueError):
                write_widget_archive(output, root=app_root, include_private=False)
        # Recognisable key material is blocked even under a harmless filename.
        (self.root / 'app/notes.txt').write_bytes(b'-----BEGIN ' + b'ENCRYPTED PRIVATE KEY-----')
        with self.assertRaises(ValueError):
            write_widget_archive(output, root=self.root, include_private=False)

    def test_export_ignores_local_signing_config(self):
        output = self.root / 'public.wgt'
        write_widget_archive(output, root=self.root, include_private=False)
        with zipfile.ZipFile(output) as archive:
            before = {name: archive.read(name) for name in archive.namelist()}
        (self.root / '.local/signing.json').write_text('Deliberately invalid synthetic config: must not be read')
        write_widget_archive(output, root=self.root, include_private=False)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(before, {name: archive.read(name) for name in archive.namelist()})

    def test_sdk_output_is_not_a_widget_input(self):
        output = self.root / 'public.wgt'
        write_widget_archive(output, root=self.root, include_private=False)
        with zipfile.ZipFile(output) as archive:
            before = {name: archive.read(name) for name in archive.namelist()}
        for name in ['.buildResult/author.pfx', 'nested/.BUILDRESULT/assets/private-fonts/copied.ttf',
                     '.buildResult/signature1.xml']:
            path = self.root / 'app' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'-----BEGIN ' + b'PRIVATE KEY-----')
        (self.root / 'app/.buildResult/copied-link').symlink_to(self.password())
        original_read = Path.read_bytes
        def read_source(path):
            if generated_path(str(path)):
                self.fail('SDK output must be skipped before its contents are read')
            return original_read(path)
        with patch.object(Path, 'read_bytes', read_source):
            write_widget_archive(output, root=self.root, include_private=False)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(before, {name: archive.read(name) for name in archive.namelist()})

    def test_incoming_widget_rejects_sdk_output(self):
        output = self.root / 'imported.wgt'
        for name in ['.buildResult/index.html', 'nested/.BUILDRESULT/copy.txt',
                     r'nested\.buildResult\copy.txt']:
            for signed in [False, True]:
                with self.subTest(name=name, signed=signed):
                    with zipfile.ZipFile(output, 'w') as archive:
                        archive.writestr(name, 'Synthetic copied build output')
                        if signed:
                            archive.writestr('author-signature.xml', '<Signature/>')
                            archive.writestr('signature1.xml', '<Signature/>')
                    with self.assertRaisesRegex(ValueError, 'Private material in widget'):
                        check_widget(output, require_signed=signed)

    def test_signed_widget_allows_public_certificates(self):
        output = self.root / 'signed.wgt'
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('author-signature.xml', '<Signature>Public certificate metadata</Signature>')
            archive.writestr('signature1.xml', '<Signature/>')
            archive.writestr('author.cer', 'Public certificate')
        check_widget(output, require_signed=True)
        with zipfile.ZipFile(output, 'a') as archive:
            archive.writestr('author.pkcs12', 'synthetic private store')
        with self.assertRaises(ValueError):
            check_widget(output, require_signed=True)

    def test_signed_widget_rejects_invalid_manifest(self):
        output = self.root / 'invalid.wgt'
        selected = {'package_id': 'AbCdEf1234', 'app_id': 'AbCdEf1234.MyHome'}
        cases = [(None, 'missing config.xml'), (b'<invalid', 'not valid XML'),
                 ((self.root / 'app/config.xml').read_bytes(), 'identity differs')]
        for content, message in cases:
            with zipfile.ZipFile(output, 'w') as archive:
                archive.writestr('author-signature.xml', '<Signature/>')
                archive.writestr('signature1.xml', '<Signature/>')
                if content is not None:
                    archive.writestr('config.xml', content)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                check_signed_widget(output, selected)

    def test_fake_sdk_saved_profile_and_password_modes(self):
        cli = self.root / '.local/sdk/tools/ide/bin/tizen'
        cli.parent.mkdir(parents=True)
        cli.write_text('#!' + sys.executable + '\n' + '''
from pathlib import Path
import shutil
import sys
import zipfile
if Path(__file__).with_name('fail').exists():
    print('synthetic secret SDK diagnostic')
    sys.exit(3)
if Path(__file__).with_name('prompt').exists():
    print('Password:', end='', flush=True)
    if input() != 'synthetic password':
        sys.exit(2)
    print('No: (N) ?', end='', flush=True)
    if input() != 'n':
        sys.exit(2)
source = Path(sys.argv[-1])
target = Path(sys.argv[sys.argv.index('-o') + 1]) / source.name
shutil.copyfile(source, target)
if Path(__file__).with_name('mismatch').exists():
    with zipfile.ZipFile(target) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    entries['config.xml'] = entries['config.xml'].replace(b'AbCdEf1234.MyHome', b'AbCdEf1234.Wrong')
    with zipfile.ZipFile(target, 'w') as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
with zipfile.ZipFile(target, 'a') as archive:
    archive.writestr('author-signature.xml', '<Signature/>')
    archive.writestr('signature1.xml', '<Signature/>')
''')
        cli.chmod(0o700)
        profile = cli.parent / 'profiles.xml'
        profile.write_text('Synthetic profile: do not rewrite')
        identity = dict(package_id='AbCdEf1234', app_id='AbCdEf1234.MyHome')
        alias = self.root / '.local/SDK alias with spaces'
        alias.symlink_to(cli.parents[3], target_is_directory=True)
        settings = self.config(sdk_path=str(alias), profile='My profile', **identity)
        self.assertEqual(settings['sdk_path'], cli.parents[3].resolve())
        self.assertTrue(settings['sdk_path'].is_relative_to(self.root))
        with patch.object(package, 'load_settings', return_value=settings):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                package.main(self.root)
            self.assertNotIn('synthetic secret', output.getvalue())
            target = self.root / 'dist/CleanFrame.wgt'
            baseline = target.read_bytes()
            (cli.parent / 'mismatch').write_text('Synthetic identity mismatch')
            with self.assertRaisesRegex(ValueError, 'identity differs'):
                package.main(self.root)
            self.assertEqual(target.read_bytes(), baseline)
            (cli.parent / 'mismatch').rename(cli.parent / 'unused-mismatch')
            (cli.parent / 'fail').write_text('Synthetic failure')
            with self.assertRaises(ValueError):
                package.main(self.root)
            self.assertEqual(target.read_bytes(), baseline)
        password = self.password()
        settings['password_file'] = password
        self.assertTrue(settings['password_file'].is_relative_to(self.root))
        (cli.parent / 'fail').rename(cli.parent / 'unused-failure')
        (cli.parent / 'prompt').write_text('Use synthetic password prompt')
        with patch.object(package, 'load_settings', return_value=settings):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                package.main(self.root)
            self.assertNotIn('synthetic password', output.getvalue())
        self.assertEqual(profile.read_text(), 'Synthetic profile: do not rewrite')
        with zipfile.ZipFile(target) as archive:
            self.assertEqual(manifest_identity(archive.read('config.xml')), identity)

    def test_public_check_reads_index_and_history(self):
        for name in ['scripts/check-public.py', 'scripts/font_assets.py', 'scripts/local_config.py', 'scripts/private_files.py',
                     'app/assets/fonts/SOURCES.json', 'app/assets/manrope.woff2', 'app/assets/manrope-OFL.txt',
                     'app/assets/fonts/geist/OFL.txt', 'app/assets/fonts/newsreader/OFL.txt']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'[]' if name.endswith('SOURCES.json') else (ROOT / name).read_bytes())
        git_env = {name: value for name, value in os.environ.items() if not name.startswith('GIT_')}
        git_env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        def git(*args):
            return subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', *args],
                                  cwd=self.root, check=True, capture_output=True, env=git_env)
        def check():
            return subprocess.run([sys.executable, '-B', 'scripts/check-public.py'], cwd=self.root, capture_output=True, text=True, env=git_env)
        git('init', '-q', '--template=')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture')
        (self.root / '.gitignore').write_text('*.pfx\n.local/\n')
        self.password('.local/forced.pfx')
        git('add', '-f', '.local/forced.pfx')
        self.assertIn('Git index: .local/forced.pfx', check().stderr)
        # A harmless working copy must not conceal the key stored in the index.
        notes = self.root / 'notes.txt'
        marker = b'-----BEGIN ' + b'PRIVATE KEY-----'
        notes.write_bytes(marker)
        git('add', 'notes.txt')
        git('update-index', '--add', '--cacheinfo', '160000,' + '1' * 40 + ',vendor/synthetic-submodule')
        notes.write_text('Harmless working copy')
        result = check()
        self.assertIn('Credential pattern in Git index: notes.txt', result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        self.assertNotIn(marker.decode(), result.stderr)
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Synthetic fixture')
        git('add', 'notes.txt')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Replace fixture')
        self.assertIn('Credential pattern in reachable Git history: notes.txt', check().stderr)
        # Compiled helper output and build metadata must not enter public history.
        generated = self.root / 'scripts/native-home/obj/build.json'
        generated.parent.mkdir(parents=True)
        generated.write_text('{"synthetic": "local build path"}')
        binary = self.root / 'scripts/native-home/Control.dll'
        binary.write_bytes(b'Synthetic compiled helper')
        git('add', str(generated.relative_to(self.root)), str(binary.relative_to(self.root)))
        result = check()
        self.assertIn('Git index: scripts/native-home/obj/build.json', result.stderr)
        self.assertIn('Git index: scripts/native-home/Control.dll', result.stderr)
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Generated fixtures')
        self.assertIn('reachable Git history: scripts/native-home/obj/build.json', check().stderr)
        # Ignoring SDK output must not hide an indexed or renamed historical copy.
        sdk_output = self.root / 'app/.buildResult/metadata.json'
        sdk_output.parent.mkdir(parents=True)
        sdk_output.write_text('{"synthetic": "SDK build copy"}')
        with (self.root / '.gitignore').open('a') as ignore:
            ignore.write('/app/.buildResult/\n')
        git('add', '-f', 'app/.buildResult/metadata.json')
        self.assertIn('Git index: app/.buildResult/metadata.json', check().stderr)
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'SDK output fixture')
        git('mv', 'app/.buildResult/metadata.json', 'sdk-output-renamed.json')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Rename SDK output fixture')
        self.assertIn('reachable Git history: app/.buildResult/metadata.json', check().stderr)
        # A rename must not hide a private historical filename for an existing blob.
        (self.root / 'old-store.pfx').write_bytes(b'Synthetic opaque certificate store')
        git('add', '-f', 'old-store.pfx')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Historical private path')
        git('mv', 'old-store.pfx', 'renamed-store.txt')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Rename fixture')
        self.assertIn('reachable Git history: old-store.pfx', check().stderr)

    def test_signing_rejects_prompts_and_times_out(self):
        cli = self.root / 'fake-sdk'
        cli.write_text('#!' + sys.executable + '\nprint("Password:", end="", flush=True)\ninput()\n')
        cli.chmod(0o700)
        with self.assertRaisesRegex(ValueError, 'requested a password'):
            package.sign([str(cli)], timeout=2)
        cli.write_text('#!' + sys.executable + '\nfor _ in range(3):\n print("Password:", end="", flush=True)\n input()\n')
        with self.assertRaisesRegex(ValueError, 'too many passwords'):
            package.sign([str(cli)], b'synthetic password', timeout=2)
        cli.write_text('#!' + sys.executable + '\nimport time\ntime.sleep(10)\n')
        with self.assertRaisesRegex(ValueError, 'timed out'):
            package.sign([str(cli)], timeout=0.1)
        cli.write_text('#!/nonexistent-offline-test-interpreter\n')
        self.assertEqual(package.sign([str(cli)], timeout=2), 127)

    def test_install_rejects_artifact_before_fake_sdb(self):
        for name in ['scripts/tv.py', 'scripts/local_config.py', 'scripts/private_files.py']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        sdb = self.root / '.local/sdk/tools/sdb'
        sdb.parent.mkdir(parents=True)
        marker = self.root / 'sdb-called'
        sdb.write_text('#!' + sys.executable + '\nfrom pathlib import Path\nPath(' + repr(str(marker)) + ').touch()\n')
        sdb.chmod(0o700)
        self.config(sdk_path=str(sdb.parents[1]), profile='Synthetic profile', package_id='AbCdEf1234', app_id='AbCdEf1234.MyHome')
        (self.root / '.local/device.json').write_text(json.dumps({'host': '127.0.0.1'}))
        widget = self.root / 'dist/CleanFrame.wgt'
        widget.parent.mkdir()
        for contaminated in [None, 'private.pfx', '.BUILDRESULT/copy.txt']:
            with zipfile.ZipFile(widget, 'w') as archive:
                archive.writestr('config.xml', (self.root / 'app/config.xml').read_bytes())
                archive.writestr('author-signature.xml', '<Signature/>')
                archive.writestr('signature1.xml', '<Signature/>')
                if contaminated:
                    archive.writestr(contaminated, 'Synthetic private or generated file')
            result = subprocess.run([sys.executable, '-B', 'scripts/tv.py', 'install'], cwd=self.root, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            expected = b'Private material in widget' if contaminated else b'Widget identity differs'
            self.assertIn(expected, result.stderr)
            self.assertNotIn(b'Traceback', result.stderr)
            self.assertFalse(marker.exists(), 'Artifact rejection must precede even a fake SDB call')

    def test_shared_policy_covers_reported_names(self):
        for name in ['config.local.json', 'signing.local.json', 'author.pfx', 'author.pkcs12',
                     'author.jks', 'author.keystore', 'profiles.xml', '.local/signing.json',
                     'app/.BUILDRESULT/copy.txt', r'app\.buildResult\copy.txt']:
            with self.subTest(name=name):
                self.assertTrue(private_path(name))
        self.assertFalse(private_path('signing.example.json'))
        self.assertTrue(secret_content(b'-----BEGIN ' + b'PRIVATE KEY-----'))
        self.assertTrue(secret_content(b'<pro' + b'files><profile' + b'item pass' + b'word="synthetic"/></profiles>'))


if __name__ == '__main__':
    unittest.main()
