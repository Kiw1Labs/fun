"""Fun helper for the existing Kiwiki updater: immutable releases, CI gate, local media.

No daemon. No Node, image processing, credentials, shared proxy changes or DB restores.
"""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/root/fun')
ORIGIN = 'https://github.com/Kiw1Labs/fun.git'
API = 'https://api.github.com/repos/Kiw1Labs/fun/actions/runs'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic(path, data):
    temporary = path.with_suffix(path.suffix + '.next')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def git(*args):
    result = subprocess.run(['git','--git-dir',str(BASE/'upstream.git'),*args],
                            capture_output=True, timeout=120, env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
    if result.returncode:
        raise RuntimeError('fun_git_failed_' + str(result.returncode))
    return result.stdout


def run(args, **kwargs):
    result = subprocess.run([str(x) for x in args], capture_output=True, timeout=180, **kwargs)
    if result.returncode:
        raise RuntimeError('fun_validation_failed_' + Path(str(args[0])).name)
    return result.stdout


def current():
    link = BASE/'current'
    if not link.is_symlink():
        raise RuntimeError('fun_current_not_symlink')
    path = link.resolve()
    if path.parent != (BASE/'releases').resolve():
        raise RuntimeError('fun_current_outside_releases')
    return path


def verify_manifest(path):
    manifest = json.loads((path/'MANIFEST.json').read_text(encoding='utf-8'))
    for name, digest in manifest.items():
        file = (path/name).resolve()
        if not file.is_relative_to(path.resolve()) or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
            raise RuntimeError('fun_local_changes_preserved')


def safe_extract(data, destination):
    allowed = ('fun/','frontend/','deploy/','media/questions/','content/questions/')
    specific = {'requirements.lock','.env.example','tools/import_catalog.py','tools/validate_catalog.py','tools/backup.py'}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive:
            path = (destination/member.name).resolve()
            if not path.is_relative_to(destination.resolve()) or not (member.isfile() or member.isdir()):
                raise RuntimeError('fun_unsafe_archive')
            total += member.size
            if member.size > 10_000_000 or total > 100_000_000:
                raise RuntimeError('fun_archive_too_large')
            if not member.isfile() or not (member.name.startswith(allowed) or member.name in specific):
                continue
            # Only optimized images and the reviewed JSON content enter the runtime.
            if member.name.startswith('media/') and not member.name.endswith('.webp'):
                continue
            if member.name.startswith('content/') and Path(member.name).name not in ('catalog.json','provenance.json'):
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, path.open('xb') as output:
                shutil.copyfileobj(source,output)


def build_frontend(path):
    html = (path/'frontend/index.html').read_text(encoding='utf-8')
    assets = path/'dist/assets'
    assets.mkdir(parents=True,exist_ok=True)
    brand = path/'dist/brand'
    brand.mkdir(parents=True,exist_ok=True)
    for name in ('app.js','style.css'):
        data = (path/'frontend'/name).read_bytes()
        stem, suffix = name.rsplit('.',1)
        target = f'{stem}.{hashlib.sha256(data).hexdigest()[:12]}.{suffix}'
        (assets/target).write_bytes(data)
        html = html.replace('/assets/'+name,'/assets/'+target)
    shutil.copy2(path/'frontend/brand/fun-logo.png', brand/'fun-logo.png')
    shutil.copy2(path/'frontend/favicon.svg', path/'dist/favicon.svg')
    (path/'dist/index.html').write_text(html,encoding='utf-8')


def ci_success(sha):
    request = urllib.request.Request(API + '?head_sha=' + sha + '&per_page=20',
                                     headers={'User-Agent':'Kiwiki-Fun-Updater/1.0','Accept':'application/vnd.github+json'})
    with urllib.request.urlopen(request,timeout=30) as response:
        runs = json.load(response)['workflow_runs']
    return any(r['head_sha']==sha and r.get('path')=='.github/workflows/ci.yml'
               and r['event']=='push' and r['status']=='completed' and r['conclusion']=='success' for r in runs)


def backup_sqlite(destination):
    destination = Path(destination)
    if destination.exists():
        raise RuntimeError('fun_backup_already_exists')
    with sqlite3.connect((BASE/'shared/fun.sqlite3').resolve().as_uri()+'?mode=ro',uri=True) as source:
        with sqlite3.connect(destination) as target:
            source.backup(target)
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('fun_backup_integrity_failed')


def import_command(release, database, media):
    return [BASE/'venv/bin/python','-m','tools.import_catalog',release/'content/questions/catalog.json',
            '--database',database,'--media-root',release/'media','--media-destination',media]


def catalog_conflicts(release, before):
    old = before/'content/questions/catalog.json'
    previous = ({r['id']: r for r in json.loads(old.read_text(encoding='utf-8'))} if old.exists() else {})
    incoming = json.loads((release/'content/questions/catalog.json').read_text(encoding='utf-8'))
    with sqlite3.connect((BASE/'shared/fun.sqlite3').resolve().as_uri()+'?mode=ro',uri=True) as db:
        has_questions = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='questions'").fetchone()
        stored = {row[0]:json.loads(row[1]) for row in db.execute('SELECT id,data FROM questions')} if has_questions else {}
    for row in incoming:
        if row['id'] in stored and row['id'] not in previous:
            raise RuntimeError('fun_catalog_id_collision_preserved')
        if row['id'] in previous:
            if set(row) != set(previous[row['id']]):
                raise RuntimeError('fun_catalog_schema_change_requires_review')
            if row['id'] in stored and stored[row['id']] != previous[row['id']]:
                raise RuntimeError('fun_local_catalog_edits_preserved')


def validate_candidate(release):
    run([BASE/'venv/bin/python','-m','compileall','-q',str(release/'fun'),str(release/'tools')])
    run([BASE/'venv/bin/python','-m','tools.validate_catalog',release/'content/questions/catalog.json',
         '--media-root',release/'media'],cwd=release)
    with tempfile.TemporaryDirectory(prefix='fun-update-check-') as temporary:
        directory = Path(temporary)
        database = directory/'fun.sqlite3'
        backup_sqlite(database)
        run(import_command(release,database,release/'media'),cwd=release)
        env = {**os.environ,'FUN_DATABASE':str(database),'FUN_MEDIA':str(release/'media'),
               'FUN_STATIC':str(release/'dist'),'FUN_PORT':'15057','FUN_ORIGINS':'http://127.0.0.1:15057',
               'FUN_LOG':str(directory/'backend.log'),'PYTHONDONTWRITEBYTECODE':'1'}
        import socket
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1',15057)) == 0:
                raise RuntimeError('fun_candidate_port_occupied')
        child = subprocess.Popen([str(BASE/'venv/bin/python'),'-m','fun'],cwd=release,env=env,
                                 stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(60):
                if child.poll() is not None:
                    raise RuntimeError('fun_candidate_start_failed')
                try:
                    with urllib.request.urlopen('http://127.0.0.1:15057/health',timeout=2) as response:
                        assert json.load(response)['catalog_count'] >= 60
                    with urllib.request.urlopen('http://127.0.0.1:15057/',timeout=2) as response:
                        assert response.status == 200
                    break
                except OSError:
                    time.sleep(.25)
            else:
                raise RuntimeError('fun_candidate_http_failed')
        finally:
            child.terminate()
            child.wait(timeout=20)


def prepare(skip_upstream=None):
    before = current()
    verify_manifest(before)
    bare = BASE/'upstream.git'
    if not bare.exists():
        run(['git','clone','--bare','--single-branch','--branch','main',ORIGIN,bare])
    if git('remote','get-url','origin').decode().strip() != ORIGIN:
        raise RuntimeError('fun_unexpected_origin')
    git('fetch','--no-tags','origin','main:refs/heads/fun-upstream')
    sha = git('rev-parse','refs/heads/fun-upstream').decode().strip()
    deployed = json.loads((before/'DEPLOYMENT.json').read_text()) if (before/'DEPLOYMENT.json').exists() else {'commit':before.name}
    if sha.startswith(deployed['commit']):
        return {'project':'fun','state':'current','commit':sha,'upstream':sha,'error':None}
    if skip_upstream == sha:
        return {'project':'fun','state':'blocked','upstream':sha,'error':'failed_commit_requires_review'}
    if not ci_success(sha):
        return {'project':'fun','state':'checking','upstream':sha,'reason':'awaiting_successful_github_ci','error':None}
    # No Nginx configuration or dependency changes are applied automatically.
    requirements = git('show',sha+':requirements.lock')
    if requirements.replace(b'\r\n', b'\n') != (before/'requirements.lock').read_bytes().replace(b'\r\n', b'\n'):
        raise RuntimeError('fun_dependency_change_requires_review')
    proxy = git('show',sha+':deploy/nginx-fun.conf')
    if proxy != (before/'deploy/nginx-fun.conf').read_bytes():
        raise RuntimeError('fun_shared_nginx_change_requires_review')
    release = BASE/'releases'/sha
    if release.exists():
        raise RuntimeError('fun_existing_candidate_requires_review')
    release.mkdir(parents=True)
    safe_extract(git('archive',sha),release)
    build_frontend(release)
    catalog_conflicts(release,before)
    validate_candidate(release)
    manifest = {str(p.relative_to(release)):hashlib.sha256(p.read_bytes()).hexdigest() for p in release.rglob('*')
                if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
    atomic(release/'MANIFEST.json',manifest)
    atomic(release/'DEPLOYMENT.json',{'commit':sha,'prepared_at':now()})
    plan = {'project':'fun','state':'prepared','before':str(before),'after':sha,'upstream':sha,
            'candidate':str(release),'plan_file':str(BASE/('update-plan-'+sha+'.json'))}
    atomic(Path(plan['plan_file']),plan)
    return plan


def load_plan(path):
    path = Path(path).resolve()
    if path.parent != BASE.resolve():
        raise RuntimeError('fun_invalid_plan_path')
    plan = json.loads(path.read_text(encoding='utf-8'))
    if plan['project'] != 'fun' or not re.fullmatch('[0-9a-f]{40}',plan['after']):
        raise RuntimeError('fun_invalid_plan')
    if Path(plan['candidate']).resolve() != (BASE/'releases'/plan['after']).resolve():
        raise RuntimeError('fun_invalid_candidate')
    return plan


def activate(plan):
    if str(current()) != plan['before']:
        raise RuntimeError('fun_live_release_changed')
    release = Path(plan['candidate'])
    verify_manifest(release)
    catalog_conflicts(release,Path(plan['before']))
    run(import_command(release,BASE/'shared/fun.sqlite3',BASE/'shared/media'),cwd=release)
    temporary = BASE/'current.next'
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError('fun_activation_already_pending')
    temporary.symlink_to(release,target_is_directory=True)
    temporary.replace(BASE/'current')
    return {'state':'activated','commit':plan['after']}


def rollback(plan):
    before = Path(plan['before']).resolve()
    if before.parent != (BASE/'releases').resolve():
        raise RuntimeError('fun_invalid_rollback_target')
    if current() not in (before,Path(plan['candidate']).resolve()):
        raise RuntimeError('fun_rollback_preserves_new_release')
    verify_manifest(before)
    temporary = BASE/'current.rollback'
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError('fun_rollback_already_pending')
    temporary.symlink_to(before,target_is_directory=True)
    temporary.replace(BASE/'current')
    return {'state':'rolled_back','commit':before.name}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('action',choices=['prepare','activate','rollback','finalize','sqlite-backup'])
    parser.add_argument('project',choices=['fun'])
    parser.add_argument('--plan')
    parser.add_argument('--skip-upstream')
    parser.add_argument('--initial',action='store_true')
    args = parser.parse_args()
    if args.action == 'prepare':
        result = prepare(args.skip_upstream)
    elif args.action == 'sqlite-backup':
        backup_sqlite(args.plan)
        shutil.copy2(BASE/'shared/fun.env',Path(args.plan).parent/'fun.env')
        result = {'state':'backup_ok'}
    else:
        plan = load_plan(args.plan)
        if args.action == 'activate':
            result = activate(plan)
        elif args.action == 'rollback':
            result = rollback(plan)
        else:
            result = {'state':'deployed','commit':plan['after'],'upstream':plan['upstream'],'deployed_at':now()}
            atomic(BASE/'deployment.json',result)
    print(json.dumps(result),flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'state':'error','error':str(error) if isinstance(error,RuntimeError) else type(error).__name__}),flush=True)
        sys.exit(1)
