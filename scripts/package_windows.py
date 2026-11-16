"""Windows packaging runner: same build and checks as package.py, without POSIX terminals.

It requires SDK-managed password access (Certificate Manager); a password file is not supported here.
Prompts cannot be answered, so stdin is closed and a prompt fails instead of hanging.
"""
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from font_assets import write_widget_archive
from local_config import ROOT, load_settings
from private_files import check_signed_widget


def main(root=ROOT):
    settings = load_settings(root)
    if settings['password_file']:
        raise ValueError('package_windows.py uses SDK-managed passwords only. Set password_file to null.')
    cli = settings['sdk_path'] / 'tools/ide/bin/tizen.bat'
    if not cli.is_file():
        raise ValueError('Tizen CLI missing. Set sdk_path in .local/signing.json.')
    dist = root / 'dist'
    dist.mkdir(exist_ok=True)
    unsigned = dist / 'CleanFrame-unsigned.wgt'
    write_widget_archive(unsigned, root=root, identity=settings['identity'])
    signed_dir = Path(tempfile.mkdtemp(prefix='signed-', dir=dist))
    command = [str(cli), 'package', '-t', 'wgt', '-s', settings['profile'], '-o', str(signed_dir), '--', str(unsigned)]
    # SDK output is suppressed so certificate details never reach diagnostics.
    result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    signed = signed_dir / unsigned.name
    if result.returncode != 0 or not signed.is_file():
        raise ValueError('SDK signing failed. Check the selected profile and password access in Certificate Manager.')
    check_signed_widget(signed, settings['identity'])
    target = dist / 'CleanFrame.wgt'
    ready = signed_dir / 'validated.wgt'
    ready.write_bytes(signed.read_bytes())
    ready.replace(target)
    print('Signed widget created: ' + str(target))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, ValueError) else 'Cannot complete packaging. Check SDK/profile setup and local file permissions.'
        sys.exit(message)
