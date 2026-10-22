import json
from dataclasses import replace

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from fun.app import create_app
from fun.store import Store

ORIGIN = {'Origin': 'http://testserver'}


def receive_type(ws, kind):
    for _ in range(30):
        message = ws.receive_json()
        if message['type'] == kind:
            return message
    raise AssertionError('Mensagem esperada não recebida')


def make_client(tmp_path, catalog=None):
    return TestClient(create_app(database=str(tmp_path / 'fun.db'), catalog=catalog or [], origins=['http://testserver']))


def test_http_validation_origins_limits_and_headers(tmp_path):
    with make_client(tmp_path) as client:
        assert client.get('/health').json()['status'] == 'ok'
        assert client.get('/health').headers['x-content-type-options'] == 'nosniff'
        assert client.post('/api/rooms', json={'name': 'Ana'}).status_code == 403
        assert client.post('/api/rooms', headers=ORIGIN, json={'name': 'A', 'score': 999}).status_code == 400
        assert client.post('/api/rooms', headers=ORIGIN, content='x' * 5000).status_code == 400
        assert client.post('/api/rooms', headers=ORIGIN, json={'name': '<b>Teste</b>'}).status_code == 201
        assert client.post('/api/rooms/1234/join', headers=ORIGIN, json={'name': 'Bia'}).status_code == 400
        assert client.get('/ABCDE').status_code == 404
        for _ in range(30):
            last = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Nome'})
        assert last.status_code == 429


def test_brand_assets_fall_back_to_project_sources(tmp_path, monkeypatch):
    static = tmp_path / 'static'
    static.mkdir()
    (static / 'index.html').write_text('<html></html>', encoding='utf-8')
    monkeypatch.setenv('FUN_MEDIA', str(tmp_path / 'no-media'))
    with TestClient(create_app(database=str(tmp_path / 'fun.db'), catalog=[], static_dir=str(static),
                              origins=['http://testserver'])) as client:
        favicon = client.get('/favicon.svg')
        logo = client.get('/brand/fun-logo.png')
        favicon_png = client.get('/brand/fun-favicon.png')
        assert favicon.status_code == 200 and '<svg' in favicon.text
        assert favicon.headers['content-type'].startswith('image/svg+xml')
        assert logo.status_code == 200 and logo.content.startswith(b'\x89PNG\r\n\x1a\n')
        assert favicon_png.status_code == 200 and favicon_png.content.startswith(b'\x89PNG\r\n\x1a\n')


def test_room_metadata_validation_and_public_directory(tmp_path):
    with make_client(tmp_path) as client:
        assert client.get('/api/rooms').json() == {'rooms': []}
        private = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana', 'room_name': 'Só por convite'}).json()
        public = client.post('/api/rooms', headers=ORIGIN, json={
            'name': 'Bia', 'room_name': '  Turma <b>BR</b>  ', 'visibility': 'public'}).json()
        for payload in [{'room_name': 'x' * 49}, {'room_name': 123}, {'room_name': 'a\nb'},
                        {'visibility': 'unknown'}, {'visibility': []}, {'room_name': None}]:
            assert client.post('/api/rooms', headers=ORIGIN, json={'name': 'Teste'} | payload).status_code == 400
        assert client.get('/api/rooms').json() == {'rooms': []}
        with client.websocket_connect(f"/ws/{private['code']}", headers=ORIGIN) as private_ws:
            private_ws.send_json({'token': private['token']})
            private_state = receive_type(private_ws, 'state')
            assert private_state['visibility'] == 'private' and private_state['room_name'] == 'Só por convite'
            with client.websocket_connect(f"/ws/{public['code']}", headers=ORIGIN) as ws:
                ws.send_json({'token': public['token']})
                state = receive_type(ws, 'state')
                assert state['room_name'] == 'Turma <b>BR</b>' and state['visibility'] == 'public'
                response = client.get('/api/rooms')
                assert response.headers['cache-control'] == 'no-store'
                assert response.json() == {'rooms': [dict(code=public['code'], room_name='Turma <b>BR</b>',
                                                         game='sabe-essa', phase='lobby', people=1)]}
                text = response.text
                for secret in [private['code'], private['token'], public['token'], public['participant'], 'Bia', 'token_hash', 'challenge']:
                    assert secret not in text
                # Entrada segue as mesmas regras e não permite editar metadados da sala.
                assert client.post(f"/api/rooms/{public['code']}/join", headers=ORIGIN,
                                   json={'name': 'Caio', 'visibility': 'public'}).status_code == 400
                ws.send_json({'id': 'close-public-room', 'action': 'close'})
                assert receive_type(ws, 'ack')['ok']
                assert client.get('/api/rooms').json() == {'rooms': []}


