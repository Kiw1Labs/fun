"""Empacota catálogo privado e imagens autorizadas com manifesto de integridade."""
import hashlib
import io
import json
from pathlib import Path
import tarfile

from tools.validate_catalog import audit

root=Path(__file__).resolve().parents[1]
report=audit(root/'content/questions/catalog.json',root/'media')
rows=json.loads((root/'content/questions/catalog.json').read_text(encoding='utf-8'))
paths=[root/'content/questions/catalog.json',root/'content/questions/provenance.json']
paths += [root/row['image'].removeprefix('/') for row in rows if row['image']]
manifest={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
output=root/'artifacts/fun-content.tar.gz'
output.parent.mkdir(exist_ok=True)
with tarfile.open(output,'w:gz') as archive:
    for p in paths:
        archive.add(p,arcname=p.relative_to(root).as_posix())
    data=json.dumps(manifest,sort_keys=True).encode()
    info=tarfile.TarInfo('CONTENT-MANIFEST.json')
    info.size=len(data)
    archive.addfile(info,io.BytesIO(data))
print(json.dumps({'package':str(output),'active':report['active'],'images':report['images'],'bytes':output.stat().st_size}))
