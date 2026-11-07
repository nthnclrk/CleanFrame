"""Offline checks for the LS03C source preparation and Home policy.

These checks do not connect to a TV, execute native TV APIs, or change Home.
"""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('frame_2023_prepare', SOURCE / 'prepare.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.path.insert(0, str(SOURCE))
import preflight  # noqa: E402


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cleanframe-2023-check-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.config = json.loads((SOURCE / 'profile.example.json').read_text())

    def test_generated_source_uses_only_owner_supplied_identity(self):
        out = module.prepare(self.config, self.root)
        self.assertEqual(out, self.root / '.local/frame-2023')
        home = (out / 'home/Home.cs').read_text()
        self.assertIn(self.config['launcher']['app_id'], home)
        self.assertNotIn('@@', home)
        self.assertEqual(ET.parse(out / 'home/Home.csproj').findtext('.//TargetFramework'), 'net6.0')
        self.assertEqual((out / 'profile.json').stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(out.rglob('*.wgt')))
        self.assertFalse(list(out.rglob('*.p12')))
        with self.assertRaises(ValueError):
            module.prepare(self.config, self.root)

    def test_rejects_invalid_profiles_identities_and_extra_private_fields(self):
        for change in ('firmware', 'package', 'app', 'mismatch', 'extra', 'missing'):
            with self.subTest(change=change), tempfile.TemporaryDirectory(prefix='cleanframe-2023-bad-') as temp:
                config = json.loads(json.dumps(self.config))
                if change == 'firmware': config['profile'] = 'unsupported-firmware'
                if change == 'package': config['launcher']['package_id'] = '../escape'
                if change == 'app': config['launcher']['app_id'] = 'bad app'
                if change == 'mismatch': config['launcher']['app_id'] = 'Other12345.Home'
                if change == 'extra': config['password'] = 'synthetic-secret'
                if change == 'missing': del config['launcher']['app_id']
                with self.assertRaises((ValueError, KeyError)):
                    module.prepare(config, Path(temp))
                self.assertFalse((Path(temp) / '.local/frame-2023').exists())

    def test_owner_output_refuses_symlink_redirect(self):
        with tempfile.TemporaryDirectory(prefix='cleanframe-2023-outside-') as temp:
            outside = Path(temp).resolve()
            (self.root / '.local').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                module.prepare(self.config, self.root)
            self.assertFalse(list(outside.iterdir()))

    def test_public_templates_contain_no_private_network_or_host_paths(self):
        files = [SOURCE / 'prepare.py', SOURCE / 'Home.cs.in', SOURCE / 'profile.example.json']
        for path in files:
            with self.subTest(path=path.name):
                text = path.read_text()
                self.assertNotRegex(text, r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
                self.assertNotRegex(text, r'/Users/[^/\s]+/')
                self.assertNotRegex(text, r'(?i)\b(?:password|device_identity_sha256|duid)\s*[:=]\s*["\'][^"\']+')


class PreflightTests(unittest.TestCase):
    """Exercise preflight with fake metadata and SDB; never contact a TV."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cleanframe-2023-preflight-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.config = json.loads((SOURCE / 'profile.example.json').read_text())
        self.out = module.prepare(self.config, self.root)
        self.sdb = self.root / 'fake-sdb'
        self.sdb.write_text('fake executable; never invoked\n')
        self.sdb.chmod(0o700)
        self.host = '10.23.45.67'  # synthetic test-only address
        self.serial = self.host + ':26101'
        self.duid = 'synthetic-device-identity'
        self.model = preflight.MODEL
        self.device_output = self.serial + '\tdevice\t' + self.model + '\n'
        self.app_output = "  'CleanFrame'  '" + self.config['launcher']['app_id'] + "'\n"

    def sdb_response(self, executable, *args):
        self.assertEqual(executable, self.sdb)
        if args == ('devices',): return self.device_output
        if args == ('-s', self.serial, 'shell', '0 getduid'): return self.duid
        if args == ('-s', self.serial, 'shell', '0 applist'): return self.app_output
        raise AssertionError('Unexpected SDB operation: ' + repr(args))

    def run_preflight(self, action='apply'):
        with mock.patch.object(preflight, 'read_tv_model', return_value=self.model), \
             mock.patch.object(preflight, 'run_sdb', side_effect=self.sdb_response):
            return preflight.preflight(self.host, self.sdb, action, root=self.root)

    def test_apply_attestation_contains_only_device_hash_and_exact_target(self):
        path = self.run_preflight()
        payload = path.read_text()
        data = json.loads(payload)
        self.assertEqual(data['Model'], preflight.MODEL)
        self.assertEqual(data['Action'], 'apply')
        self.assertEqual(data['TargetApp'], self.config['launcher']['app_id'])
        self.assertTrue(data['TargetInstalled'])
        self.assertRegex(data['DeviceIdentitySha256'], r'^[0-9a-f]{64}$')
        issued = datetime.datetime.fromisoformat(data['TimeUtc'].replace('Z', '+00:00'))
        self.assertEqual(issued.utcoffset(), datetime.timedelta(0))
        self.assertNotIn(self.duid, payload)
        self.assertNotIn(self.host, payload)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_restore_does_not_require_an_installed_launcher(self):
        self.app_output = ''
        path = self.run_preflight('restore')
        self.assertFalse(json.loads(path.read_text())['TargetInstalled'])

    def test_wrong_device_duplicate_or_missing_app_and_bad_identity_stop_preflight(self):
        cases = ('wrong-model', 'wrong-serial', 'duplicate-app', 'missing-app', 'identity-error')
        for case in cases:
            with self.subTest(case=case):
                self.model = preflight.MODEL
                self.device_output = self.serial + '\tdevice\t' + preflight.MODEL + '\n'
                self.duid = 'synthetic-device-identity'
                self.app_output = "  'CleanFrame'  '" + self.config['launcher']['app_id'] + "'\n"
                if case == 'wrong-model': self.model = 'some-other-model'
                if case == 'wrong-serial': self.device_output = 'some-other-device\tdevice\t' + preflight.MODEL + '\n'
                if case == 'duplicate-app': self.app_output *= 2
                if case == 'missing-app': self.app_output = "  'Different'  'Different1.App'\n"
                if case == 'identity-error': self.duid = 'error unavailable'
                with self.assertRaises(ValueError): self.run_preflight()
                self.assertFalse((self.out / 'cf2023home-preflight.json').exists())

    def test_failed_refresh_invalidates_prior_attestation(self):
        old = self.run_preflight()
        self.assertTrue(old.exists())
        self.device_output = 'device disconnected\n'
        with self.assertRaises(ValueError): self.run_preflight()
        self.assertFalse(old.exists())

    def test_rejects_nonprivate_addresses_and_preflight_symlinks(self):
        with self.assertRaises(ValueError):
            preflight.preflight('203.0.113.2', self.sdb, 'apply', root=self.root)
        outside = self.root / 'unrelated.txt'
        outside.write_text('untouched')
        (self.out / 'cf2023home-preflight.json').symlink_to(outside)
        with self.assertRaises(ValueError): self.run_preflight()
        self.assertEqual(outside.read_text(), 'untouched')


def check_native_policy(dotnet):
    with tempfile.TemporaryDirectory(prefix='cleanframe-2023-policy-') as temp:
        root = Path(temp).resolve()
        config = json.loads((SOURCE / 'profile.example.json').read_text())
        out = module.prepare(config, root)
        sdk = subprocess.check_output([dotnet, '--version'], text=True).strip()
        major = int(sdk.split('.')[0])
        if major < 6:
            raise SystemExit('Use a .NET 6 or newer host SDK for offline policy checks.')
        env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',
                   DOTNET_GENERATE_ASPNET_CERTIFICATE='false', DOTNET_CLI_HOME=str(root / 'cli'))
        subprocess.run([dotnet, 'build', str(out / 'home/Home.csproj'), '--nologo',
                        '-o', str(root / 'home-build')], check=True, env=env, timeout=180)
        project = ET.Element('Project', Sdk='Microsoft.NET.Sdk')
        props = ET.SubElement(project, 'PropertyGroup')
        for key, value in {'TargetFramework': 'net' + str(major) + '.0', 'OutputType': 'Exe',
                           'StartupObject': 'PolicyChecks', 'EnableDefaultCompileItems': 'false'}.items():
            ET.SubElement(props, key).text = value
        items = ET.SubElement(project, 'ItemGroup')
        for path in (out / 'home/Home.cs', SOURCE / 'PolicyChecks.cs'):
            ET.SubElement(items, 'Compile', Include=str(path))
        project_path = root / 'PolicyChecks.csproj'
        project_path.write_bytes(ET.tostring(project, encoding='utf-8', xml_declaration=True))
        subprocess.run([dotnet, 'build', str(project_path), '--nologo', '-o', str(root / 'policy-build')],
                       check=True, env=env, timeout=180)
        subprocess.run([dotnet, str(root / 'policy-build/PolicyChecks.dll')], check=True, env=env, timeout=20)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet', help='Also compile source and run offline policy checks.')
    args = parser.parse_args()
    suite = unittest.TestSuite([
        unittest.defaultTestLoader.loadTestsFromTestCase(PreparationTests),
        unittest.defaultTestLoader.loadTestsFromTestCase(PreflightTests),
    ])
    if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
        raise SystemExit(1)
    if args.dotnet:
        check_native_policy(args.dotnet)