def test_http_and_websocket_unassigned_lobby(tmp_path):
    with make_client(tmp_path) as client:
        assert 'unassigned-lobby' in client.get('/health').json()['features']
        host = client.post('/api/rooms', headers=ORIGIN, json={
            'name': 'Ana', 'game': None, 'visibility': 'public'}).json()
        guest = client.post(f"/api/rooms/{host['code']}/join", headers=ORIGIN, json={'name': 'Bia'}).json()
        url = f"/ws/{host['code']}"
        with client.websocket_connect(url, headers=ORIGIN) as a, client.websocket_connect(url, headers=ORIGIN) as b:
            for socket, identity in ((a, host), (b, guest)):
                socket.send_json({'token': identity['token']})
                assert receive_type(socket, 'state')['game'] is None
            assert client.get('/api/rooms').json()['rooms'][0]['game'] is None
            b.send_json(dict(id='guest-cannot-choose', action='select_game', game='sabe-essa'))
            assert not receive_type(b, 'ack')['ok']
            a.send_json(dict(id='host-chooses-game', action='select_game', game='batata-quente'))
            assert receive_type(a, 'ack')['ok']
            for socket in (a, b):
                for _ in range(30):
                    state = receive_type(socket, 'state')
                    if state['game'] == 'batata-quente':
                        break
                assert state['game'] == 'batata-quente' and state['phase'] == 'lobby'
                assert len(state['people']) == 2
            assert client.get('/api/rooms').json()['rooms'][0]['game'] == 'batata-quente'


def test_godmode_requires_credentials_and_lists_rooms_and_all_questions(tmp_path, monkeypatch, catalog):
    monkeypatch.setenv('FUN_ADMIN_USERNAME', 'admin-test')
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', 'local-test-secret')
    app = create_app(database=str(tmp_path / 'fun.db'), catalog=catalog, origins=['http://testserver'])
    with TestClient(app) as client:
        private = client.post('/api/rooms', headers=ORIGIN,
                              json={'name': 'Ana', 'room_name': 'Privada'}).json()
        public = client.post('/api/rooms', headers=ORIGIN,
                             json={'name': 'Bia', 'room_name': 'Pública', 'visibility': 'public'}).json()
        page = client.get('/godmode')
        assert page.status_code == 200
        assert page.headers['x-robots-tag'] == 'noindex, nofollow'
        assert 'Entrar no Godmode' in page.text and 'login-form' in page.text
        assert client.get('/godmode-assets/godmode.js').status_code == 200
        assert client.get('/godmode-assets/godmode.css').status_code == 200
        unauthenticated = client.get('/api/godmode/rooms')
        assert unauthenticated.status_code == 401
        assert 'www-authenticate' not in unauthenticated.headers
        invalid = client.get('/api/godmode/questions', auth=('admin-test', 'wrong'))
        assert invalid.status_code == 401
        assert 'www-authenticate' not in invalid.headers
        auth = ('admin-test', 'local-test-secret')
        assert client.get('/api/godmode/rooms', auth=auth).status_code == 200
        assert client.get('/api/godmode/questions', auth=auth).status_code == 200
        assert f'/{private["code"]}' not in page.text and f'/{public["code"]}' not in page.text
        rooms = client.get('/api/godmode/rooms', auth=auth).json()['rooms']
        assert {room['code'] for room in rooms} == {private['code'], public['code']}
        assert {room['visibility'] for room in rooms} == {'private', 'public'}
        assert {room['name']: room['people'] for room in rooms} == {
            'Privada': [dict(name='Ana', host=True, online=False)],
            'Pública': [dict(name='Bia', host=True, online=False)],
        }
        assert all(set(room) == {'code', 'name', 'visibility', 'phase', 'players', 'people'} for room in rooms)
        listed = client.get('/api/godmode/questions', auth=auth).json()['questions']
        assert len(listed) == len(catalog)
        assert listed[0]['answer'] == catalog[0].answer


