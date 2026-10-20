import base64
import getpass
import json
import os
import warnings
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import pytest

from fun.admin_accounts import AccountsError, AdminAccounts, accounts_path, hash_password, read_accounts, verify_login
from tests.test_app import make_client
from tools.add_admin import add_user, main


def auth(username, password):
    value = base64.b64encode(f'{username}:{password}'.encode('utf-8')).decode('ascii')
    return {'Authorization': f'Basic {value}'}


def test_hashes_use_separate_salts_and_each_password_belongs_to_its_user():
    first = hash_password('senha sintética á 🚀')
    second = hash_password('senha sintética á 🚀')
    assert first != second
    users = {'bia': first, 'carol': hash_password('outra senha sintética')}
    assert verify_login(users, 'bia', 'senha sintética á 🚀')
    assert verify_login(users, 'carol', 'outra senha sintética')
    assert not verify_login(users, 'bia', 'outra senha sintética')
    assert not verify_login(users, 'desconhecido', 'senha sintética á 🚀')
    assert verify_login(users, 'admin', 'senha anterior', 'admin', 'senha anterior')
    assert not verify_login(users, 'bia', 'senha anterior', 'bia', 'senha anterior')


def test_add_accounts_preserves_existing_users_backup_and_live_reload(tmp_path):
    path = tmp_path / 'private' / 'godmode-users.json'
    accounts = AdminAccounts(path)
    assert accounts.load() == {}
    add_user(path, 'bia', 'senha sintética da Bia')
    initial = path.read_bytes()
    assert set(accounts.load()) == {'bia'}
    add_user(path, 'carol', 'senha sintética da Carol')
    assert set(accounts.load()) == {'bia', 'carol'}
    backups = list(path.parent.glob('godmode-users.json.backup-*'))
    assert len(backups) == 1 and backups[0].read_bytes() == initial
    for private in [path, *backups]:
        content = private.read_text(encoding='utf-8')
        assert 'senha sintética' not in content
        if os.name != 'nt':
            assert private.stat().st_mode & 0o777 == 0o600
    before = path.read_bytes()
    with pytest.raises(AccountsError, match='já existe'):
        add_user(path, 'bia', 'nova senha não autorizada')
    assert path.read_bytes() == before
    assert not list(path.parent.glob('*.lock')) and not list(path.parent.glob('*.tmp'))
    path.unlink()
    assert accounts.load() == {}


@pytest.mark.parametrize('username', ['', ' bia', 'bia ', 'a:b', 'a\nb', 'a\x7fb', 'x' * 65])
def test_bad_username_does_not_create_credentials_file(tmp_path, username):
    path = tmp_path / 'users.json'
    with pytest.raises(AccountsError):
        add_user(path, username, 'senha sintética válida')
    assert not path.exists()


@pytest.mark.parametrize('password', ['', 'curta', 'x' * 257])
def test_bad_password_does_not_create_credentials_file(tmp_path, password):
    path = tmp_path / 'users.json'
    with pytest.raises(AccountsError):
        add_user(path, 'bia', password)
    assert not path.exists()


@pytest.mark.parametrize('content', ['not-json segredo', '[]', '{"version":1,"users":{"bia":"senha privada"}}',
                                     '{"version":true,"users":{}}', '{"version":1,"users":{},"users":{}}'])
def test_bad_file_is_rejected_without_disclosing_content_or_overwriting(tmp_path, content):
    path = tmp_path / 'users.json'
    path.write_text(content, encoding='utf-8')
    with pytest.raises(AccountsError) as error:
        add_user(path, 'bia', 'senha sintética válida')
    assert 'segredo' not in str(error.value) and 'senha privada' not in str(error.value)
    assert path.read_text(encoding='utf-8') == content
    assert not path.with_name(path.name + '.lock').exists()


