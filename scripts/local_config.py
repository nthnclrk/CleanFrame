"""Load per-installation settings; never embed host settings or secrets in app/."""
import ipaddress
import json
from pathlib import Path
import re
import xml.etree.ElementTree as XML

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / '.local/config.json'


def load_config():
    if not CONFIG.is_file():
        raise SystemExit('Copy config.example.json to .local/config.json and fill it in locally.')
    CONFIG.chmod(0o600)
    try:
        config = json.loads(CONFIG.read_text())
        ipaddress.ip_address(config['tv']['host'])
        package = config['application']['package_id']
        app_id = config['application']['app_id']
        if not re.fullmatch(r'[A-Za-z0-9]{10}', package) or package == 'CleanFrame':
            raise ValueError('Use your SDK-generated package ID')
        if not re.fullmatch(re.escape(package) + r'\.[A-Za-z0-9_-]+', app_id):
            raise ValueError('Application ID must belong to that package')
        if not re.fullmatch(r'[A-Za-z0-9_-]+', config['signing']['profile']):
            raise ValueError('Invalid signing profile name')
        config['sdk'] = (ROOT / config['sdk_path']).resolve()
        password_file = config['signing'].get('password_file')
        config['password_path'] = (ROOT / password_file).resolve() if password_file else None
        if config['password_path'] and not config['password_path'].is_relative_to((ROOT / '.local').resolve()):
            raise ValueError('Keep signing password files inside ignored .local/')
    except (KeyError, TypeError, ValueError):
        # Do not echo malformed settings, which may contain secrets.
        raise SystemExit('Invalid local configuration; check config.example.json and docs/local-testing.md.')
    return config


def installation_manifest(config):
    XML.register_namespace('', 'http://www.w3.org/ns/widgets')
    XML.register_namespace('tizen', 'http://tizen.org/ns/widgets')
    tree = XML.parse(ROOT / 'app/config.xml')
    identity = tree.getroot().find('{http://tizen.org/ns/widgets}application')
    identity.set('package', config['application']['package_id'])
    identity.set('id', config['application']['app_id'])
    return XML.tostring(tree.getroot(), encoding='UTF-8', xml_declaration=True)
