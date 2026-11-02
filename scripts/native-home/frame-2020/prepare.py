"""Prepare owner-configured 2020 Frame helper source. No SDK or TV connection."""
import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
PROFILE = 'ls03t-t-nkmdeuc-2743.0'
NS = 'http://tizen.org/ns/packages'


def identity(value):
    if not isinstance(value, dict) or set(value) != {'package_id', 'app_id'}:
        raise ValueError('Each identity needs package_id and app_id.')
    package, app = value['package_id'], value['app_id']
    if not isinstance(package, str) or not re.fullmatch(r'[A-Za-z0-9]{10}', package):
        raise ValueError('Use a ten-character SDK-generated package identity.')
    if not isinstance(app, str) or not re.fullmatch(re.escape(package) + r'\.[A-Za-z0-9_-]{1,52}', app):
        raise ValueError('The application identity must belong to its package.')
    return package, app


def validate(config):
    if not isinstance(config, dict) or set(config) != {'profile', 'launcher', 'router'}:
        raise ValueError('Use only profile, launcher, and router; keep signing secrets elsewhere.')
    if config['profile'] != PROFILE:
        raise ValueError('This source covers only the reviewed LS03T firmware profile.')
    launcher, _ = identity(config['launcher'])
    router, _ = identity(config['router'])
    if launcher == router:
        raise ValueError('The optional Home router must have its own SDK identity.')


def project(assembly, source):
    root = ET.Element('Project', Sdk='Microsoft.NET.Sdk')
    group = ET.SubElement(root, 'PropertyGroup')
    for key, value in {'AssemblyName': assembly, 'TargetFramework': 'netcoreapp3.0',
                       'OutputType': 'Exe', 'UseAppHost': 'false', 'LangVersion': '8.0',
                       'EnableDefaultCompileItems': 'false'}.items():
        ET.SubElement(group, key).text = value
    items = ET.SubElement(root, 'ItemGroup')
    ET.SubElement(items, 'Compile', Include=source)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def router_manifest(config):
    ET.register_namespace('', NS)
    tag = lambda name: '{' + NS + '}' + name
    package, app = identity(config['router'])
    root = ET.Element(tag('manifest'), {'package': package, 'version': '1.0.0',
                                      'api-version': '5.0', 'type': 'tpk'})
    ET.SubElement(root, tag('profile'), name='tv')
    ET.SubElement(root, tag('label')).text = 'CleanFrame Home route'
    ET.SubElement(root, tag('description')).text = 'A Home key route for the owner-configured launcher.'
    ui = ET.SubElement(root, tag('ui-application'), {'appid': app,
        'exec': 'CleanFrameHomeRoute.dll', 'type': 'dotnet', 'multiple': 'false',
        'nodisplay': 'true', 'taskmanage': 'false', 'launch_mode': 'single'})
    ET.SubElement(ui, tag('label')).text = 'CleanFrame Home route'
    ET.SubElement(ui, tag('icon')).text = 'icon.png'
    privileges = ET.SubElement(root, tag('privileges'))
    ET.SubElement(privileges, tag('privilege')).text = 'http://tizen.org/privilege/appmanager.launch'
    context = ET.SubElement(root, tag('app-context'), appid=app)
    rule = ET.SubElement(context, tag('app-context-rule'))
    ET.SubElement(rule, tag('source'), selector='key', override='true').text = 'XF86Home'
    ET.SubElement(rule, tag('target'), selector='app', request='launch',
                  args='entry_point:cleanframe_home').text = config['launcher']['app_id']
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def prepare(config, root=ROOT):
    validate(config)
    root = Path(root).resolve()
    local = root / '.local'
    output = local / 'frame-2020'
    if local.is_symlink() or output.is_symlink():
        raise ValueError('The private output directory must not be a symlink.')
    if output.exists():
        raise ValueError('Output already exists. Preserve it before preparing another profile.')
    replacements = {'@@LAUNCHER_PACKAGE_ID@@': config['launcher']['package_id'],
                    '@@LAUNCHER_APP_ID@@': config['launcher']['app_id']}
    generated = {}
    for template in ['Home.cs', 'Startup.cs', 'Route.cs']:
        text = (SOURCE / (template + '.in')).read_text()
        for key, value in replacements.items():
            text = text.replace(key, value)
        if '@@' in text:
            raise ValueError('Unresolved source template field.')
        generated[template] = text
    icon = (root / 'app/icon.png').read_bytes()
    manifest = router_manifest(config)
    # Validate all inputs before creating output. Nothing is installed or signed.
    output.mkdir(parents=True, mode=0o700)
    (output / 'profile.json').write_text(json.dumps(config, indent=2) + '\n')
    (output / 'profile.json').chmod(0o600)
    for folder, source, assembly in [('home', 'Home.cs', 'CleanFrame2020Home'),
                                     ('startup', 'Startup.cs', 'CleanFrame2020Startup'),
                                     ('router', 'Route.cs', 'CleanFrameHomeRoute')]:
        dest = output / folder
        dest.mkdir()
        (dest / source).write_text(generated[source])
        (dest / (source.removesuffix('.cs') + '.csproj')).write_bytes(project(assembly, source))
    package = output / 'router/package'
    (package / 'shared/res').mkdir(parents=True)
    (package / 'tizen-manifest.xml').write_bytes(manifest)
    (package / 'shared/res/icon.png').write_bytes(icon)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True,
                        help='Owner configuration under .local/; never a signing password file.')
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text())
        prepare(config)
    except (OSError, ValueError) as error:
        # Do not echo config contents, identities, paths, or credentials.
        raise SystemExit(str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError)
                         else 'Cannot read the profile or prepare private output.') from None
    print('Prepared helper source and router manifest under .local/frame-2020/. No TV connection made.')


if __name__ == '__main__':
    main()