def test_existing_lock_and_legacy_username_cannot_be_overwritten(tmp_path):
    path = tmp_path / 'users.json'
    with pytest.raises(AccountsError, match='variáveis'):
        add_user(path, 'admin', 'senha sintética válida', legacy_username='admin')
    lock = path.with_name(path.name + '.lock')
    lock.touch()
    with pytest.raises(AccountsError, match='andamento'):
        add_user(path, 'bia', 'senha sintética válida')
    assert lock.exists() and not path.exists()


def test_cli_hides_password_and_requires_matching_confirmation(tmp_path, monkeypatch, capsys):
    path = tmp_path / 'users.json'
    monkeypatch.setattr('sys.stdin', SimpleNamespace(isatty=lambda: True))
    values = iter(['senha sintética privada', 'senha sintética privada'])
    monkeypatch.setattr(getpass, 'getpass', lambda prompt: next(values))
    assert main(['bia', '--file', str(path)]) == 0
    captured = capsys.readouterr()
    assert 'senha sintética privada' not in captured.out + captured.err
    assert verify_login(read_accounts(path), 'bia', 'senha sintética privada')
    before = path.read_bytes()
    values = iter(['senha sintética privada', 'outra confirmação'])
    assert main(['carol', '--file', str(path)]) == 1
    assert path.read_bytes() == before


def test_cli_refuses_noninteractive_or_echo_fallback(tmp_path, monkeypatch):
    path = tmp_path / 'users.json'
    monkeypatch.setattr('sys.stdin', SimpleNamespace(isatty=lambda: False))
    assert main(['bia', '--file', str(path)]) == 1
    monkeypatch.setattr('sys.stdin', SimpleNamespace(isatty=lambda: True))
    def unavailable(prompt):
        warnings.warn('Sem controle do eco', getpass.GetPassWarning)
    monkeypatch.setattr(getpass, 'getpass', unavailable)
    assert main(['bia', '--file', str(path)]) == 1
    assert not path.exists()


