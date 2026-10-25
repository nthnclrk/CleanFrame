"""Sign our public-font widget using the owner's official Tizen SDK profile."""
import argparse
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import sys
import time
import zipfile
from font_assets import ROOT, write_widget_archive
from local_config import load_config, installation_manifest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--profile', help='Override the locally configured Samsung TV signing profile')
args = parser.parse_args()
config = load_config()
profile = args.profile or config['signing']['profile']
cli = config['sdk'] / 'tools/ide/bin/tizen'
password_file = config['password_path']
if not cli.is_file():
    raise SystemExit('Official Tizen SDK missing. See docs/local-testing.md.')
password = password_file.read_bytes().strip() if password_file and password_file.is_file() else None
if password_file and password_file.exists():
    password_file.chmod(0o600)
subprocess.run([sys.executable, str(ROOT / 'scripts/check-public.py')], cwd=ROOT, check=True)

# Only packaged runtime assets and their notices enter this archive.
# SDKs, device details, native helpers and signing keys never enter app/.
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
unsigned = dist / 'CleanFrame-unsigned.wgt'
write_widget_archive(unsigned, include_private=False, manifest=installation_manifest(config))
with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED) as archive:
    for notice in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        archive.write(ROOT / notice, notice)
signed_dir = dist / 'signed'
signed_dir.mkdir(exist_ok=True)
# Reject stale output if a later signing attempt fails.
signed = signed_dir / unsigned.name
if signed.exists():
    signed.rename(signed.with_name(signed.name + '.previous'))
target = dist / 'CleanFrame.wgt'
if target.exists():
    target.rename(target.with_name(target.name + '.previous'))
command = [str(cli), 'package', '-t', 'wgt', '-s', profile, '-o', str(signed_dir), '--', str(unsigned)]
pid, terminal = pty.fork()
if pid == 0:
    os.execv(command[0], command)
output = b''
passwords = saves = 0
failure = None
deadline = time.monotonic() + 60
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([terminal], [], [], 1)
        if not ready:
            continue
        try:
            chunk = os.read(terminal, 8192)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
        count = output.lower().count(b'password:')
        if count > passwords:
            if not password:
                failure = 'SDK needs a certificate password. Configure it locally; see docs/local-testing.md.'
                break
            os.write(terminal, password + b'\n')
            passwords = count
        count = output.count(b'No: (N) ?')
        if count > saves:
            os.write(terminal, b'n\n')
            saves = count
    else:
        failure = 'SDK signing timed out.'
finally:
    if failure:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    os.close(terminal)
    _, status = os.waitpid(pid, 0)
if failure:
    raise SystemExit(failure)
if os.waitstatus_to_exitcode(status) != 0 or b'is created successfully' not in output or not signed.is_file():
    # SDK diagnostics can contain profile paths or secrets. Keep them local.
    diagnostics = output.replace(password, b'[redacted]') if password else output
    log = ROOT / '.local/signing-output.txt'
    log.write_bytes(diagnostics)
    log.chmod(0o600)
    raise SystemExit('SDK did not confirm signing. Inspect .local/signing-output.txt locally.')
with zipfile.ZipFile(signed) as package:
    if not {'author-signature.xml', 'signature1.xml'}.issubset(package.namelist()):
        raise SystemExit('Package is missing Samsung signing files.')
target.write_bytes(signed.read_bytes())
print('Signed widget created: ' + str(target))
