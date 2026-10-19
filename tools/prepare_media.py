"""Pré-processa somente as mídias selecionadas e licenciadas; execução no PC."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import time

from PIL import Image, ImageDraw, ImageFont, ImageOps

from tools.research_content import CACHE, ROOT, api, clean, get


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true', help='Reutiliza o cache de arquivos/licenças previamente obtidos.')
    args = parser.parse_args()
    seeds = json.loads((ROOT / 'content/questions/seeds.json').read_text(encoding='utf-8'))
    selected = json.loads((ROOT / 'content/questions/media-selection.json').read_text(encoding='utf-8'))
    directory = ROOT / 'media/questions'
    directory.mkdir(parents=True, exist_ok=True)
    downloads = CACHE / 'downloads'
    downloads.mkdir(exist_ok=True)
    manifest = []
    for seed in seeds:
        if seed['kind'] != 'image':
            continue
        result = json.loads((CACHE / (seed['id'] + '.json')).read_text(encoding='utf-8'))
        choice = selected[seed['id']]
        choice = {'candidate': choice} if isinstance(choice, int) else choice
        page = next(p for p in result['candidates'] if p['title'] == choice['file_title']) if choice.get('file_title') else result['candidates'][choice['candidate']]
        info = page['imageinfo'][0]
        ext = info['extmetadata']
        license_name = clean(ext.get('LicenseShortName', {}).get('value'))
        assert re.fullmatch(r'CC BY(?:-SA)? [1-4]\.\d(?: [a-z]+)?|CC0|Public domain', license_name), (seed['id'], license_name)
        author = choice.get('credit_override') or clean(ext.get('Artist', {}).get('value'))
        assert author, ('Missing author', seed['id'])
        metadata_cache = downloads / (seed['id'] + '.license.json')
        original = downloads / (seed['id'] + '.image')
        if metadata_cache.exists() and json.loads(metadata_cache.read_text(encoding='utf-8'))['title'] != page['title']:
            previous = hashlib.sha256(metadata_cache.read_bytes()).hexdigest()[:10]
            metadata_cache.rename(metadata_cache.with_name(metadata_cache.name + '.' + previous))
            if original.exists():
                original.rename(original.with_name(original.name + '.' + previous))
        if not metadata_cache.exists():
            assert not args.offline
            record = api('commons.wikimedia.org', action='query', titles=page['title'], prop='revisions',
                         rvprop='ids|content', rvslots='main')['query']['pages'][0]
            metadata_cache.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        record = json.loads(metadata_cache.read_text(encoding='utf-8'))
        revision = record['revisions'][0]
        wikitext = revision['slots']['main']['content']
        assert not re.search(r'\{\{\s*(?:delete|speedy|copyvio|no permission|permission missing|disputed|nld|npd)(?:\||\}\})', wikitext, re.I), ('Rights review flag', seed['id'])
        download_url = info.get('thumburl', info['url'])
        if not original.exists():
            assert not args.offline
            original.write_bytes(get(download_url))
            time.sleep(.25)
        data = original.read_bytes()
        assert len(data) < 20_000_000
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
            if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
                rgba = image.convert('RGBA')
                image = Image.new('RGB', rgba.size, 'white')
                image.paste(rgba, mask=rgba.getchannel('A'))
            else:
                image = image.convert('RGB')
        if choice.get('crop'):
            left, top, right, bottom = choice['crop']
            assert 0 <= left < right <= 1 and 0 <= top < bottom <= 1
            image = image.crop((int(left * image.width), int(top * image.height), int(right * image.width), int(bottom * image.height)))
        assert min(image.size) >= 180, (seed['id'], image.size)
        image.thumbnail((800, 800), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format='WEBP', quality=84, method=6, exif=b'', xmp=b'')
        optimized = buffer.getvalue()
        assert len(optimized) <= 300_000
        digest = hashlib.sha256(optimized).hexdigest()
        filename = 'm_' + digest[:24] + '.webp'
        (directory / filename).write_bytes(optimized)
        license_url = clean(ext.get('LicenseUrl', {}).get('value')).replace('http://', 'https://')
        if not license_url:
            license_url = info['descriptionurl']
        entry = {'id': seed['id'], 'title': page['title'], 'author': author, 'license': license_name,
                 'license_url': license_url, 'file_page': info['descriptionurl'], 'original_url': info['url'],
                 'download_url': download_url, 'original_sha1': info['sha1'],
                 'download_sha256': hashlib.sha256(data).hexdigest(), 'media_sha256': digest,
                 'image': '/media/questions/' + filename, 'width': image.width, 'height': image.height,
                 'bytes': len(optimized), 'commons_revision': revision['revid'],
                 'license_page_sha256': hashlib.sha256(wikitext.encode()).hexdigest(),
                 'verified_at': result['researched_at'], 'copyrighted': clean(ext.get('Copyrighted', {}).get('value')),
                 'attribution_required': clean(ext.get('AttributionRequired', {}).get('value')),
                 'original_source': clean(ext.get('Credit', {}).get('value')),
                 'changes': ('Recorte para destacar a pessoa à esquerda; ' if choice.get('crop') else '') + 'Redimensionamento proporcional para até 800 px, conversão WebP e remoção de metadados; sem remoção de marca-d’água.',
                 'rights_note': 'Licença autoral verificada na página do arquivo; reutilização para reconhecimento cultural, sem alegar patrocínio ou endosso. Nomes e marcas mantêm seus direitos próprios.'}
        manifest.append(entry)
        print(seed['id'], license_name, image.size, len(optimized), flush=True)
    (ROOT / 'content/questions/provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Folha de contato privada para conferir identidade, recorte e ausência de spoilers.
    sheet = Image.new('RGB', (8 * 220, 6 * 250), '#eeeeee')
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    except OSError:
        font = ImageFont.load_default()
    names = {s['id']: s['answer'] for s in seeds}
    for i, entry in enumerate(manifest):
        image = Image.open(directory / Path(entry['image']).name)
        image.thumbnail((210, 200))
        x, y = i % 8 * 220, i // 8 * 250
        sheet.paste(image, (x + (220 - image.width) // 2, y))
        draw.text((x + 5, y + 205), entry['id'], font=font, fill='black')
        draw.text((x + 5, y + 225), names[entry['id']], font=font, fill='black')
    sheet.save(ROOT / 'artifacts/media-contact-sheet.jpg', quality=90)


if __name__ == '__main__':
    main()
