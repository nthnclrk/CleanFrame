"""Connect, inspect, install or launch CleanFrame. These commands preserve Home/startup settings."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import time
import zipfile
from local_config import load_settings
from private_files import check_signed_widget

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['info', 'install', 'launch'])
parser.add_argument('--host')
args = parser.parse_args()
config_file = ROOT / '.local/device.json'
config = json.loads(config_file.read_text()) if config_file.exists() else {}
host = args.host or config.get('host')
if not host:
    raise SystemExit('Add the TV address to .local/device.json or pass --host.')
ipaddress.ip_address(host)
try:
    settings = load_settings()
    sdb = settings['sdk_path'] / ('tools/sdb.exe' if sys.platform == 'win32' else 'tools/sdb')
    if not sdb.is_file():
        raise ValueError('Local SDB tool missing. See docs/development.md.')
    app_id = settings['identity']['app_id']
    # Reject a mismatched or unsafe package before connecting to the device.
    widget = ROOT / 'dist/CleanFrame.wgt'
    if args.action == 'install':
        if not widget.exists():
            raise ValueError('Run npm run package first.')
        check_signed_widget(widget, settings['identity'])
except (ValueError, OSError, zipfile.BadZipFile) as error:
    message = str(error) if isinstance(error, ValueError) else 'Cannot read local SDK settings or signed widget.'
    raise SystemExit(message) from None


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
