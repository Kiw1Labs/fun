"""Credenciais privadas do Godmode, separadas do banco e das sessões de jogadores."""
import hashlib
import hmac
import json
import os
import re
import secrets
from pathlib import Path

ITERATIONS = 600_000
MAX_FILE_BYTES = 1_048_576


class AccountsError(ValueError):
    pass


def accounts_path(database=None):
    configured = os.getenv('FUN_ADMIN_USERS_FILE')
    if configured:
        return Path(configured)
    return Path(database or os.getenv('FUN_DATABASE', 'data/fun.sqlite3')).with_name('godmode-users.json')


def valid_username(username):
    return (isinstance(username, str) and 1 <= len(username) <= 64 and username == username.strip()
            and ':' not in username and not any(ord(c) < 32 or ord(c) == 127 or 0xd800 <= ord(c) <= 0xdfff for c in username))


def hash_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise AccountsError('Use uma senha de 12 a 256 caracteres.')
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITERATIONS)
    return {'salt': salt.hex(), 'hash': digest.hex()}


def read_accounts(path):
    try:
        with Path(path).open('rb') as source:
            raw = source.read(MAX_FILE_BYTES + 1)
    except FileNotFoundError:
        return {}
    except OSError:
        raise AccountsError('Não foi possível ler o arquivo privado de usuários.') from None
    try:
        if len(raw) > MAX_FILE_BYTES:
            raise ValueError()
        def unique_object(pairs):
            result = dict(pairs)
            if len(result) != len(pairs):
                raise ValueError()
            return result
        data = json.loads(raw, object_pairs_hook=unique_object)
        if (not isinstance(data, dict) or set(data) != {'version', 'users'}
                or type(data['version']) is not int or data['version'] != 1):
            raise ValueError()
        users = data['users']
        if not isinstance(users, dict):
            raise ValueError()
        for username, record in users.items():
            if not valid_username(username) or not isinstance(record, dict) or set(record) != {'salt', 'hash'}:
                raise ValueError()
            if not isinstance(record['salt'], str) or not re.fullmatch('[0-9a-f]{32}', record['salt']):
                raise ValueError()
            if not isinstance(record['hash'], str) or not re.fullmatch('[0-9a-f]{64}', record['hash']):
                raise ValueError()
        return users
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise AccountsError('O arquivo privado de usuários está inválido.') from None


class AdminAccounts:
    def __init__(self, path):
        self.path = Path(path)
        self.signature = None
        self.users = {}

    def load(self):
        try:
            stat = self.path.stat()
            signature = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
        except FileNotFoundError:
            signature = None
        except OSError:
            raise AccountsError('Não foi possível consultar o arquivo privado de usuários.') from None
        if signature != self.signature:
            self.users = read_accounts(self.path)
            self.signature = signature
        return self.users

def verify_login(users, username, password, legacy_username='', legacy_password=''):
    if len(username) > 64 or len(password) > 256:
        return False
    record = users.get(username)
    hashed_match = False
    if users:
        # Um cálculo também para nomes desconhecidos, sem revelar os usuários pelo tempo da resposta.
        salt = bytes.fromhex(record['salt']) if record else bytes(16)
        expected = bytes.fromhex(record['hash']) if record else bytes(32)
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITERATIONS)
        hashed_match = hmac.compare_digest(digest, expected) and record is not None
    user_ok = hmac.compare_digest(username.encode('utf-8'), legacy_username.encode('utf-8'))
    password_ok = hmac.compare_digest(password.encode('utf-8'), legacy_password.encode('utf-8'))
    legacy_match = bool(legacy_username and legacy_password) & user_ok & password_ok
    return hashed_match | (record is None and legacy_match)
