"""Compila um subconjunto explícito do VERO; não executa regras arbitrárias da fonte."""
import gzip
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


def normalize(word):
    return ''.join(c for c in unicodedata.normalize('NFD', word.lower()) if not unicodedata.combining(c))


def compile_dictionary():
    root = Path(__file__).resolve().parents[1]
    source = root / 'content/dictionary'
    rules = defaultdict(list)
    for row in (source / 'pt_BR.aff').read_text(encoding='utf-8-sig').splitlines():
        parts = row.split()
        if len(parts) < 5 or parts[0] != 'SFX' or parts[1] not in 'ABCDabcdefghijklmnopqrstuvwxyz':
            continue
        _, flag, strip, add, condition = parts[:5]
        if '/' in add or '-' in add or len(add) > 12:
            continue
        rules[flag].append(('' if strip == '0' else strip, '' if add == '0' else add,
                            re.compile('(?:' + condition + ')$')))
    words = {}

    def include(word):
        # Nomes próprios, siglas, compostos e grafias marcadas ficam fora desta edição.
        if not 3 <= len(word) <= 32 or not re.fullmatch('[a-zà-öø-ÿ]+', word):
            return
        key = normalize(word)
        if re.fullmatch('[a-z]+', key):
            words.setdefault(key, set()).add(word)

    for row in (source / 'pt_BR.dic').read_text(encoding='utf-8-sig').splitlines()[1:]:
        entry = row.split()[0] if row.split() else ''
        stem, _, flags = entry.partition('/')
        if any(flag in flags for flag in ('ý', '~', 'Ý')) or not stem.islower() or '-' in stem:
            continue
        include(stem)
        for flag in flags:
            for strip, add, condition in rules[flag]:
                if condition.search(stem) and (not strip or stem.endswith(strip)):
                    include((stem[:-len(strip)] if strip else stem) + add)
    counts = Counter()
    for word in words:
        for size in (2, 3):
            counts.update({word[i:i + size] for i in range(len(word) - size + 1)})
    data = ''.join(f'{key}\t{"|".join(sorted(words[key]))}\n' for key in sorted(words)).encode()
    (source / 'words.tsv.gz').write_bytes(gzip.compress(data, mtime=0))
    (source / 'fragments.json').write_text(json.dumps(counts, sort_keys=True), encoding='utf-8')
    metadata = dict(source='https://github.com/LibreOffice/dictionaries/tree/67032ee957631908098a72edf48dc81cac27e369/pt_BR',
                    revision='67032ee957631908098a72edf48dc81cac27e369', words=len(words),
                    raw_bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                    license='LGPL-3.0; ver README_VERO.txt e COPYING.LESSER/COPYING')
    (source / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(metadata))


if __name__ == '__main__':
    compile_dictionary()
