"""Shared private-file rules for source checks and widget packaging."""
from pathlib import Path
import re

FONT_SUFFIXES = {'.ttf', '.otf', '.woff', '.woff2', '.eot'}
PRIVATE_SUFFIXES = {'.p12', '.pfx', '.pkcs12', '.jks', '.keystore', '.pem', '.key', '.csr', '.wgt'}
PRIVATE_NAMES = {'config.json', 'config.local.json', 'signing.local.json',
                 'certificate-password.txt', 'profiles.xml', '.env', 'session.json'}
CREDENTIAL_PATTERNS = [
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{25,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{25,}'),
    re.compile(rb'AKIA[A-Z0-9]{16}'),
]


def is_private_path(name):
    path = Path(name)
    return (name.startswith(('.local/', 'dist/', 'node_modules/', 'certificates/', 'workspace/',
                             'app/assets/private-fonts/', 'explorations/', 'docs/research/', 'docs/articles/'))
            or path.suffix.lower() in PRIVATE_SUFFIXES
            or (path.name.startswith('PP') and path.suffix.lower() in FONT_SUFFIXES)
            or path.name.startswith('.env.')
            or path.name in PRIVATE_NAMES)
