"""Check that the widget manifest and its referenced files are present."""
from pathlib import Path
import json
import xml.etree.ElementTree as XML
import re

root = Path(__file__).resolve().parents[1]
app = root / 'app'
manifest = XML.parse(app / 'config.xml').getroot()
ns = {'w': 'http://www.w3.org/ns/widgets', 't': 'http://tizen.org/ns/widgets'}
identity = manifest.find('t:application', ns)
assert identity is not None, 'Missing application identity'
assert identity.get('package') == 'nClrkHome1', 'Keep the installed package identity stable'
assert identity.get('id') == 'nClrkHome1.FrameHome', 'Keep the installed application ID stable'
assert manifest.get('version') == json.loads((root / 'package.json').read_text())['version'], 'Manifest/package versions differ'
for tag in ['content', 'icon']:
    node = manifest.find('w:' + tag, ns)
    assert node is not None and (app / node.get('src', '')).is_file(), 'Missing ' + tag + ' file'
assert all((app / name).is_file() for name in ['main.js', 'minimal.js', 'style.css'])
for reference in ['assets/wallpapers/catalog.js', 'assets/adaptive-ink.js', 'assets/font-catalog.js']:
    assert (app / reference).is_file(), 'Missing runtime catalogue: ' + reference
for filename in ['index.html']:
    source = (app / filename).read_text()
    pattern = r'(?:src|href)=[\"\']([^\"\']+)' if filename.endswith('.html') else r'from\s+[\"\']([^\"\']+)'
    for reference in re.findall(pattern, source):
        if ':' in reference or reference.startswith('$'):
            continue
        assert (app / reference).is_file(), 'Missing bundled resource: ' + reference
        if filename.endswith('.js'):
            assert reference.startswith(('./', '../')), 'Module imports must be relative paths'
for css in app.rglob('*.css'):
    source = re.sub(r'/\*.*?\*/', '', css.read_text(), flags=re.S)
    assert not re.search(r'(?:^|[;{}])\s*inset\s*:', source, re.I), 'Use explicit edges for Chromium 85: ' + str(css.relative_to(app))
    assert not re.search(r'(?:^|[;{}])\s*(?:row-|column-)?gap\s*:', source, re.I), 'Use child margins for older flex engines: ' + str(css.relative_to(app))
    for reference in re.findall(r'url\([\"\']?([^\)\"\']+)', source):
        if ':' not in reference:
            assert (css.parent / reference.split('?')[0]).is_file(), 'Missing CSS resource: ' + reference
# These resource names are constructed at runtime, so HTML/CSS reference checks cannot find them.
walls = json.loads((app / 'assets/wallpapers/SOURCES.json').read_text())
for wall in walls:
    for field in ['src', 'thumb']:
        assert (app / wall[field]).is_file(), 'Missing wallpaper: ' + wall[field]
    wall_id = wall['id']
    for suffix in ['study-soft', 'field-blur', 'field-frost', 'field-clear']:
        assert (app / ('assets/materials/' + wall_id + '-' + suffix + '.jpg')).is_file(), 'Missing registered material: ' + wall_id + '/' + suffix
    assert (app / ('assets/wallpapers/' + wall_id + '-panel.jpg')).is_file(), 'Missing panel backdrop: ' + wall_id
# Optional Minimal extras: a foreground matte (transparent PNG) and a looping muted video per wallpaper.
catalogue = (app / 'assets/wallpapers/catalog.js').read_text()
catalogue = json.loads(catalogue[catalogue.index('['):catalogue.rindex(']') + 1])
for wall in catalogue:
    for field, suffixes in [('depth', ('.png',)), ('video', ('.mp4', '.webm'))]:
        if wall.get(field):
            assert wall[field].startswith('assets/wallpapers/') and wall[field].endswith(suffixes), 'Unexpected ' + field + ' path: ' + wall[field]
            assert (app / wall[field]).is_file(), 'Missing wallpaper ' + field + ': ' + wall[field]
    if wall.get('depth'):
        # Depth masks are alpha-only, full-stage and registered to the photo; check the PNG header without Pillow.
        header = (app / wall['depth']).read_bytes()[:26]
        assert header[:8] == b'\x89PNG\r\n\x1a\n' and header[16:24] == (1920).to_bytes(4, 'big') + (1080).to_bytes(4, 'big'), 'Depth mask must be a 1920 x 1080 PNG: ' + wall['depth']
        assert header[25] in (4, 6), 'Depth mask needs an alpha channel: ' + wall['depth']
for icon in ['stremio', 'netflix', 'disneyplus', 'youtube', 'appletv', 'primevideo', 'abciview', 'sbs', 'applemusic', 'art', 'apps', 'settings']:
    assert (app / ('assets/icons/' + icon + '.svg')).is_file(), 'Missing icon: ' + icon
print('Widget identity, version and bundled resources are valid.')
