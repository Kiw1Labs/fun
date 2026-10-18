"""Adapter Termux para o controlador existente: sem outro loop de supervisão.

status/start/stop só gerenciam o grupo proot criado para Fun e validam PID+nascimento.
Não importar este módulo para disparar ações; o controlador chama a CLI explicitamente.
"""
import contextlib
import fcntl
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE = Path.home() / 'fun-control'
MARKER = '/root/fun/current/deploy/start_backend.sh'


def birth(pid):
    try:
        return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
    except (OSError, IndexError):
        return None


def owned(state):
    try:
        pid = int(state['pid'])
        command = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
        return birth(pid) == state['birth'] and MARKER.encode() in command and os.getpgid(pid) == pid
    except (OSError, KeyError, TypeError, ValueError):
        return False


def load():
    try:
        return json.loads((BASE / 'process.json').read_text())
    except (OSError, ValueError):
        return {}


def port_open():
    with socket.socket() as probe:
        probe.settimeout(1)
        return probe.connect_ex(('127.0.0.1', 5050)) == 0


def main(action):
    if action not in ('status', 'start', 'stop'):
        raise SystemExit('Uso: python fun_service.py status|start|stop')
    os.umask(0o077)
    BASE.mkdir(mode=0o700, exist_ok=True)
    with (BASE / 'control.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load()
        active = owned(state)
        if action == 'status':
            print(json.dumps({'owned_process': active, 'tcp_5050': port_open()}))
        elif action == 'start':
            if active:
                print('Fun já está ativo; nenhum processo criado.')
                return
            if port_open():
                raise SystemExit('5050 ocupada sem identidade reconhecida; investigar, não duplicar.')
            launch_log = BASE / 'launch.log'
            if launch_log.exists() and launch_log.stat().st_size >= 1_000_000:
                launch_log.replace(BASE / 'launch.previous.log')
            with launch_log.open('ab') as output:
                child = subprocess.Popen(['proot-distro', 'login', '--minimal', 'debian', '--', '/bin/sh', MARKER],
                                         stdin=subprocess.DEVNULL, stdout=output, stderr=output, start_new_session=True)
            stamp = birth(child.pid)
            if not stamp:
                raise SystemExit('Processo não iniciou; revisar launch.log privado.')
            temporary = BASE / 'process.next.json'
            temporary.write_text(json.dumps({'pid': child.pid, 'birth': stamp}))
            temporary.replace(BASE / 'process.json')
            print('Fun iniciado. Confirmar saúde HTTP e recursos; não alterar Nginx automaticamente.')
        elif not active:
            raise SystemExit('Sem grupo Fun com identidade verificada; nenhum sinal foi enviado.')
        else:
            os.killpg(state['pid'], signal.SIGTERM)
            deadline = time.monotonic() + 10
            while owned(state) and time.monotonic() < deadline:
                time.sleep(.2)
            if owned(state) or port_open():
                raise SystemExit('Parada não confirmada; inspecionar. Não há SIGKILL automático.')
            with contextlib.suppress(FileNotFoundError):
                (BASE / 'process.json').unlink()
            print('Grupo exclusivo Fun parado e 5050 liberada.')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) == 2 else '')
