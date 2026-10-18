"""Preparação Debian offline: não ativa serviço, não altera Nginx, não instala pacotes."""
import argparse
import hashlib
import json
import os
import re
import shutil
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
parser.add_argument('release', help='SHA do commit, 7 a 40 hexadecimais')
parser.add_argument('--base', default='/root/fun', type=Path)
args = parser.parse_args()
if not re.fullmatch('[a-f0-9]{7,40}', args.release):
    raise SystemExit('Release deve identificar um commit Git.')
base = args.base.resolve()
if base == Path('/') or base.exists() and base.is_symlink():
    raise SystemExit('Diretório base inválido.')
os.umask(0o077)
target = base / 'releases' / args.release
target.mkdir(parents=True, exist_ok=False)
with tarfile.open(args.bundle) as archive:
    total = 0
    for member in archive.getmembers():
        path = (target / member.name).resolve()
        if not path.is_relative_to(target.resolve()) or not (member.isfile() or member.isdir()):
            raise SystemExit('Arquivo inseguro no pacote.')
        total += member.size
        if member.size > 10_000_000 or total > 100_000_000:
            raise SystemExit('Pacote excede o tamanho esperado.')
    # Extração manual: compatível inclusive com Python 3.11.2 do Debian inventariado.
    for member in archive.getmembers():
        path = target / member.name
        if member.isdir():
            path.mkdir(parents=True, exist_ok=True, mode=0o700)
        else:
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with archive.extractfile(member) as source, path.open('xb') as destination:
                shutil.copyfileobj(source, destination)
manifest = json.loads((target / 'MANIFEST.json').read_text())
for name, digest in manifest.items():
    path = (target / name).resolve()
    if not path.is_relative_to(target.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise SystemExit('Manifesto divergente; release não ativada.')
shared = base / 'shared'
(shared / 'media').mkdir(parents=True, exist_ok=True)
if not (shared / 'fun.env').exists():
    shutil.copyfile(target / '.env.example', shared / 'fun.env')
    (shared / 'fun.env').chmod(0o600)
print('Release preparada:', target)
print('Nenhum serviço foi iniciado. Siga docs/DEPLOY.md para ativação e rollback.')
