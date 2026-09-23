"""Import the supplied named portraits; never modify the original photos.

One-time tool: PYTHONPATH=.tools python scripts/import-cipher-portraits.py
Requires Pillow and pillow-heif; neither is required by the website runtime.
"""
from pathlib import Path
import json
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()
source = Path(r'C:\Users\shami\Downloads\Website Resourses -20260919T181632Z-1-001\Website Resourses\Cipher_Photos')
portraits = {
    'Chaitra RM.JPG': 'chaitra-rm',
    'Elston Pereira.PNG': 'elston-pereira',
    'Himansh Ullal.JPG': 'himansh-ullal',
    'Jeslin Ninora.HEIC': 'jeslin-ninora',
    'Nazmin Ziya.JPG': 'nazmin-ziya',
    'Parthipan J.JPG': 'parthipan-j',
    'Raynell Lewis.JPG': 'raynell-lewis',
    'Ruben Saldana.WEBP': 'ruben-saldana',
    'Shamitha KV.JPG': 'shamitha-kv',
}
manifest_path = Path('content/assets.json')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for filename, slug in portraits.items():
    image = ImageOps.exif_transpose(Image.open(source / filename)).convert('RGB')
    image.thumbnail((1000, 1200))
    target = Path('public/images') / (slug + '.webp')
    image.save(target, 'WEBP', quality=85)
    small = image.copy()
    small.thumbnail((480, 600))
    small.save(target.with_name(slug + '-small.webp'), 'WEBP', quality=80)
    url = '/images/' + target.name
    manifest = [entry for entry in manifest if entry['path'] != url]
    manifest.append({'path': url, 'label': Path(filename).stem,
                     'source': 'Cipher_Photos/' + filename,
                     'width': image.width, 'height': image.height, 'smallWidth': small.width})
    print(filename, '->', target, image.size, target.stat().st_size, 'bytes')
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
