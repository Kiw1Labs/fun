"""Importação editorial idempotente no SQLite existente, com mídias locais verificadas."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

from fun.catalog import export, validate
from fun.store import Store


def inspect_media(challenges, root, strict=True):
    files = []
    seen_answers, seen_hashes = {}, {}
    for c in challenges:
        if c.status != 'active':
            continue
        if strict and not all((c.category, c.subcategory, c.source_url, c.license, c.attribution, c.verified_at, c.verification_note)):
            raise ValueError(f'{c.id}: faltam revisão, fonte, classificação ou direitos.')
        from fun.catalog import normalize
        key = normalize(c.answer)
        if key in seen_answers:
            raise ValueError(f'Referência repetida: {seen_answers[key]} e {c.id}.')
        seen_answers[key] = c.id
        if c.kind != 'image':
            continue
        if strict and not re.fullmatch(r'CC BY(?:-SA)? [1-4]\.\d(?: [a-z]+)?|CC0|Public domain', c.license):
            raise ValueError(f'{c.id}: licença não aprovada para armazenamento e redistribuição.')
        if strict and not all((c.media_source_url, c.author, c.license_url, c.media_sha256, c.media_type)):
            raise ValueError(f'{c.id}: proveniência de mídia incompleta.')
        path = (root / c.image.removeprefix('/media/')).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise ValueError(f'{c.id}: mídia local inexistente ou fora do diretório autorizado.')
        data = path.read_bytes()
        if len(data) > 300_000:
            raise ValueError(f'{c.id}: imagem excede 300 KB.')
        digest = hashlib.sha256(data).hexdigest()
        if c.media_sha256 and digest != c.media_sha256:
            raise ValueError(f'{c.id}: hash da imagem divergente.')
        if digest in seen_hashes:
            raise ValueError(f'Imagem repetida: {seen_hashes[digest]} e {c.id}.')
        seen_hashes[digest] = c.id
        if c.media_type == 'image/webp' and not (data[:4] == b'RIFF' and data[8:12] == b'WEBP'):
            raise ValueError(f'{c.id}: arquivo não é WebP.')
        files.append((c, path))
    return files


def import_database(source, database, media_root, media_destination, report=None):
    challenges = validate(json.loads(source.read_text(encoding='utf-8')))
    files = inspect_media(challenges, media_root)
    os.umask(0o077)
    # Copiar antes da transação. Nomes imutáveis por hash; nenhuma mídia é apagada.
    for challenge, original in files:
        target = (media_destination / challenge.image.removeprefix('/media/')).resolve()
        if not target.is_relative_to(media_destination.resolve()):
            raise ValueError('Destino de mídia inválido.')
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != challenge.media_sha256:
                raise ValueError('Nome de mídia ocupado por conteúdo diferente; não sobrescrito.')
        else:
            temporary = target.with_suffix('.next')
            with temporary.open('xb') as output, original.open('rb') as stream:
                shutil.copyfileobj(stream, output)
            temporary.replace(target)
    store = Store(str(database))
    try:
        changes = store.import_catalog(challenges)
        result = {**changes, 'source_count': len(challenges), 'active_in_database': len(store.catalog()),
                  'images_verified': len(files), 'integrity': store.db.execute('PRAGMA integrity_check').fetchone()[0]}
        if result['integrity'] != 'ok':
            raise ValueError('Falha de integridade no SQLite.')
    finally:
        store.close()
    if report:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description='Importa questões revisadas sem duplicar IDs nem apagar dados existentes.')
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path, nargs='?', help='Exportação JSON legada; destino novo.')
    parser.add_argument('--database', type=Path, help='SQLite existente da aplicação; tabela questions aditiva.')
    parser.add_argument('--media-root', type=Path, default=Path('media'))
    parser.add_argument('--media-destination', type=Path, default=Path('data/media'))
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if bool(args.database) == bool(args.destination):
        parser.error('Informe --database ou um destino JSON, exclusivamente.')
    if args.database:
        print(json.dumps(import_database(args.source, args.database, args.media_root, args.media_destination, args.report)))
    else:
        catalog = validate(json.loads(args.source.read_text(encoding='utf-8')))
        args.destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if args.destination.exists():
            raise SystemExit('Destino JSON existente: use SQLite idempotente ou um novo caminho.')
        with args.destination.open('x', encoding='utf-8') as output:
            json.dump(export(catalog), output, ensure_ascii=False)
        if os.name != 'nt':
            args.destination.chmod(0o600)
        print(f'{len(catalog)} desafios exportados; nenhum serviço foi reiniciado.')


if __name__ == '__main__':
    main()
