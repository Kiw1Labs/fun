"""Barreiras do atualizador, sem rede, serviços ou banco de produção."""
import hashlib
import importlib.util
import io
import json
import shutil
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
    brand = frontend/'brand'
    brand.mkdir(parents=True)
    (frontend/'index.html').write_text('<script src="/assets/app.js"></script><link href="/assets/style.css">')
    logo = b'logo bytes'
    favicon_png = b'favicon png bytes'
    favicon = b'<svg></svg>'
    (brand/'fun-logo.png').write_bytes(logo)
    (brand/'fun-favicon.png').write_bytes(favicon_png)
    (frontend/'favicon.svg').write_bytes(favicon)
    for name in ('app.js', 'style.css'):
        (frontend/name).write_bytes(b'known source')
    updater.build_frontend(tmp_path)
    digest = hashlib.sha256(b'known source').hexdigest()[:12]
    html = (tmp_path/'dist/index.html').read_text()
    assert f'app.{digest}.js' in html and f'style.{digest}.css' in html
    assert (tmp_path/f'dist/assets/app.{digest}.js').read_bytes() == b'known source'
    assert (tmp_path/'dist/brand/fun-logo.png').read_bytes() == logo
    assert (tmp_path/'dist/brand/fun-favicon.png').read_bytes() == favicon_png
    assert (tmp_path/'dist/favicon.svg').read_bytes() == favicon


def test_dictionary_and_potato_assets_survive_release_preparation(updater, tmp_path):
    data = io.BytesIO()
    files = {'content/dictionary/words.tsv.gz': b'compressed lexicon',
             'content/dictionary/COPYING.LESSER': b'license',
             'content/dictionary/secrets.txt': b'never extract',
             'content/dictionary/nested/words.tsv.gz': b'never extract'}
    with tarfile.open(fileobj=data, mode='w') as archive:
        for name, contents in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(contents)
            archive.addfile(member, io.BytesIO(contents))
    updater.safe_extract(data.getvalue(), tmp_path/'candidate')
    assert (tmp_path/'candidate/content/dictionary/words.tsv.gz').is_file()
    assert (tmp_path/'candidate/content/dictionary/COPYING.LESSER').is_file()
    assert not (tmp_path/'candidate/content/dictionary/secrets.txt').exists()
    assert not (tmp_path/'candidate/content/dictionary/nested').exists()
    shutil.copytree(Path('frontend'), tmp_path/'assets/frontend')
    updater.build_frontend(tmp_path/'assets')
    html = (tmp_path/'assets/dist/index.html').read_text(encoding='utf-8')
    assert '/assets/batata.js' not in html and '/assets/batata.css' not in html
    assert '/assets/batata.' in html


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


@pytest.mark.parametrize('local_change', [{}, {'reference': 'Texto local'}, {'submission_id': 'local-id'},
                                       {'submitted_by': 'Pessoa'}, {'unknown_field': ''}])
def test_legacy_optional_defaults_are_equivalent_without_hiding_local_edits(updater, tmp_path, local_change):
    original = {'id': 'q1', 'answer': 'Original'}
    for name in ('old', 'new'):
        directory = tmp_path/name/'content/questions'
        directory.mkdir(parents=True)
        (directory/'catalog.json').write_text(json.dumps([original]))
    (tmp_path/'shared').mkdir()
    stored = dict(original, reference='', submission_id='', submitted_by='') | local_change
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        db.execute('CREATE TABLE questions(id TEXT PRIMARY KEY,data TEXT)')
        db.execute('INSERT INTO questions VALUES (?,?)', ('q1', json.dumps(stored)))
    if local_change:
        with pytest.raises(RuntimeError, match='local_catalog_edits_preserved'):
            updater.catalog_conflicts(tmp_path/'new', tmp_path/'old')
    else:
        updater.catalog_conflicts(tmp_path/'new', tmp_path/'old')
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        assert json.loads(db.execute('SELECT data FROM questions').fetchone()[0]) == stored


def test_first_catalog_supports_legacy_database_without_migration(updater, tmp_path):
    candidate = tmp_path/'new'
    (candidate/'content/questions').mkdir(parents=True)
    (candidate/'content/questions/catalog.json').write_text(json.dumps([{'id': 'q1', 'answer': 'New'}]))
    (tmp_path/'shared').mkdir()
    database = tmp_path/'shared/fun.sqlite3'
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL)')
        db.execute('INSERT INTO rooms VALUES (?,?)', ('ABCD', '{"preserve": true}'))
    updater.catalog_conflicts(candidate, tmp_path/'legacy-release')
    with sqlite3.connect(database) as db:
        assert db.execute('SELECT code,data FROM rooms').fetchall() == [('ABCD', '{"preserve": true}')]
        assert db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall() == [('rooms',)]


@pytest.mark.parametrize('changed_file', [None, 'requirements.lock', 'deploy/nginx-fun.conf'])
def test_prepare_accepts_windows_lock_line_endings_but_blocks_real_changes(updater, tmp_path, monkeypatch, changed_file):
    before = tmp_path/'releases/legacy'
    (before/'deploy').mkdir(parents=True)
    (before/'requirements.lock').write_bytes(b'pinned==1.0\r\n')
    (before/'deploy/nginx-fun.conf').write_bytes(b'# existing proxy\n')
    (before/'MANIFEST.json').write_text(json.dumps({
        name: hashlib.sha256((before/name).read_bytes()).hexdigest()
        for name in ['requirements.lock', 'deploy/nginx-fun.conf']
    }))
    (tmp_path/'shared').mkdir()
    with sqlite3.connect(tmp_path/'shared/fun.sqlite3') as db:
        db.execute('CREATE TABLE rooms(code TEXT PRIMARY KEY, data TEXT)')
    (tmp_path/'upstream.git').mkdir()
    monkeypatch.setattr(updater, 'current', lambda: before)
    files = {'requirements.lock': b'pinned==1.0\n', 'deploy/nginx-fun.conf': b'# existing proxy\n',
             'frontend/index.html': b'<script src="/assets/app.js"></script>', 'frontend/app.js': b'// app',
             'frontend/style.css': b'/* style */', 'frontend/brand/fun-logo.png': b'logo',
             'frontend/brand/fun-favicon.png': b'favicon png',
             'frontend/favicon.svg': b'<svg></svg>', 'content/questions/catalog.json': b'[]'}
    if changed_file:
        files[changed_file] += b'# actual upstream change\n'
    archive_data = io.BytesIO()
    with tarfile.open(fileobj=archive_data, mode='w') as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    sha = 'b'*40

    def git(*args):
        if args[0] == 'remote':
            return updater.ORIGIN.encode()
        if args[0] == 'show':
            return files[args[1].split(':', 1)[1]]
        if args[0] == 'archive':
            return archive_data.getvalue()
        return sha.encode()

    monkeypatch.setattr(updater, 'git', git)
    monkeypatch.setattr(updater, 'ci_success', lambda _: True)
    validated = []
    monkeypatch.setattr(updater, 'validate_candidate', validated.append)
    if changed_file:
        error = 'dependency_change_requires_review' if changed_file == 'requirements.lock' else 'shared_nginx_change_requires_review'
        with pytest.raises(RuntimeError, match=error):
            updater.prepare()
        assert not (tmp_path/'releases'/sha).exists()
    else:
        plan = updater.prepare()
        assert plan['state'] == 'prepared' and validated == [tmp_path/'releases'/sha]
        updater.verify_manifest(Path(plan['candidate']))
