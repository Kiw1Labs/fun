"""Backup SQLite consistente, incluindo transações presentes no WAL."""
import argparse
import os
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
if not args.source.is_file() or args.destination.exists():
    raise SystemExit('Origem deve existir e destino deve ser novo.')
os.umask(0o077)
args.destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with sqlite3.connect(args.source.resolve().as_uri() + '?mode=ro', uri=True) as source:
    with sqlite3.connect(args.destination) as destination:
        source.backup(destination)
        if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Backup não passou na verificação de integridade.')
print('Backup privado concluído e íntegro.')
