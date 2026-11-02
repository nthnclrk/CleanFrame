"""Offline checks for the 2020 helper preparation and restore policy."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('frame_2020_prepare', SOURCE / 'prepare.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    root = Path(tempfile.mkdtemp(prefix='cleanframe-2020-tests-')).resolve()
    (root / 'app').mkdir()
    shutil.copy2(ROOT / 'app/icon.png', root / 'app/icon.png')
    config = json.loads((SOURCE / 'profile.example.json').read_text())
    return root, config


class PreparationTests(unittest.TestCase):
    def test_owner_identity_and_package_boundaries(self):
        root, config = fixture()
        out = module.prepare(config, root)
        ns = {'t': module.NS}
        manifest = ET.parse(out / 'router/package/tizen-manifest.xml').getroot()
        self.assertEqual(manifest.get('package'), config['router']['package_id'])
        ui = manifest.find('t:ui-application', ns)
        self.assertEqual(ui.get('appid'), config['router']['app_id'])
        self.assertEqual(ui.get('type'), 'dotnet')
        self.assertEqual(manifest.find('.//t:target', ns).text, config['launcher']['app_id'])
        self.assertEqual([x.text for x in manifest.findall('.//t:source', ns)], ['XF86Home'])
        self.assertEqual(manifest.find('.//t:target', ns).get('args'), 'entry_point:cleanframe_home')
        self.assertEqual([x.text for x in manifest.findall('.//t:privilege', ns)],
                         ['http://tizen.org/privilege/appmanager.launch'])
        self.assertFalse(manifest.findall('.//t:service-application', ns))
        for name in ['home/Home.cs', 'startup/Startup.cs', 'router/Route.cs']:
            code = (out / name).read_text()
            self.assertIn(config['launcher']['app_id'], code)
            self.assertNotIn('@@', code)
        for name in ['home/Home.csproj', 'startup/Startup.csproj', 'router/Route.csproj']:
            self.assertEqual(ET.parse(out / name).findtext('.//TargetFramework'), 'netcoreapp3.0')
        with self.assertRaises(ValueError):
            module.prepare(config, root)
        self.assertEqual((out / 'profile.json').stat().st_mode & 0o777, 0o600)

    def test_bad_identity_profile_and_secret_fields_create_no_output(self):
        for change in ['profile', 'package', 'app', 'collision', 'extra']:
            root, config = fixture()
            if change == 'profile': config['profile'] = 'unreviewed-firmware'
            if change == 'package': config['launcher']['package_id'] = '../escape'
            if change == 'app': config['launcher']['app_id'] = 'Other12345.Home'
            if change == 'collision': config['router'] = dict(config['launcher'])
            if change == 'extra': config['password'] = 'synthetic secret'
            with self.subTest(change=change), self.assertRaises(ValueError):
                module.prepare(config, root)
            self.assertFalse((root / '.local/frame-2020').exists())

    def test_symlink_cannot_redirect_owner_source(self):
        root, config = fixture()
        elsewhere = Path(tempfile.mkdtemp(prefix='cleanframe-2020-outside-')).resolve()
        (root / '.local').symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaises(ValueError):
            module.prepare(config, root)
        self.assertFalse(list(elsewhere.iterdir()))

    def test_missing_icon_leaves_no_partial_output(self):
        root, config = fixture()
        (root / 'app/icon.png').rename(root / 'unused-icon.png')
        with self.assertRaises(OSError):
            module.prepare(config, root)
        self.assertFalse((root / '.local/frame-2020').exists())


def check_native_policy(dotnet):
    root, config = fixture()
    output = module.prepare(config, root)
    test = output / 'policy-check'
    test.mkdir()
    sdk = subprocess.check_output([dotnet, '--version'], text=True).strip()
    major = int(sdk.split('.')[0])
    if major < 6:
        raise SystemExit('Use a .NET 6 or newer host SDK for offline policy checks.')
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',
               DOTNET_GENERATE_ASPNET_CERTIFICATE='false', DOTNET_CLI_HOME=str(test / 'cli'))
    for folder, name in [('home', 'Home'), ('startup', 'Startup'), ('router', 'Route')]:
        subprocess.run([dotnet, 'build', str(output / folder / (name + '.csproj')),
                        '--nologo', '-o', str(output / folder / 'out')],
                       check=True, env=env, timeout=180)
    project = ET.Element('Project', Sdk='Microsoft.NET.Sdk')
    props = ET.SubElement(project, 'PropertyGroup')
    for key, value in {'TargetFramework': 'net' + str(major) + '.0', 'OutputType': 'Exe', 'LangVersion': '8.0',
                       'StartupObject': 'PolicyChecks', 'EnableDefaultCompileItems': 'false'}.items():
        ET.SubElement(props, key).text = value
    items = ET.SubElement(project, 'ItemGroup')
    for path in [output / 'home/Home.cs', output / 'startup/Startup.cs',
                 output / 'router/Route.cs', SOURCE / 'PolicyChecks.cs']:
        ET.SubElement(items, 'Compile', Include=str(path))
    path = test / 'PolicyChecks.csproj'
    path.write_bytes(ET.tostring(project, encoding='utf-8', xml_declaration=True))
    subprocess.run([dotnet, 'build', str(path), '--nologo', '-o', str(test / 'out')],
                   check=True, env=env, timeout=180)
    subprocess.run([dotnet, str(test / 'out/PolicyChecks.dll')], check=True, env=env, timeout=20)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet', help='Also compile all helper source and run native restore-policy checks.')
    args = parser.parse_args()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PreparationTests)
    if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
        raise SystemExit(1)
    if args.dotnet:
        check_native_policy(args.dotnet)
