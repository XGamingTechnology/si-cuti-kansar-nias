"""Offline documentation checks. Does not connect to a database or app."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import hashlib
import json
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
m = json.loads((ROOT/'screenshot-manifest.json').read_text())
assert m['sourceSha'] == '4c341b0b67bbeed0ea366fb22b3d369c47677b39'
seen = set()
for x in m['screenshots']:
    assert x['file'] not in seen
    seen.add(x['file'])
    p = ROOT / x['file']
    assert p.is_file() and p.stat().st_size > 1000
    assert hashlib.sha256(p.read_bytes()).hexdigest() == x['sha256']
    assert x['sourceSha'] == m['sourceSha']
    assert x['dataMode'] == 'REAL_DB'
    assert x['role'] in ['umum', 'pegawai', 'admin']
    assert x['scenario'] and x['chapter']
    assert not re.search(r'token|session|password|secret|signature=', x['route'], re.I)
    with Image.open(p) as im:
        assert x['imageDimensions'] == {'width': im.width, 'height': im.height}
        if x['origin'] == 'BROWSER_UI':
            assert (im.width, im.height) in [(1440, 1000), (390, 844)]
            assert x['viewport'] == x['imageDimensions']
        else:
            assert x['origin'] == 'APPLICATION_PDF_RENDER' and x['viewport'] is None
assert seen == {str(x.relative_to(ROOT)) for x in (ROOT/'screenshots/originals').glob('*.png')}


def anchors(content):
    values = []
    for line in content.splitlines():
        if not re.match(r'^#{1,6} ', line):
            continue
        h = re.sub(r'[^\w\- ]', '', re.sub(r'^#+ ', '', line).lower()).replace(' ', '-')
        values.append(h)
    return set(values)


links = 0
book_images = set()
for p in ROOT.glob('*.md'):
    text = p.read_text()
    assert '{{' not in text and '<<<<<<<' not in text and '>>>>>>>' not in text
    assert not re.search(r'postgres(?:ql)?://|eyJ[A-Za-z0-9_-]{20,}\.|BEGIN .*PRIVATE KEY', text)
    for match in re.finditer(r'!?\[[^\]]*\]\(([^)]+)\)', text):
        target = match[1].strip('<>')
        if urlsplit(target).scheme:
            continue
        path, _, frag = target.partition('#')
        destination = (p.parent/unquote(path)).resolve() if path else p
        assert destination.is_file(), f'Missing {p.name}: {target}'
        if frag and destination.suffix == '.md':
            assert unquote(frag) in anchors(destination.read_text()), f'Bad anchor {p.name}: {target}'
        links += 1
        if p.name.startswith('panduan-') and destination.suffix == '.png':
            book_images.add(str(destination.relative_to(ROOT)))
    if p.name.startswith('panduan-'):
        numbers = [int(n) for n in re.findall(r'!\[Gambar (\d+)\.', text)]
        assert numbers == list(range(1, len(numbers)+1)), f'Figure numbering {p}'
assert book_images == seen, f'Unreferenced originals: {seen-book_images}'
print(f'PASS: {len(seen)} originals, {links} local links, all hashes/viewports/figure references valid; 0 mock')
