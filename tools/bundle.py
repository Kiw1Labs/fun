"""Empacota somente runtime, build e templates; não inclui catálogo, sessões ou segredos."""
import hashlib
import io
import json
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = [p for directory in ('fun', 'dist', 'deploy') for p in (root / directory).rglob('*')
         if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc']
files += [root / 'requirements.lock', root / '.env.example']
files += [p for p in (root / 'content/dictionary').iterdir() if p.is_file()]
files += [p for p in (root / 'content/pokerush').iterdir() if p.is_file()]
files += [root / 'frontend' / name for name in ('godmode.html', 'godmode.css', 'godmode.js',
                                              'nova-questao.html', 'nova-questao.css', 'nova-questao.js')]
files += [root / 'tools' / name for name in ('import_catalog.py','validate_catalog.py','backup.py','add_admin.py')]
manifest = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(root / 'artifacts').mkdir(exist_ok=True)
with tarfile.open(root / 'artifacts/fun-release.tar.gz', 'w:gz') as archive:
    for p in files:
        archive.add(p, arcname=p.relative_to(root).as_posix())
    data = json.dumps(manifest, sort_keys=True).encode()
    info = tarfile.TarInfo('MANIFEST.json')
    info.size = len(data)
    archive.addfile(info, io.BytesIO(data))
print('artifacts/fun-release.tar.gz pronto; conteúdo privado é empacotado separadamente por tools.bundle_content.')
