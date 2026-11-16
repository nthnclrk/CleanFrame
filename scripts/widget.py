"""Write the unsigned widget archive from app/ for packaging and public export."""
from pathlib import Path
import zipfile
from local_config import override_identity
from private_files import check_widget, generated_path, private_path, secret_content

ROOT = Path(__file__).resolve().parents[1]


def write_widget_archive(output, root=ROOT, identity=None):
    """Create an unsigned archive without reading signing or device settings."""
    app = root / 'app'
    overrides = {}
    if identity is not None:
        overrides['config.xml'] = override_identity((app / 'config.xml').read_bytes(), identity)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, allowZip64=False) as package:
        for source in sorted(app.rglob('*')):
            name = source.relative_to(app).as_posix()
            # SDK build output is never an input. Skip it before inspecting
            # copied keys, fonts or symlinks.
            if generated_path(name):
                continue
            if source.is_symlink():
                raise ValueError('Widget assets must be regular files, not symlinks: ' + name)
            if not source.is_file():
                continue
            if private_path(name) or secret_content(source.read_bytes()):
                raise ValueError('Private material in app source: ' + name)
            if name.startswith('assets/private-fonts/'):
                raise ValueError('Private font binaries must stay in .local/, not app/.')
            if name not in overrides:
                package.write(source, name)
        for name, data in sorted(overrides.items()):
            package.writestr(name, data)
    check_widget(output)