def test_godmode_room_members_host_transfer_and_no_session_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv('FUN_ADMIN_USERNAME', 'admin-test')
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', 'local-test-secret')
    auth = ('admin-test', 'local-test-secret')
    with make_client(tmp_path) as client:
        host = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana', 'room_name': 'Privada'}).json()
        code = host['code']
        guest = client.post(f'/api/rooms/{code}/join', headers=ORIGIN, json={'name': 'Bia'}).json()
        departed = client.post(f'/api/rooms/{code}/join', headers=ORIGIN, json={'name': 'Caio'}).json()
        with client.websocket_connect(f'/ws/{code}', headers=ORIGIN) as host_ws:
            host_ws.send_json({'token': host['token']})
            receive_type(host_ws, 'state')
            with client.websocket_connect(f'/ws/{code}', headers=ORIGIN) as guest_ws:
                guest_ws.send_json({'token': guest['token']})
                receive_type(guest_ws, 'state')
                response = client.get('/api/godmode/rooms', auth=auth)
                assert response.headers['cache-control'] == 'no-store'
                room = response.json()['rooms'][0]
                assert room['players'] == 3
                assert room['people'] == [dict(name='Ana', host=True, online=True),
                                          dict(name='Bia', host=False, online=True),
                                          dict(name='Caio', host=False, online=False)]
                for person in [host, guest, departed]:
                    assert person['token'] not in response.text
                    assert person['participant'] not in response.text
                for secret_field in ['token_hash', 'cooldown', 'events', 'last_wrong_answer']:
                    assert secret_field not in response.text
                assert client.get('/api/godmode/rooms').status_code == 401
                assert client.get('/api/godmode/rooms', headers={'Authorization': f"Bearer {host['token']}"}).status_code == 401
                host_ws.send_json({'id': 'remove-offline-guest', 'action': 'kick', 'target': departed['participant']})
                assert receive_type(host_ws, 'ack')['ok']
                host_ws.send_json({'id': 'host-leaves', 'action': 'leave'})
                assert receive_type(host_ws, 'ack')['ok']
                room = client.get('/api/godmode/rooms', auth=auth).json()['rooms'][0]
                assert room['players'] == 1
                assert room['people'] == [dict(name='Bia', host=True, online=True)]
                guest_ws.send_json({'id': 'close-room', 'action': 'close'})
                assert receive_type(guest_ws, 'ack')['ok']
                assert client.get('/api/godmode/rooms', auth=auth).json() == {'rooms': []}


def test_godmode_is_disabled_without_configured_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv('FUN_ADMIN_USERNAME', raising=False)
    monkeypatch.delenv('FUN_ADMIN_PASSWORD', raising=False)
    with TestClient(create_app(database=str(tmp_path / 'fun.db'), catalog=[], origins=['http://testserver'])) as client:
        assert client.get('/godmode').status_code == 404
        assert client.get('/api/godmode/rooms').status_code == 404


