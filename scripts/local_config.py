"""Local signing settings. Importing this module reads no local configuration."""
import json
import os
from pathlib import Path
import re
import stat
import xml.etree.ElementTree as XML

ROOT = Path(__file__).resolve().parents[1]
APPLICATION = '{http://tizen.org/ns/widgets}application'


def manifest_identity(data):
    try:
        items = XML.fromstring(data).findall(APPLICATION)
    except XML.ParseError:
        raise ValueError('Widget manifest is not valid XML.') from None
    if len(items) != 1:
        raise ValueError('Manifest must contain exactly one application identity.')
    item = items[0]
    identity = {'package_id': item.get('package'), 'app_id': item.get('id')}
    validate_identity(identity)
    return identity


def override_identity(data, identity):
    """Change only the two identity values; retain manifest bytes and prefixes."""
    validate_identity(identity)
    manifest_identity(data)
    tags = list(re.finditer(rb'<tizen:application\b[^>]*>', data))
    if len(tags) != 1:
        raise ValueError('Expected one tizen:application tag in the source manifest.')
    tag = tags[0].group()
    for attribute, value in [('package', identity['package_id']), ('id', identity['app_id'])]:
        pattern = rb'(?<![\w:.-])(' + attribute.encode() + rb'\s*=\s*)([\"\'])([^\"\']*)\2'
        tag, count = re.subn(pattern, lambda match: match[1] + match[2] + value.encode() + match[2], tag)
        if count != 1:
            raise ValueError('Expected one ' + attribute + ' attribute in the application tag.')
    result = data[:tags[0].start()] + tag + data[tags[0].end():]
    if manifest_identity(result) != identity:
        raise ValueError('Manifest identity override could not be verified.')
    return result


def override_required_version(data, version):
    """Change only the declared platform minimum; the source manifest keeps its own value."""
    validate_required_version(version)
    tags = list(re.finditer(rb'<tizen:application\b[^>]*>', data))
    if len(tags) != 1:
        raise ValueError('Expected one tizen:application tag in the source manifest.')
    pattern = rb'(?<![\w:.-])(required_version\s*=\s*)([\"\'])([^\"\']*)\2'
    tag, count = re.subn(pattern, lambda match: match[1] + match[2] + version.encode() + match[2], tags[0].group())
    if count != 1:
        raise ValueError('Expected one required_version attribute in the application tag.')
    result = data[:tags[0].start()] + tag + data[tags[0].end():]
    if XML.fromstring(result).find(APPLICATION).get('required_version') != version:
        raise ValueError('Manifest required_version override could not be verified.')
    return result


def validate_required_version(version):
    if not isinstance(version, str) or not re.fullmatch(r'[1-9][0-9]?\.[0-9]', version):
        raise ValueError('required_version must be a Tizen platform version such as 5.5.')


def validate_identity(identity):
    package = identity.get('package_id')
    app = identity.get('app_id')
    if not isinstance(package, str) or not re.fullmatch(r'[A-Za-z0-9]{10}', package):
        raise ValueError('package_id must be the ten-character SDK-generated package ID.')
    if not isinstance(app, str) or not re.fullmatch(re.escape(package) + r'\.[A-Za-z0-9_-]{1,52}', app):
        raise ValueError('app_id must use package_id followed by a valid application name.')


def local_path(value, root):
    if not isinstance(value, str) or not value.strip() or '\x00' in value:
        raise ValueError('Local paths must be non-empty strings.')
    path = Path(value).expanduser()
    return (path if path.is_absolute() else root / path).absolute()


def load_settings(root=ROOT):
    """Use the existing SDK profile; never edit certificates, profiles or SDK files."""
    path = root / '.local/signing.json'
    config = {}
    if path.exists():
        try:
            config = json.loads(path.read_text())
        except (ValueError, OSError):
            raise ValueError('Cannot read .local/signing.json as JSON.') from None
    allowed = {'sdk_path', 'profile', 'password_file', 'package_id', 'app_id', 'required_version'}
    if not isinstance(config, dict) or set(config) - allowed:
        raise ValueError('Unknown signing setting. See signing.example.json; do not put passwords in JSON.')
    if path.exists() and 'profile' not in config:
        raise ValueError('Set profile in .local/signing.json to your existing SDK certificate profile.')
    profile = config.get('profile', 'FrameHome')
    if not isinstance(profile, str) or not profile.strip() or any(ord(char) < 32 for char in profile):
        raise ValueError('profile must be a non-empty certificate profile name.')
    identity = manifest_identity((root / 'app/config.xml').read_bytes())
    if ('package_id' in config) != ('app_id' in config):
        raise ValueError('Set both package_id and app_id, or neither.')
    if 'package_id' in config:
        identity = {key: config[key] for key in ['package_id', 'app_id']}
        validate_identity(identity)
    required_version = config.get('required_version')
    if required_version is not None:
        validate_required_version(required_version)
    legacy_password = root / '.local/certificates/private/certificate-password.txt'
    # Only an absent config enables the original maintainer password-file default.
    password = config.get('password_file') if path.exists() else (str(legacy_password) if legacy_password.exists() else None)
    return {'sdk_path': local_path(config.get('sdk_path', '.local/tizen-sdk'), root).resolve(),
            'profile': profile, 'identity': identity, 'required_version': required_version,
            'password_file': local_path(password, root) if password is not None else None}


def read_password(path, root=ROOT):
    """Read an owner-only regular file outside app/ and tracked source folders."""
    path = Path(path)
    resolved = path.resolve()
    if any(resolved.is_relative_to((root / folder).resolve()) for folder in ['app', '.git']):
        raise ValueError('Password file must stay outside app/ and .git/.')
    if resolved.is_relative_to(root.resolve()) and not resolved.is_relative_to((root / '.local').resolve()):
        raise ValueError('Keep the password file in .local/ or outside this repository.')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) not in {0o600, 0o400}:
            raise ValueError('Password file must be a regular file owned by you with mode 600 or 400.')
        password = source.read(4099).removesuffix(b'\n').removesuffix(b'\r')
    if not password or len(password) > 4096 or any(char in password for char in [b'\r', b'\n', b'\x00']):
        raise ValueError('Password file must contain one non-empty password line.')
    return password
