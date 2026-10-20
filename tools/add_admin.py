"""Cadastro local: senha oculta, hash e atualização atômica do arquivo privado."""
import argparse
import getpass
import json
import os
import secrets
import sys
import tempfile
import warnings
from datetime import datetime, timezone
from pathlib import Path

from fun.admin_accounts import MAX_FILE_BYTES, AccountsError, accounts_path, hash_password, read_accounts, valid_username


def add_user(path, username, password, legacy_username=''):
    if not valid_username(username):
        raise AccountsError('Use um usuário de 1 a 64 caracteres, sem dois-pontos ou espaços nas extremidades.')
    if username == legacy_username:
        raise AccountsError('Esse usuário já está configurado nas variáveis de administrador.')
    record = hash_password(password)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise AccountsError('O arquivo de usuários não pode ser um link simbólico.')
    lock = path.with_name(path.name + '.lock')
    try:
        handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise AccountsError('Outro cadastro está em andamento. Aguarde e tente novamente.') from None
    temporary = None
    try:
        os.close(handle)
        users = read_accounts(path)
        if username in users:
            raise AccountsError('Esse usuário já existe. Nenhuma senha foi alterada.')
        users[username] = record
        content = json.dumps({'version': 1, 'users': users}, ensure_ascii=False, indent=2) + '\n'
        if len(content.encode('utf-8')) > MAX_FILE_BYTES:
            raise AccountsError('O arquivo de usuários atingiu o limite de tamanho.')
        if path.exists():
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
            backup = path.with_name(f'{path.name}.backup-{stamp}-{secrets.token_hex(4)}')
            backup_handle = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(backup_handle, 'wb') as destination:
                destination.write(path.read_bytes())
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.godmode-users-', suffix='.tmp', delete=False) as destination:
            temporary = Path(destination.name)
            destination.write(content)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Adicionar um usuário do Godmode com senha oculta.', add_help=False)
    parser.add_argument('-h', '--help', action='help', help='Mostrar esta ajuda e sair')
    parser._positionals.title = 'argumentos'
    parser._optionals.title = 'opções'
    parser.add_argument('username', nargs='?', help='Nome do novo usuário')
    parser.add_argument('--file', type=Path, help='Caminho privado de usuários; o padrão acompanha o banco do Fun')
    args = parser.parse_args(argv)
    try:
        if not sys.stdin.isatty():
            raise AccountsError('Execute este cadastro em um terminal interativo para manter a senha oculta.')
        username = args.username or input('Novo usuário: ').strip()
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            password = getpass.getpass('Senha (12 a 256 caracteres): ')
            confirmation = getpass.getpass('Confirme a senha: ')
        if password != confirmation:
            raise AccountsError('As senhas não coincidem. Nenhum usuário foi cadastrado.')
        add_user(args.file or accounts_path(), username, password, os.getenv('FUN_ADMIN_USERNAME', ''))
    except (AccountsError, OSError, EOFError, KeyboardInterrupt, getpass.GetPassWarning) as error:
        message = str(error) if isinstance(error, AccountsError) else 'Cadastro não concluído. Nenhuma senha foi exibida.'
        print(message, file=sys.stderr)
        return 1
    print('Usuário adicionado. O login já pode ser usado no Godmode.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