def test_godmode_includes_inactive_questions_stored_in_database(tmp_path, monkeypatch, catalog):
    monkeypatch.setenv('FUN_ADMIN_USERNAME', 'admin-test')
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', 'local-test-secret')
    database = tmp_path / 'fun.db'
    store = Store(str(database))
    inactive = replace(catalog[0], status='inactive')
    store.import_catalog([inactive])
    store.close()
    with TestClient(create_app(database=str(database), catalog=[], origins=['http://testserver'])) as client:
        questions = client.get('/api/godmode/questions', auth=('admin-test', 'local-test-secret')).json()['questions']
        assert questions == [dict(id=inactive.id, category=inactive.category,
                                  subcategory=inactive.subcategory, difficulty=inactive.difficulty,
                                  kind=inactive.kind, prompt=inactive.prompt, answer=inactive.answer,
                                  aliases=inactive.aliases, status='inactive', image=inactive.image)]


def test_websocket_auth_sync_f5_and_multitab(tmp_path):
    with make_client(tmp_path) as client:
        a = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana'}).json()
        url = f"/ws/{a['code']}"
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(url) as ws:
                pass
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(url, headers=ORIGIN) as ws:
                ws.send_json({'token': 'forged'})
                ws.receive_json()
        with client.websocket_connect(url, headers=ORIGIN) as ws:
            ws.send_json({'token': a['token']})
            snapshot = receive_type(ws, 'state')
            assert snapshot['you'] == a['participant'] and snapshot['host'] == a['participant']
            assert a['token'] not in json.dumps(snapshot)
            with client.websocket_connect(url, headers=ORIGIN) as tab:
                tab.send_json({'token': a['token']})
                assert receive_type(tab, 'state')['you'] == a['participant']
                tab.send_json({'type': 'ping'})
                assert receive_type(tab, 'pong')['server_now'] > 0
            ws.send_json({'id': 'presence-event', 'action': 'presence'})
            assert receive_type(ws, 'ack')['ok']
        with client.websocket_connect(url, headers=ORIGIN) as ws:
            ws.send_json({'token': a['token']})
            assert receive_type(ws, 'state')['you'] == a['participant']


def test_full_ws_permissions_duplicate_and_private_answers(tmp_path, catalog):
    with make_client(tmp_path, catalog) as client:
        a = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana'}).json()
        b = client.post(f"/api/rooms/{a['code']}/join", headers=ORIGIN, json={'name': 'Bia'}).json()
        url = f"/ws/{a['code']}"
        with client.websocket_connect(url, headers=ORIGIN) as wa, client.websocket_connect(url, headers=ORIGIN) as wb:
            wa.send_json({'token': a['token']})
            receive_type(wa, 'state')
            wb.send_json({'token': b['token']})
            receive_type(wb, 'state')
            wb.send_json({'id': 'unauthorized', 'action': 'start'})
            assert not receive_type(wb, 'ack')['ok']
            wa.send_json({'id': 'start-event1', 'action': 'start'})
            assert receive_type(wa, 'ack')['ok']
            snapshot = receive_type(wa, 'state')
            assert snapshot['phase'] == 'question'
            assert 'answer' not in snapshot['challenge'] and 'aliases' not in json.dumps(snapshot)
            event = {'id': 'answer-event1', 'action': 'answer', 'round_id': snapshot['round_id'], 'answer': 'errado'}
            wa.send_json(event)
            first = receive_type(wa, 'ack')
            wa.send_json(event)
            assert receive_type(wa, 'ack') == first
            wa.send_json({'id': 'kick-event-1', 'action': 'kick', 'target': b['participant']})
            assert receive_type(wa, 'ack')['ok']
            final = receive_type(wa, 'state')
            assert final['result'] == 'automatic'


@pytest.mark.parametrize('payload', ['[]', 'null', 'not-json', '{"token":1}', 'x' * 600])
def test_malformed_ws_never_authenticates(tmp_path, payload):
    with make_client(tmp_path) as client:
        a = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana'}).json()
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/{a['code']}", headers=ORIGIN) as ws:
                ws.send_text(payload)
                ws.receive_json()
