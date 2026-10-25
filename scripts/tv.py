"""Connect, inspect, install or launch CleanFrame. These commands preserve Home/startup settings."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as XML
import zipfile
from local_config import load_config

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['info', 'install', 'launch'])
parser.add_argument('--host')
args = parser.parse_args()
config = load_config()
host = args.host or config['tv']['host']
ipaddress.ip_address(host)
sdb = config['sdk'] / 'tools/sdb'
if not sdb.exists():
    raise SystemExit('Local SDB tool missing. See docs/development.md.')
app_id = config['application']['app_id']
widget = ROOT / 'dist/CleanFrame.wgt'
if args.action == 'install':
    if not widget.is_file():
        raise SystemExit('Run npm run package first.')
    with zipfile.ZipFile(widget) as archive:
        if not {'author-signature.xml', 'signature1.xml'}.issubset(archive.namelist()):
            raise SystemExit('Widget is unsigned; no TV connection attempted.')
        manifest = XML.fromstring(archive.read('config.xml'))
        identity = manifest.find('{http://tizen.org/ns/widgets}application')
        if identity is None or identity.get('id') != app_id or identity.get('package') != config['application']['package_id']:
            raise SystemExit('Widget identity differs from local config; rebuild before installation.')


def run(*command, quiet=False):
    result = subprocess.run([str(sdb), *command], text=True, capture_output=True, timeout=45)
    output = result.stdout + result.stderr
    if not quiet:
        print(output, end='' if output.endswith('\n') else '\n', flush=True)
    if result.returncode:
        raise SystemExit('SDB command failed.')
    return output


serial = host + ':26101'
connected = run('connect', serial)
if 'connected to ' not in connected.lower() and 'already connected' not in connected.lower():
    raise SystemExit('TV connection was not confirmed.')
if args.action == 'info':
    run('-s', serial, 'capability')
elif args.action == 'launch':
    output = run('-s', serial, 'shell', '0', 'execute', app_id)
    if 'successfully launched' not in output:
        raise SystemExit('App launch was not confirmed. Check the TV.')
else:
    digest = hashlib.sha256(widget.read_bytes()).hexdigest()[:12]
    remote = '/home/owner/share/tmp/sdk_tools/CleanFrame-' + digest + '-' + str(time.time_ns()) + '.wgt'
    pushed = run('-s', serial, 'push', str(widget), remote)
    if '1 file(s) pushed' not in pushed or 'failed' in pushed.lower():
        raise SystemExit('Widget transfer was not confirmed.')
    output = run('-s', serial, 'shell', '0', 'vd_appinstall', app_id, remote)
    if 'install completed' not in output or 'install failed' in output:
        raise SystemExit('TV installation failed or was not confirmed.')
    installed = run('-s', serial, 'shell', '0', 'applist', quiet=True)
    if app_id not in installed:
        raise SystemExit('App was not found in the installed-app list.')
    print('CleanFrame installation confirmed. Startup defaults are unchanged.')
