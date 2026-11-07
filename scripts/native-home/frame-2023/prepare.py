"""Prepare a private, owner-configured LS03C Home-only helper; no TV access."""
import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
PROFILE = 'ls03c-t-ksu2ecakuc-0090-2230.0'


def validate(config):
    if not isinstance(config, dict) or set(config) != {'profile', 'launcher'}:
        raise ValueError('Use only profile and launcher; keep signing secrets elsewhere.')
    if config['profile'] != PROFILE:
        raise ValueError('This source covers only the reviewed LS03C profile.')
    launcher = config['launcher']
    if not isinstance(launcher, dict) or set(launcher) != {'package_id', 'app_id'}:
        raise ValueError('Launcher needs package_id and app_id.')
    package, app = launcher['package_id'], launcher['app_id']
    if not isinstance(package, str) or not re.fullmatch(r'[A-Za-z0-9]{10}', package):
        raise ValueError('Use a ten-character SDK-generated package identity.')
    if not isinstance(app, str) or not re.fullmatch(re.escape(package) + r'\.[A-Za-z0-9_-]{1,52}', app):
        raise ValueError('The application identity must belong to its package.')


def project():
    root = ET.Element('Project', Sdk='Microsoft.NET.Sdk')
    group = ET.SubElement(root, 'PropertyGroup')
    for key, value in {'AssemblyName': 'CleanFrame2023Home', 'TargetFramework': 'net6.0',
                       'OutputType': 'Exe', 'UseAppHost': 'false',
                       'EnableDefaultCompileItems': 'false'}.items():
        ET.SubElement(group, key).text = value
    ET.SubElement(ET.SubElement(root, 'ItemGroup'), 'Compile', Include='Home.cs')
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def prepare(config, root=ROOT):
    validate(config)
    root = Path(root).resolve()
    local = root / '.local'
    output = local / 'frame-2023'
    if local.is_symlink() or output.is_symlink():
        raise ValueError('The private output directory must not be a symlink.')
    if output.exists():
        raise ValueError('Output already exists. Preserve it before preparing another profile.')
    text = (SOURCE / 'Home.cs.in').read_text()
    text = text.replace('@@LAUNCHER_PACKAGE_ID@@', config['launcher']['package_id'])
    text = text.replace('@@LAUNCHER_APP_ID@@', config['launcher']['app_id'])
    if '@@' in text:
        raise ValueError('Unresolved source template field.')
    output.mkdir(parents=True, mode=0o700)
    (output / 'profile.json').write_text(json.dumps(config, indent=2) + '\n')
    (output / 'profile.json').chmod(0o600)
    home = output / 'home'
    home.mkdir(mode=0o700)
    (home / 'Home.cs').write_text(text)
    (home / 'Home.csproj').write_bytes(project())
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    try:
        prepare(json.loads(args.config.read_text()))
    except (OSError, ValueError) as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError)
                         else 'Cannot read the profile or prepare private output.') from None
    print('Prepared Home helper under .local/frame-2023/. No TV connection made.')


if __name__ == '__main__':
    main()