def test_path_uses_database_directory_or_explicit_configuration(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERS_FILE', raising=False)
    assert accounts_path(tmp_path / 'fun.sqlite3') == tmp_path / 'godmode-users.json'
    monkeypatch.setenv('FUN_ADMIN_USERS_FILE', str(tmp_path / 'custom.json'))
    assert accounts_path() == tmp_path / 'custom.json'


def test_multiple_users_enable_godmode_without_legacy_and_reload_without_restart(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERNAME', raising=False)
    monkeypatch.delenv('FUN_ADMIN_PASSWORD', raising=False)
    monkeypatch.delenv('FUN_ADMIN_USERS_FILE', raising=False)
    path = tmp_path / 'godmode-users.json'
    with make_client(tmp_path) as client:
        assert client.get('/godmode').status_code == 404
        add_user(path, 'conta_bia', 'senha sintética da Bia')
        assert client.get('/godmode').status_code == 200
        assert client.get('/godmode-assets/godmode.js').status_code == 200
        assert client.get('/api/godmode/rooms').status_code == 401
        add_user(path, 'conta_carol', 'senha sintética da Carol')
        for username, password in [('conta_bia', 'senha sintética da Bia'), ('conta_carol', 'senha sintética da Carol')]:
            assert client.get('/api/godmode/rooms', headers=auth(username, password)).status_code == 200
            assert client.get('/api/godmode/questions', headers=auth(username, password)).status_code == 200
        invalid = client.get('/api/godmode/rooms', headers=auth('conta_bia', 'senha sintética da Carol'))
        assert invalid.status_code == 401 and 'www-authenticate' not in invalid.headers
        assert client.get('/godmode-users.json').status_code == 404
        assert 'conta_bia' not in client.get('/godmode').text
        assert 'salt' not in client.get('/health').text


def test_malformed_credentials_do_not_disable_game_or_fall_back_to_legacy(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERS_FILE', raising=False)
    monkeypatch.setenv('FUN_ADMIN_USERNAME', 'admin')
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', 'senha anterior')
    (tmp_path / 'godmode-users.json').write_text('{segredo', encoding='utf-8')
    with make_client(tmp_path) as client:
        for url in ['/godmode', '/godmode-assets/godmode.js', '/api/godmode/rooms']:
            response = client.get(url, headers=auth('admin', 'senha anterior'))
            assert response.status_code == 503 and 'segredo' not in response.text
        assert client.get('/health').status_code == 200


def test_rate_limit_prevents_more_password_checks_after_ten_failures(tmp_path, monkeypatch):
    monkeypatch.setenv('FUN_ADMIN_USERNAME', 'admin')
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', 'senha anterior')
    checked = []
    def reject(*args):
        checked.append(True)
        return False
    monkeypatch.setattr('fun.app.verify_login', reject)
    with make_client(tmp_path) as client:
        for _ in range(10):
            assert client.get('/api/godmode/rooms', headers=auth('admin', 'errada')).status_code == 401
        assert client.get('/api/godmode/rooms', headers=auth('admin', 'errada')).status_code == 429
        assert len(checked) == 10


def test_success_cache_avoids_repeated_hashing_and_invalidates_on_password_change(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERS_FILE', raising=False)
    monkeypatch.delenv('FUN_ADMIN_USERNAME', raising=False)
    monkeypatch.delenv('FUN_ADMIN_PASSWORD', raising=False)
    path = tmp_path / 'godmode-users.json'
    add_user(path, 'bia', 'senha sintética inicial')
    checked = []
    def verify(*arguments):
        checked.append(True)
        return verify_login(*arguments)
    monkeypatch.setattr('fun.app.verify_login', verify)
    with make_client(tmp_path) as client:
        for url in ['/api/godmode/rooms', '/api/godmode/questions', '/api/godmode/rooms']:
            assert client.get(url, headers=auth('bia', 'senha sintética inicial')).status_code == 200
        assert len(checked) == 1
        replacement = tmp_path / 'replacement.json'
        replacement.write_text(json.dumps({'version': 1, 'users': {'bia': hash_password('nova senha sintética')}}),
                               encoding='utf-8')
        os.replace(replacement, path)
        assert client.get('/api/godmode/rooms', headers=auth('bia', 'senha sintética inicial')).status_code == 401
        assert client.get('/api/godmode/rooms', headers=auth('bia', 'nova senha sintética')).status_code == 200
        assert len(checked) == 3


def test_file_changed_during_authentication_cannot_cache_old_password_as_current(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERS_FILE', raising=False)
    monkeypatch.delenv('FUN_ADMIN_USERNAME', raising=False)
    monkeypatch.delenv('FUN_ADMIN_PASSWORD', raising=False)
    path = tmp_path / 'godmode-users.json'
    add_user(path, 'bia', 'senha sintética inicial')
    entered, release = Event(), Event()
    def verify(*arguments):
        if not entered.is_set():
            entered.set()
            assert release.wait(10)
        return verify_login(*arguments)
    monkeypatch.setattr('fun.app.verify_login', verify)
    with make_client(tmp_path) as client, ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(client.get, '/api/godmode/rooms', headers=auth('bia', 'senha sintética inicial'))
        try:
            assert entered.wait(10)
            replacement = tmp_path / 'replacement.json'
            replacement.write_text(json.dumps({'version': 1, 'users': {'bia': hash_password('nova senha sintética')}}),
                                   encoding='utf-8')
            os.replace(replacement, path)
            assert client.get('/godmode').status_code == 200
            assert client.get('/health').status_code == 200
        finally:
            release.set()
        assert pending.result(timeout=10).status_code == 200
        assert client.get('/api/godmode/rooms', headers=auth('bia', 'senha sintética inicial')).status_code == 401
        assert client.get('/api/godmode/rooms', headers=auth('bia', 'nova senha sintética')).status_code == 200
