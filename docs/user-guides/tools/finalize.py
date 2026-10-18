"""Normalize manifest metadata without modifying original screenshot pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'screenshot-manifest.json'
m = json.loads(p.read_text())
m['screenshots'].sort(key=lambda x: x['file'])
for x in m['screenshots']:
    content = (ROOT / x['file']).read_bytes()
    x['sha256'] = hashlib.sha256(content).hexdigest()
    with Image.open(ROOT / x['file']) as im:
        x['imageDimensions'] = {'width': im.width, 'height': im.height}
m['checks'] = list({x['scenario']: x for x in m['checks']}.values())
m['conditionsNotCaptured'] = list({x['scenario']: x for x in m['conditionsNotCaptured']}.values())
m['captureEnvironment'] = {
    'baseUrl': 'http://127.0.0.1:3199',
    'nodeEnv': 'test',
    'browser': 'Chromium lokal',
    'timezone': 'Asia/Jakarta',
    'database': 'PostgreSQL disposable lokal; seluruh data sintetis',
    'mocks': 0,
    'note': 'Login UI normal; tanpa cookie injection, request mock atau session state tersimpan.'
}
p.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
print(f"Finalized {len(m['screenshots'])} originals, no pixel changes")
