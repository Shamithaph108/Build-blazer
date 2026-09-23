"""One-time video-reference asset refinement. Runtime does not require Python."""
from PIL import Image, ImageOps
from pathlib import Path
import json

root=Path(r'C:\Users\shami\Downloads\Website Resourses -20260919T181632Z-1-001\Website Resourses')
manifest_path=Path('content/assets.json')
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for item in manifest:
    if item['path'].startswith('/images/promptops-'):
        image=ImageOps.exif_transpose(Image.open(root/item['source'])).convert('RGB')
        image.thumbnail((1200,1200))
        image.save('public'+item['path'],'WEBP',quality=82)
        small=image.copy();small.thumbnail((600,600))
        small.save('public'+item['path'].replace('.webp','-small.webp'),'WEBP',quality=78)
        item.update(width=image.width,height=image.height,smallWidth=small.width)
for filename,name,box in [('lumiere-32.3.jpg','lumiere-gallery-02',(1108,365,1534,657)),('lumiere-34.jpg','lumiere-gallery-03',(1108,297,1534,657))]:
    image=Image.open(Path('.inspection')/filename).crop(box).convert('RGB')
    image.save('public/images/'+name+'.webp','WEBP',quality=86)
    image.save('public/images/'+name+'-small.webp','WEBP',quality=82)
    if not any(item['path']=='/images/'+name+'.webp' for item in manifest):
        manifest.append({'path':'/images/'+name+'.webp','label':name.replace('-',' ').title(),'source':'Team-supplied video, '+filename,'width':image.width,'height':image.height,'smallWidth':image.width})
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Photo orientation corrected; additional visible Lumière previews imported.')
