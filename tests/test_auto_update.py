"""Barreiras do atualizador, sem rede, serviços ou banco de produção."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile

import pytest


@pytest.fixture
def updater(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('fun_update_under_test', Path('deploy/auto_update.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'BASE', tmp_path)
    return module


def test_candidate_waits_for_ci_before_writing_release(updater, tmp_path, monkeypatch):
    before = tmp_path/'releases/old'
    before.mkdir(parents=True)
    (tmp_path/'upstream.git').mkdir()
    monkeypatch.setattr(updater, 'current', lambda: before)
    monkeypatch.setattr(updater, 'verify_manifest', lambda _: None)
    sha = 'a'*40
    monkeypatch.setattr(updater, 'git', lambda *args: updater.ORIGIN.encode() if args[0] == 'remote' else sha.encode())
    monkeypatch.setattr(updater, 'ci_success', lambda _: False)
    result = updater.prepare()
    assert result['reason'] == 'awaiting_successful_github_ci'
    assert not (tmp_path/'releases'/sha).exists()
    assert updater.prepare(sha)['state'] == 'blocked'


def test_archive_rejects_traversal_and_symlinks(updater, tmp_path):
    for name, kind in [('../outside', tarfile.REGTYPE), ('fun/link', tarfile.SYMTYPE)]:
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w') as archive:
            member = tarfile.TarInfo(name)
            member.type = kind
            archive.addfile(member)
        with pytest.raises(RuntimeError, match='unsafe_archive'):
            updater.safe_extract(data.getvalue(), tmp_path/'candidate')
    assert not (tmp_path/'outside').exists()


def test_build_matches_existing_asset_hashes(updater, tmp_path):
    frontend = tmp_path/'frontend'
    frontend.mkdir()
    (frontend/'index.html').write_text('<script src="/assets/app.js"></script><link href="/assets/style.css">')
    for name in ('app.js', 'style.css'):
        (frontend/name).write_bytes(b'known source')
    updater.build_frontend(tmp_path)
    digest = hashlib.sha256(b'known source').hexdigest()[:12]
    html = (tmp_path/'dist/index.html').read_text()
    assert f'app.{digest}.js' in html and f'style.{digest}.css' in html
    assert (tmp_path/f'dist/assets/app.{digest}.js').read_bytes() == b'known source'


def test_consistent_backup_and_modified_release_are_preserved(updater, tmp_path):
    (tmp_path/'shared').mkdir()
    database = tmp_path/'shared/fun.sqlite3'
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE rooms(id TEXT)')
        db.execute("INSERT INTO rooms VALUES ('ABCD')")
    target = tmp_path/'backup.sqlite3'
    updater.backup_sqlite(target)
    with sqlite3.connect(target) as db:
        assert db.execute('SELECT id FROM rooms').fetchone() == ('ABCD',)
    with pytest.raises(RuntimeError, match='already_exists'):
        updater.backup_sqlite(target)
    code = tmp_path/'app.py'
    code.write_bytes(b'original')
    (tmp_path/'MANIFEST.json').write_text(json.dumps({'app.py': hashlib.sha256(b'original').hexdigest()}))
    updater.verify_manifest(tmp_path)
    code.write_bytes(b'local edit')
    with pytest.raises(RuntimeError, match='local_changes_preserved'):
        updater.verify_manifest(tmp_path)
    assert code.read_bytes() == b'local edit'


def test_catalog_conflict_preserves_manual_edit(updater, tmp_path):
    before, candidate = tmp_path/'old', tmp_path/'new'
    for path, answer in [(before, 'Original'), (candidate, 'Upstream')]:
        (path/'content/questions').mkdir(parents=True)
        (path/'content/questions/catalog.json').write_text(json.dumps([{'id': 'q1', 'answer': answer}]))
    (tmp_path/'shared').mkdir()
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        db.execute('CREATE TABLE questions(id TEXT PRIMARY KEY,data TEXT)')
        db.execute('INSERT INTO questions VALUES (?,?)', ('q1', json.dumps({'id': 'q1', 'answer': 'Manual'})))
    with pytest.raises(RuntimeError, match='local_catalog_edits_preserved'):
        updater.catalog_conflicts(candidate, before)
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        assert json.loads(db.execute('SELECT data FROM questions').fetchone()[0])['answer'] == 'Manual'


def test_initial_catalog_cannot_overwrite_preexisting_same_id(updater, tmp_path):
    candidate = tmp_path/'new'
    (candidate/'content/questions').mkdir(parents=True)
    (candidate/'content/questions/catalog.json').write_text(json.dumps([{'id': 'q1', 'answer': 'New'}]))
    (tmp_path/'shared').mkdir()
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        db.execute('CREATE TABLE questions(id TEXT PRIMARY KEY,data TEXT)')
        db.execute('INSERT INTO questions VALUES (?,?)', ('q1', json.dumps({'id': 'q1', 'answer': 'Existing'})))
    with pytest.raises(RuntimeError, match='id_collision_preserved'):
        updater.catalog_conflicts(candidate, tmp_path/'release-without-catalog')
