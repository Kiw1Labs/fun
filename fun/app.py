"""Adaptador HTTP/WebSocket; um worker é requisito de consistência."""
import asyncio
import contextlib
import json
import logging
import mimetypes
import os
import re
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from . import API_VERSION
from .catalog import load
from .engine import Engine, RuleError
from .store import Store

log = logging.getLogger('fun')


class Limiter:
    def __init__(self):
        self.buckets = OrderedDict()

    def allow(self, key, count, window):
        now = time.monotonic()
        q = self.buckets.pop(key, deque())
        while q and q[0] <= now-window:
            q.popleft()
        allowed = len(q) < count
        if allowed:
            q.append(now)
        self.buckets[key] = q
        if len(self.buckets) > 4096:
            self.buckets.popitem(last=False)
        return allowed


def create_app(database=None, catalog=None, clock=None, static_dir=None, origins=None):
    # Alguns registros MIME do Windows não conhecem WebP; usar tipo explícito.
    mimetypes.add_type('image/webp', '.webp')
    if clock is None:
        epoch, monotonic = time.time(), time.monotonic()
        def clock():
            return epoch + time.monotonic() - monotonic
    store = Store(database or os.getenv('FUN_DATABASE', 'data/fun.sqlite3'))
    if catalog is None:
        stored = store.catalog()
        # Não ressuscitar questões desativadas por um fallback JSON antigo.
        has_rows = store.db.execute('SELECT EXISTS(SELECT 1 FROM questions)').fetchone()[0]
        catalog = stored if has_rows else load(os.getenv('FUN_CATALOG', 'data/catalog.json'))
    engine = Engine(store, catalog, clock)
    lock, limiter, clients = asyncio.Lock(), Limiter(), {}
    allowed = set(origins or os.getenv('FUN_ORIGINS', 'http://127.0.0.1:5050,http://localhost:5050').split(','))
    static = Path(static_dir or os.getenv('FUN_STATIC', 'dist'))

    def publish():
        for cid, client in list(clients.items()):
            code, pid, queue = client
            if code not in engine.rooms:
                continue
            try:
                if queue.full():
                    queue.get_nowait()
                queue.put_nowait(engine.snapshot(code, pid))
            except Exception:
                log.exception('Falha ao publicar estado')

    async def ticker():
        while True:
            await asyncio.sleep(.25)
            async with lock:
                before = {c: r['revision'] for c, r in engine.rooms.items()}
                engine.tick()
                if before != {c: r['revision'] for c, r in engine.rooms.items()}:
                    publish()

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(ticker())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        # Disconnect é persistido pelo Engine; próxima inicialização cancela jogos interrompidos.
        store.close()

    def origin_ok(obj):
        return obj.headers.get('origin') in allowed

    async def body(request):
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 4096:
                raise RuleError('Mensagem excede 4 KiB.')
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError) as exc:
            raise RuleError('JSON inválido.') from exc
        fields = {'name'} if request.path_params.get('code') else {'name', 'room_name', 'visibility'}
        if not isinstance(data, dict) or 'name' not in data or set(data) - fields:
            raise RuleError('Informe somente os campos permitidos para a sala.')
        return data

    async def create_or_join(request: Request):
        if not origin_ok(request):
            return JSONResponse({'error': 'Origem não autorizada.'}, status_code=403)
        ip = request.client.host if request.client else 'unknown'
        if not limiter.allow(('http', ip), 30, 60):
            return JSONResponse({'error': 'Muitas solicitações. Aguarde um minuto.'}, status_code=429)
        try:
            data = await body(request)
            async with lock:
                engine.tick()
                code = request.path_params.get('code')
                if code and not re.fullmatch('[A-Z]{4}', code):
                    raise RuleError('O código precisa ter quatro letras.')
                result = engine.join(code, data['name']) if code else engine.create(
                    data['name'], data.get('room_name', ''), data.get('visibility', 'private'))
                publish()
            return JSONResponse(result, status_code=201, headers={'Cache-Control': 'no-store'})
        except RuleError as exc:
            return JSONResponse({'error': str(exc)}, status_code=400)

    async def health(request):
        return JSONResponse({'status': 'ok', 'game': 'sabe-essa', 'api_version': API_VERSION, 'catalog_count': len(engine.catalog)},
                            headers={'Cache-Control': 'no-store'})

    async def public_rooms(request):
        ip = request.client.host if request.client else 'unknown'
        if not limiter.allow(('directory', ip), 120, 60):
            return JSONResponse({'error': 'Aguarde um momento para atualizar as salas.'}, status_code=429)
        async with lock:
            rooms = engine.public_rooms()
        return JSONResponse({'rooms': rooms}, headers={'Cache-Control': 'no-store'})

    async def ws(socket):
        code = socket.path_params['code']
        ip = socket.client.host if socket.client else 'unknown'
        if not re.fullmatch('[A-Z]{4}', code) or not origin_ok(socket) or not limiter.allow(('connect', ip), 60, 60):
            await socket.close(code=1008)
            return
        await socket.accept()
        cid, pid, sender = object(), None, None
        queue = asyncio.Queue(maxsize=32)
        try:
            raw = await asyncio.wait_for(socket.receive_text(), timeout=5)
            if len(raw) > 512:
                raise RuleError('Autenticação inválida.')
            auth = json.loads(raw)
            if not isinstance(auth, dict) or set(auth) != {'token'}:
                raise RuleError('Autenticação inválida.')
            async with lock:
                pid = engine.connect(code, auth['token'], cid)
                clients[cid] = code, pid, queue
                publish()

            async def send():
                while True:
                    message = await queue.get()
                    await asyncio.wait_for(socket.send_json(message), timeout=5)
                    if message.get('type') == 'state' and (message['phase'] == 'closed' or not any(p['id'] == pid and p['active'] for p in message['people'])):
                        await socket.close(code=1000)
                        return

            sender = asyncio.create_task(send())
            while not sender.done():
                receive = asyncio.create_task(socket.receive_text())
                done, _ = await asyncio.wait({receive, sender}, timeout=35, return_when=asyncio.FIRST_COMPLETED)
                if receive not in done:
                    receive.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await receive
                    break
                raw = receive.result()
                if len(raw) > 4096 or not limiter.allow(('event', code, pid), 100, 10):
                    raise RuleError('Limite de mensagens excedido.')
                event = json.loads(raw)
                if event == {'type': 'ping'}:
                    queue.put_nowait({'type': 'pong', 'server_now': clock()})
                    continue
                async with lock:
                    try:
                        reply = engine.action(code, pid, event)
                    except RuleError as exc:
                        reply = dict(type='ack', ok=False, error=str(exc))
                    queue.put_nowait(reply)
                    publish()
        except (RuleError, ValueError, TypeError, KeyError, asyncio.TimeoutError, asyncio.QueueFull):
            with contextlib.suppress(Exception):
                await socket.close(code=1008, reason='Sessão ou mensagem inválida.')
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            clients.pop(cid, None)
            if sender:
                sender.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await sender
            if pid:
                async with lock:
                    engine.disconnect(code, pid, cid)
                    publish()
            with contextlib.suppress(Exception):
                await socket.close(code=1001)

    async def index(request):
        path = request.url.path
        if path != '/' and not re.fullmatch('/[A-Z]{4}', path):
            return Response('Página não encontrada.', status_code=404)
        if not (static / 'index.html').exists():
            return Response('Execute npm run build antes de iniciar.', status_code=503)
        return FileResponse(static / 'index.html', headers={'Cache-Control': 'no-cache'})

    routes = [Route('/health', health), Route('/api/rooms', public_rooms, methods=['GET']),
              Route('/api/rooms', create_or_join, methods=['POST']),
              Route('/api/rooms/{code}/join', create_or_join, methods=['POST']),
              WebSocketRoute('/ws/{code}', ws)]
    if (static / 'assets').exists():
        routes.append(Mount('/assets', app=StaticFiles(directory=static / 'assets')))
    brand_dir = static / 'brand'
    if not brand_dir.exists():
        brand_dir = Path(__file__).resolve().parent.parent / 'frontend' / 'brand'
    if brand_dir.exists():
        routes.append(Mount('/brand', app=StaticFiles(directory=brand_dir)))
    favicon = static / 'favicon.svg'
    if not favicon.exists():
        favicon = Path(__file__).resolve().parent.parent / 'frontend' / 'favicon.svg'
    if favicon.exists():
        routes.append(Route('/favicon.svg', lambda request: FileResponse(favicon, media_type='image/svg+xml', headers={'Cache-Control': 'public, max-age=300'})))
    media = Path(os.getenv('FUN_MEDIA', 'data/media'))
    if media.exists():
        routes.append(Mount('/media', app=StaticFiles(directory=media)))
    routes.append(Route('/{path:path}', index))
    app = Starlette(routes=routes, lifespan=lifespan)
    app.state.engine = engine

    async def security(request, call_next):
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        response.headers['Cache-Control'] = response.headers.get('Cache-Control', 'no-store')
        return response

    app.add_middleware(BaseHTTPMiddleware, dispatch=security)
    return app
