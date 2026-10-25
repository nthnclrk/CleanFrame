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
assert identity.get('package') == 'CleanFrame', 'Source manifest must contain only the generic template identity'
assert identity.get('id') == 'CleanFrame.Template', 'Installation identity belongs in ignored .local/config.json'
assert manifest.get('version') == json.loads((root / 'package.json').read_text())['version'], 'Manifest/package versions differ'
for tag in ['content', 'icon']:
    node = manifest.find('w:' + tag, ns)
    assert node is not None and (app / node.get('src', '')).is_file(), 'Missing ' + tag + ' file'
assert all((app / name).is_file() for name in ['main.js', 'style.css'])
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
    for reference in re.findall(r'url\([\"\']?([^\)\"\']+)', css.read_text()):
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
catalog_source = (app / 'assets/apps/catalog.js').read_text()
catalog = json.loads(catalog_source.split(' = ', 1)[1].rstrip(';\n'))
app_ids = set()
brand_ids = set()
for entry in catalog['primary']:
    assert entry['id'] not in brand_ids, 'Duplicate default app key'
    brand_ids.add(entry['id'])
for entry in catalog['primary'] + catalog['extras']:
    app_id = entry['appId']
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,160}', app_id), 'Invalid app ID'
    assert app_id not in app_ids, 'Duplicate app ID: ' + app_id
    app_ids.add(app_id)
marks = brand_ids | {entry['brand'] for entry in catalog['extras']} | {'art', 'apps', 'settings', 'home'}
metrics = json.loads((app / 'assets/icons/metrics.js').read_text().split(' = ', 1)[1].rstrip(';\n'))
for icon in marks:
    assert re.fullmatch(r'[a-z][a-z0-9]*', icon), 'Invalid icon name'
    assert (app / ('assets/icons/' + icon + '.svg')).is_file(), 'Missing icon: ' + icon
    assert icon in metrics, 'Missing optical metrics: ' + icon
print('Widget identity, version, app catalogue and bundled resources are valid.')
