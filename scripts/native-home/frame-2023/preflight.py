"""Read-only host preflight for one LS03C Home action; does not stage or write to the TV."""
import argparse
import datetime
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

from prepare import ROOT, validate

MODEL = 'QN32LS03CBFXZA'
ACTIONS = ('query', 'capture', 'apply', 'restore')


def check_host(value):
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        raise ValueError('Use the TV local IPv4 address.') from None
    networks = [ipaddress.ip_network('10.0.0.0/8'), ipaddress.ip_network('172.16.0.0/12'),
                ipaddress.ip_network('192.168.0.0/16')]
    if address.version != 4 or not any(address in network for network in networks):
        raise ValueError('Use the TV local IPv4 address.')
    return str(address)


def read_tv_model(host):
    with urllib.request.urlopen('http://' + host + ':8001/api/v2/', timeout=5) as response:
        if response.status != 200:
            raise ValueError('TV metadata is unavailable.')
        content = response.read(65537)
    if len(content) > 65536:
        raise ValueError('Unexpected TV metadata.')
    data = json.loads(content)
    if not isinstance(data, dict) or not isinstance(data.get('device'), dict):
        raise ValueError('TV metadata is unavailable.')
    return data['device'].get('modelName')


def run_sdb(sdb, *args):
    p = subprocess.run([str(sdb), *args], capture_output=True, text=True, timeout=10)
    if p.returncode or len(p.stdout) > 1048576:
        raise ValueError('The developer connection did not return a valid response.')
    return p.stdout


def preflight(host, sdb, action, root=ROOT):
    root = Path(root).resolve()
    local = root / '.local'
    folder = local / 'frame-2023'
    if local.is_symlink() or folder.is_symlink() or not folder.is_dir():
        raise ValueError('Prepare the private profile directory first.')
    destination = folder / 'cf2023home-preflight.json'
    if destination.is_symlink():
        raise ValueError('The preflight file must not be a symlink.')
    # A failed refresh must never leave a previously valid authorization in place.
    destination.unlink(missing_ok=True)
    host = check_host(host)
    if action not in ACTIONS:
        raise ValueError('Unknown action.')
    profile_path = folder / 'profile.json'
    if profile_path.is_symlink():
        raise ValueError('The private profile must not be a symlink.')
    config = json.loads(profile_path.read_text())
    validate(config)
    target = config['launcher']['app_id']
    sdb = Path(sdb).expanduser().resolve()
    if not sdb.is_file() or not os.access(sdb, os.X_OK):
        raise ValueError('Use an executable SDB path.')
    if read_tv_model(host) != MODEL:
        raise ValueError('TV model does not match this profile.')
    serial = host + ':26101'
    lines = run_sdb(sdb, 'devices').splitlines()
    if sum(line.split() == [serial, 'device', MODEL] for line in lines) != 1:
        raise ValueError('The expected TV developer connection is not uniquely available.')
    duid = run_sdb(sdb, '-s', serial, 'shell', '0 getduid').strip()
    if not 5 <= len(duid) <= 512 or any(x in duid.lower() for x in ('closed', 'fail', 'error')):
        raise ValueError('TV identity was not available.')
    installed = False
    if action == 'apply':
        output = run_sdb(sdb, '-s', serial, 'shell', '0 applist')
        if any(x in output.lower() for x in ('closed', 'failed', 'error')):
            raise ValueError('Installed app list was unavailable.')
        rows = re.findall(r"(?m)^\s*'[^'\r\n]*'\s+'([^'\r\n]+)'\s*$", output)
        if rows.count(target) != 1:
            raise ValueError('The exact configured app ID was not uniquely found.')
        installed = True
    data = {'Model': MODEL, 'DeviceIdentitySha256': hashlib.sha256(duid.encode()).hexdigest(),
            'Action': action, 'TargetApp': target, 'TargetInstalled': installed,
            'TimeUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    fd, tmp = tempfile.mkstemp(prefix='.preflight-', dir=folder)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, destination)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True, help='Local IPv4 address of the reviewed TV')
    parser.add_argument('--sdb', type=Path, required=True, help='Path to the Samsung developer bridge')
    parser.add_argument('--action', choices=ACTIONS, required=True)
    args = parser.parse_args()
    try:
        preflight(args.host, args.sdb, args.action)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Do not print subprocess output, IP addresses, device identity, or private paths.
        raise SystemExit(str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError)
                         else 'Host preflight failed; no TV state was changed.') from None
    print('Private preflight refreshed. No TV state was changed.')


if __name__ == '__main__':
    main()
