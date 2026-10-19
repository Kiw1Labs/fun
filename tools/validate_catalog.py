"""Validação offline de conteúdo, mídias e disponibilidade de partidas."""
import argparse
from collections import Counter
import json
from pathlib import Path

from fun.catalog import normalize, select, validate
from tools.import_catalog import inspect_media


def audit(source, media_root):
    catalog = validate(json.loads(source.read_text(encoding='utf-8')))
    active = [c for c in catalog if c.status == 'active']
    files = inspect_media(catalog, media_root)
    # Enunciados visuais genéricos podem se repetir; comparar somente pistas textuais.
    texts = [(c.id, set(normalize(c.prompt).split())) for c in active if c.kind == 'text']
    similar = [(left, right) for i, (left, a) in enumerate(texts) for right, b in texts[i+1:]
               if len(a & b) / len(a | b) >= .8]
    history, matches = [], []
    for _ in range(8):
        excluded = set().union(*history[-3:]) if history else set()
        deck = select(active, excluded)
        ids = {c.id for c in deck}
        assert len(ids) == 15 and not ids & excluded
        assert Counter(c.kind for c in deck) == {'image': 8, 'text': 7}
        assert Counter(c.difficulty for c in deck) == {'easy': 7, 'medium': 5, 'hard': 3}
        assert [c.kind for c in deck] == ['image' if i % 2 == 0 else 'text' for i in range(15)]
        history.append(ids)
        matches.append([c.id for c in deck])
    return {'active': len(active), 'images': len(files), 'categories': dict(Counter(c.category for c in active)),
            'formats': dict(Counter(c.kind for c in active)), 'difficulty': dict(Counter(c.difficulty for c in active)),
            'cells': dict(Counter(f'{c.kind}/{c.difficulty}' for c in active)),
            'media_bytes': sum(p.stat().st_size for _, p in files), 'similar_text_pairs_for_review': similar,
            'consecutive_matches': len(matches), 'matches': matches}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--media-root', type=Path, default=Path('media'))
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = audit(args.source, args.media_root)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'matches'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
