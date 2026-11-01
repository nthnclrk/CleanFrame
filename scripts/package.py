"""Build and sign through an existing official Tizen SDK profile (macOS/Linux)."""
import os
from pathlib import Path
import pty
import select
import signal
import tempfile
import termios
import time
import zipfile

from font_assets import write_widget_archive
from local_config import ROOT, load_settings, read_password
from private_files import check_signed_widget


def sign(command, password=None, timeout=60):
    # SDK output can include profile credentials. Never copy it to diagnostics.
    pid, terminal = pty.fork()
    if pid == 0:
        try:
            os.execv(command[0], command)
        except BaseException:
            os._exit(127)
    output = b''
    passwords = saves = 0
    status = None
    deadline = time.monotonic() + timeout
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
            if len(output) > 1024 * 1024:
                raise ValueError('SDK produced excessive signing output.')
            count = output.lower().count(b'password:')
            if count > passwords:
                if password is None:
                    raise ValueError('SDK requested a password. Configure saved profile access or select a protected password file.')
                if count > 2:
                    raise ValueError('SDK requested too many passwords. Check both certificate passwords in the selected profile.')
                attributes = termios.tcgetattr(terminal)
                attributes[3] &= ~termios.ECHO
                termios.tcsetattr(terminal, termios.TCSANOW, attributes)
                os.write(terminal, password + b'\n')
                passwords = count
            count = output.count(b'No: (N) ?')
            if count > saves:
                os.write(terminal, b'n\n')
                saves = count
        else:
            raise ValueError('SDK signing timed out.')
        while time.monotonic() < deadline:
            finished, status = os.waitpid(pid, os.WNOHANG)
            if finished:
                break
            status = None
            time.sleep(0.01)
        if status is None:
            raise ValueError('SDK signing timed out.')
    finally:
        if status is None:
            finished, status = os.waitpid(pid, os.WNOHANG)
            if not finished:
                try:
                    try:
                        os.killpg(pid, signal.SIGKILL)
                    except PermissionError:
                        os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                _, status = os.waitpid(pid, 0)
        os.close(terminal)
    return os.waitstatus_to_exitcode(status)


def main(root=ROOT):
    settings = load_settings(root)
    cli = settings['sdk_path'] / 'tools/ide/bin/tizen'
    if not cli.is_file() or not os.access(cli, os.X_OK):
        raise ValueError('Tizen CLI missing. Set sdk_path in .local/signing.json; see docs/development.md.')
    password = read_password(settings['password_file'], root=root) if settings['password_file'] else None
    dist = root / 'dist'
    dist.mkdir(exist_ok=True)
    unsigned = dist / 'CleanFrame-unsigned.wgt'
    write_widget_archive(unsigned, root=root, identity=settings['identity'], required_version=settings.get('required_version'))
    # A fresh folder prevents a previous signed widget masking a failed build.
    signed_dir = Path(tempfile.mkdtemp(prefix='signed-', dir=dist))
    command = [str(cli), 'package', '-t', 'wgt', '-s', settings['profile'], '-o', str(signed_dir), '--', str(unsigned)]
    if sign(command, password):
        raise ValueError('SDK signing failed. Check the selected profile and password access in Certificate Manager.')
    signed = signed_dir / unsigned.name
    check_signed_widget(signed, settings['identity'])
    target = dist / 'CleanFrame.wgt'
    # Promote on the same filesystem so a failed copy preserves the last build.
    ready = signed_dir / 'validated.wgt'
    ready.write_bytes(signed.read_bytes())
    ready.replace(target)
    print('Signed widget created: ' + str(target))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, termios.error) as error:
        # Known validation messages contain no credentials. Suppress SDK/OS payloads.
        message = str(error) if isinstance(error, ValueError) else 'Cannot complete packaging. Check SDK/profile setup and local file permissions.'
        raise SystemExit(message) from None
