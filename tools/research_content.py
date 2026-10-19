"""Build-time Wikimedia research cache; never imported by the game runtime."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import json
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'artifacts/research'
AGENT = 'SabeEssaCatalog/1.0 (https://github.com/Kiw1Labs/fun; educational culture quiz preparation)'


def get(url):
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 + attempt * 3)


def api(domain, **parameters):
    parameters.update(format='json', formatversion=2)
    return json.loads(get(f'https://{domain}/w/api.php?' + urllib.parse.urlencode(parameters)))


def clean(value):
    return ' '.join(html.unescape(re.sub('<[^>]*>', ' ', value or '')).split())


def metadata(file_title):
    data = api('commons.wikimedia.org', action='query', titles=file_title, prop='imageinfo',
               iiprop='url|extmetadata|size|sha1', iiurlwidth=900, iilimit=1)
    return data['query']['pages'][0]


def evidence(seed):
    out = CACHE / (seed['id'] + '.json')
    if out.exists():
        return json.loads(out.read_text(encoding='utf-8'))
    title = seed['wiki']
    data = api(seed.get('wiki_language', 'pt') + '.wikipedia.org', action='query', titles=title, redirects=1,
               prop='extracts|pageimages|pageprops|info', inprop='url',
               explaintext=1, piprop='name|original', pilicense='free')
    page = data['query']['pages'][0]
    result = {'id': seed['id'], 'researched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'wikipedia': page, 'candidates': []}
    if seed['kind'] == 'image':
        reviewed_path = ROOT / 'content/questions/media-selection.json'
        reviewed = json.loads(reviewed_path.read_text(encoding='utf-8')).get(seed['id'], {}) if reviewed_path.exists() else {}
        if isinstance(reviewed, dict) and reviewed.get('file_title'):
            result['candidates'].append(metadata(reviewed['file_title']))
        if page.get('pageimage') and not result['candidates']:
            result['candidates'].append(metadata('File:' + page['pageimage']))
        if len(result['candidates']) < 1 or seed.get('search'):
            query = seed.get('search', title) + ' filetype:bitmap'
            search = api('commons.wikimedia.org', action='query', generator='search', gsrsearch=query,
                         gsrnamespace=6, gsrlimit=6, prop='imageinfo',
                         iiprop='url|extmetadata|size|sha1', iiurlwidth=900, iilimit=1)
            result['candidates'].extend(search.get('query', {}).get('pages', []))
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--ids', nargs='*')
    parser.add_argument('--summary', action='store_true')
    parser.add_argument('--full-text', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    seeds = json.loads((ROOT / 'content/questions/seeds.json').read_text(encoding='utf-8'))
    if args.ids:
        seeds = [s for s in seeds if s['id'] in args.ids]
    if args.full_text:
        for seed in seeds:
            if seed['kind'] != 'text':
                continue
            data = api(seed.get('wiki_language', 'pt') + '.wikipedia.org', action='query',
                       titles=seed['wiki'], redirects=1, prop='extracts|info', explaintext=1, inprop='url')
            path = CACHE / (seed['id'] + '.json')
            record = json.loads(path.read_text(encoding='utf-8'))
            record['wikipedia'] = data['query']['pages'][0]
            path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
            print(seed['id'], len(record['wikipedia'].get('extract', '')), flush=True)
        return
    if not args.summary:
        with ThreadPoolExecutor(max_workers=2) as pool:
            for result in pool.map(evidence, seeds):
                print(result['id'], result['wikipedia'].get('title'), len(result['candidates']), flush=True)
    else:
        for seed in seeds:
            result = json.loads((CACHE / (seed['id'] + '.json')).read_text(encoding='utf-8'))
            if seed['kind'] == 'text':
                print(seed['id'], seed['answer'], result['wikipedia'].get('extract', '')[:1600])
                continue
            print('\n' + seed['id'], seed['answer'])
            for i, page in enumerate(result['candidates']):
                info = page.get('imageinfo', [{}])[0]
                meta = info.get('extmetadata', {})
                print(i, page['title'], info.get('width'), info.get('height'),
                      clean(meta.get('LicenseShortName', {}).get('value')),
                      'AUTHOR', clean(meta.get('Artist', {}).get('value'))[:150],
                      'DESC', clean(meta.get('ImageDescription', {}).get('value'))[:250])


if __name__ == '__main__':
    main()
