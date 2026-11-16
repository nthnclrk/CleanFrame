"""Build a public-font unsigned widget without signing credentials or a TV."""
from pathlib import Path
import hashlib
import json
import zipfile

from font_assets import ROOT, write_widget_archive
from private_files import check_widget

output = ROOT / 'dist/CleanFrame-public-unsigned.wgt'
output.parent.mkdir(exist_ok=True)
write_widget_archive(output, include_private=False)
with zipfile.ZipFile(output, 'a', zipfile.ZIP_DEFLATED) as archive:
    names = archive.namelist()
    assert not any(name.startswith('assets/private-fonts/') for name in names), 'Private font in public widget'
    assert not any(Path(name).name.startswith('PP') and Path(name).suffix.lower() in ['.ttf', '.otf', '.woff', '.woff2'] for name in names), 'Proprietary font in public widget'
    assert 'CleanFramePrivateFontIDs = []' in archive.read('assets/font-catalog.js').decode(), 'Unexpected public font catalogue'
    for notice in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        assert (ROOT / notice).is_file(), 'Missing distribution notice: ' + notice
        archive.write(ROOT / notice, notice)
check_widget(output)
# Notices accompany the widget; original upstream asset licences are also in app/.
for notice in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
    (output.parent / notice).write_bytes((ROOT / notice).read_bytes())
report = {'file': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
          'bytes': output.stat().st_size, 'private_fonts': False, 'signed': False,
          'scope': 'Offline public-font export only. Asset terms still apply; no TV contacted.'}
(output.parent / 'public-export.json').write_text(json.dumps(report, indent=2) + '\n')
print('Created ' + str(output.relative_to(ROOT)))
print('Unsigned; public fonts only. No credentials or TV connection used.')
