import json
import os
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path


def test_backup_with_wal(tmp_path):
    source, destination = tmp_path / 'source.sqlite3', tmp_path / 'backup.sqlite3'
    db = sqlite3.connect(source)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE evidence (value INTEGER)')
    db.execute('INSERT INTO evidence VALUES (42)')
    db.commit()
    subprocess.run([sys.executable, '-m', 'tools.backup', str(source), str(destination)], check=True)
    copied = sqlite3.connect(destination)
    assert copied.execute('SELECT value FROM evidence').fetchone()[0] == 42
    copied.close()
    db.close()


def test_bundle_never_contains_catalog_tokens_or_fixtures():
    root = Path(__file__).resolve().parents[1]
    subprocess.run([sys.executable, '-m', 'tools.bundle'], cwd=root, check=True)
    with tarfile.open(root / 'artifacts/fun-release.tar.gz') as bundle:
        names = bundle.getnames()
        assert 'MANIFEST.json' in names and 'dist/index.html' in names
        assert not any(name.startswith(('tests/', 'data/', '.venv/', 'node_modules/')) or name.endswith(('.sqlite3', '.pyc')) or name == '.env' for name in names)
        manifest = json.load(bundle.extractfile('MANIFEST.json'))
        assert set(manifest) == set(names) - {'MANIFEST.json'}


def test_prepare_is_additive_and_refuses_existing_release(tmp_path):
    root = Path(__file__).resolve().parents[1]
    base = tmp_path / 'fun'
    command = [sys.executable, str(root / 'deploy/prepare_release.py'), str(root / 'artifacts/fun-release.tar.gz'), 'abcdef1', '--base', str(base)]
    result = subprocess.run(command, capture_output=True)
    assert result.returncode == 0
    assert (base / 'shared/fun.env').exists()
    assert not (base / 'current').exists()
    assert subprocess.run(command, capture_output=True).returncode != 0
    if os.name != 'nt':
        assert (base / 'shared/fun.env').stat().st_mode & 0o777 == 0o600
