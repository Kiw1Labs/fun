"""Importação offline e atômica. Não executar enquanto o backend está ativo."""
import argparse
import json
import os
from pathlib import Path

from fun.catalog import export, validate

parser = argparse.ArgumentParser(description='Valida e importa catálogo editorial autorizado.')
parser.add_argument('source')
parser.add_argument('destination')
args = parser.parse_args()
source, destination = Path(args.source), Path(args.destination)
catalog = validate(json.loads(source.read_text(encoding='utf-8')))
destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
if destination.exists():
    raise SystemExit('Destino existente: preserve uma cópia e use um novo caminho versionado.')
temporary = destination.with_suffix('.tmp')
with temporary.open('x', encoding='utf-8') as stream:
    json.dump(export(catalog), stream, ensure_ascii=False)
if os.name != 'nt':
    temporary.chmod(0o600)
temporary.replace(destination)
print(f'{len(catalog)} desafios validados. Reinicie somente o serviço Fun para carregar.')
