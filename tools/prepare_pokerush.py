"""Compila no PC um catálogo PokéAPI local; nunca é executado no servidor de jogo."""
import concurrent.futures
import hashlib
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'artifacts/pokerush/source'
OUTPUT = ROOT / 'content/pokerush'


def cached(url, path):
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Fun-PokeRush-catalog/1.0'}), timeout=40) as response:
                data = response.read()
            path.write_bytes(data)
            return data
        except OSError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def pokemon(identifier):
    url = f'https://pokeapi.co/api/v2/pokemon/{identifier}/'
    data = json.loads(cached(url, CACHE / f'{identifier}.json'))
    if data['id'] != identifier or not data['is_default'] or data['species']['url'] != f'https://pokeapi.co/api/v2/pokemon-species/{identifier}/':
        raise ValueError(f'Forma inesperada: {identifier}')
    source = data['sprites']['front_default']
    if source != f'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{identifier}.png':
        raise ValueError(f'Sprite inesperado: {identifier}')
    image = cached(source, CACHE / f'{identifier}.png')
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Imagem inválida')
    (OUTPUT / f'{identifier}.png').write_bytes(image)
    name = {29: 'Nidoran ♀', 32: 'Nidoran ♂', 83: "Farfetch’d", 122: 'Mr. Mime'}.get(identifier, data['name'].capitalize())
    return dict(id=identifier, slug=data['name'], name=name,
                types=sorted(t['type']['name'] for t in data['types']),
                image=f'/assets/pokerush/{identifier}.png', source=url, image_source=source,
                image_sha256=hashlib.sha256(image).hexdigest())


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        records = list(pool.map(pokemon, range(1, 152)))
    document = dict(source='https://pokeapi.co/api/v2/', retrieved_at=time.strftime('%Y-%m-%d', time.gmtime()), pokemon=records)
    # Publica somente após conseguir todos os registros. Respostas brutas ficam no cache ignorado pelo Git.
    (OUTPUT / 'catalog.json').write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'PokéRush: {len(records)} Pokémon, {sum(p.stat().st_size for p in OUTPUT.glob("*.png"))} bytes de sprites locais.')


if __name__ == '__main__':
    main()
