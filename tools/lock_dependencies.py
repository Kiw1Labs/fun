"""Gera lock a partir do relatório pip de wheels universais Python 3.11."""
import json
from pathlib import Path

report = json.loads(Path('dependency-report.json').read_text(encoding='utf-8'))
lines = ['# Wheels universais: Python >=3.11, inclusive Debian armhf.', '--only-binary=:all:', '--require-hashes']
for item in sorted(report['install'], key=lambda x: x['metadata']['name'].lower()):
    meta = item['metadata']
    digest = item['download_info']['archive_info']['hashes']['sha256']
    lines.append(f"{meta['name']}=={meta['version']} --hash=sha256:{digest}")
Path('requirements.lock').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('Lock completo gerado com hashes SHA-256 de wheels universais.')
