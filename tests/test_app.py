import json

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from fun.app import create_app

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
