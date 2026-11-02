"""Shared, bounded checks for private files and recognisable credentials."""
from pathlib import PurePosixPath
import re
import zipfile
from local_config import manifest_identity

PRIVATE_SUFFIXES = {'.p12', '.pfx', '.pkcs12', '.jks', '.keystore', '.pem', '.key', '.csr'}
PRIVATE_NAMES = {'profiles.xml', 'certificate-password.txt', 'session.json', '.env',
                 'signing.json', 'device.json', 'sdk.info'}
SECRET_PATTERNS = [
    rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
    rb'gh[pousr]_[A-Za-z0-9]{25,}', rb'github_pat_[A-Za-z0-9_]{25,}',
    rb'AKIA[A-Z0-9]{16}',
]


def generated_path(name):
    """SDK output can contain copied fonts, signatures and local credentials."""
    return '.buildresult' in PurePosixPath(name.replace('\\', '/').lower()).parts


def private_path(name):
    path = PurePosixPath(name.replace('\\', '/').lower())
    return (generated_path(name) or any(part in {'.local', '.git'} for part in path.parts)
            or path.suffix in PRIVATE_SUFFIXES
            or path.name in PRIVATE_NAMES
            or path.name.startswith('.env.')
            or path.name.endswith('.local.json'))


def secret_content(data):
    lowered = data.lower()
    profile = (b'<profiles' in lowered and b'profileitem' in lowered
               and re.search(rb'\bpassword\s*=', lowered))
    return bool(profile) or any(re.search(pattern, data) for pattern in SECRET_PATTERNS)


def check_widget(path, require_signed=False):
    """Allow public signing certificates; reject private material by name/content."""
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if require_signed and not {'author-signature.xml', 'signature1.xml'}.issubset(names):
            raise ValueError('Package is missing its signing files.')
        for name in names:
            if private_path(name) or secret_content(archive.read(name)):
                raise ValueError('Private material in widget: ' + name)


def check_signed_widget(path, identity):
    check_widget(path, require_signed=True)
    with zipfile.ZipFile(path) as archive:
        try:
            actual = manifest_identity(archive.read('config.xml'))
        except KeyError:
            raise ValueError('Signed widget is missing config.xml.') from None
    if actual != identity:
        raise ValueError('Widget identity differs from the selected identity. Package again before installing.')
