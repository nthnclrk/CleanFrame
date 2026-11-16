"""Build an unsigned public widget without signing credentials or a TV."""
from pathlib import Path
import hashlib
import json
import zipfile

from widget import ROOT, write_widget_archive
from private_files import check_widget

output = ROOT / 'dist/CleanFrame-public-unsigned.wgt'
output.parent.mkdir(exist_ok=True)
write_widget_archive(output)
with zipfile.ZipFile(output, 'a', zipfile.ZIP_DEFLATED) as archive:
    names = archive.namelist()
    fonts = [name for name in names if Path(name).suffix.lower() in ['.ttf', '.otf', '.woff', '.woff2']]
    assert fonts == [], 'Unexpected font in public widget: ' + ', '.join(fonts)
    for notice in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        assert (ROOT / notice).is_file(), 'Missing distribution notice: ' + notice
        archive.write(ROOT / notice, notice)
check_widget(output)
# Notices accompany the widget; original upstream asset licences are also in app/.
for notice in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
    (output.parent / notice).write_bytes((ROOT / notice).read_bytes())
report = {'file': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
          'bytes': output.stat().st_size, 'private_fonts': False, 'signed': False,
          'scope': 'Offline unsigned export; the TV system font, no font files. Asset terms still apply; no TV contacted.'}
(output.parent / 'public-export.json').write_text(json.dumps(report, indent=2) + '\n')
print('Created ' + str(output.relative_to(ROOT)))
print('Unsigned; no font files (the TV system font). No credentials or TV connection used.')
