"""Regressões de uso, limites de entrada e recuperação com estado isolado."""
import pytest

from fun.engine import Engine
from fun.store import Store
from tests.test_app import ORIGIN, make_client, receive_type


@pytest.mark.parametrize('room_name', ['', '   ', '\u2003\u2003'])
@pytest.mark.parametrize('visibility', ['public', 'private'])
def test_unnamed_room_uses_creator_name(tmp_path, room_name, visibility):
    with make_client(tmp_path) as client:
        response = client.post('/api/rooms', headers=ORIGIN, json={
            'name': '  kiwi  ', 'room_name': room_name, 'visibility': visibility})
        assert response.status_code == 201
        identity = response.json()
        with client.websocket_connect(f"/ws/{identity['code']}", headers=ORIGIN) as ws:
            ws.send_json({'token': identity['token']})
            state = receive_type(ws, 'state')
            assert state['room_name'] == 'Sala do kiwi'
            assert state['visibility'] == visibility
            assert state['people'][0]['name'] == 'kiwi'
            rooms = client.get('/api/rooms').json()['rooms']
            assert [r['room_name'] for r in rooms] == (['Sala do kiwi'] if visibility == 'public' else [])


def test_default_room_name_survives_restart_and_host_transfer(tmp_path):
    path = str(tmp_path / 'audit.sqlite3')
    store = Store(path)
    engine = Engine(store, [], lambda: 10000)
    host = engine.create('João')
    guest = engine.join(host['code'], 'Maria')
    engine.connect(host['code'], host['token'], 'a')
    engine.connect(guest['code'], guest['token'], 'b')
    engine.action(host['code'], host['participant'], {'id': 'audit-host-leave', 'action': 'leave'})
    store.close()
    store = Store(path)
    restored = Engine(store, [], lambda: 10001)
    restored.connect(guest['code'], guest['token'], 'c')
    state = restored.snapshot(guest['code'], guest['participant'])
    assert state['room_name'] == 'Sala do João'
    assert state['host'] == guest['participant']
    store.close()


@pytest.mark.parametrize('payload', [
    None, [], {}, {'name': None}, {'name': []}, {'name': {}}, {'name': True},
    {'name': 12}, {'name': ''}, {'name': '   '}, {'name': 'x'*25}, {'name': 'a\nb'},
    {'name': 'Ana', 'room_name': []}, {'name': 'Ana', 'room_name': {}},
    {'name': 'Ana', 'room_name': 'x'*49}, {'name': 'Ana', 'room_name': 'a\x7fb'},
    {'name': 'Ana', 'visibility': None}, {'name': 'Ana', 'visibility': {}},
    {'name': 'Ana', 'visibility': True}, {'name': 'Ana', 'game': 'other'},
])
def test_bad_http_input_never_creates_room_or_returns_500(tmp_path, payload):
    import json
    with make_client(tmp_path) as client:
        response = client.post('/api/rooms', headers=ORIGIN, content=json.dumps(payload))
        assert response.status_code == 400
        assert 'error' in response.json()
        assert client.app.state.engine.rooms == {}


def test_health_declares_frontend_contract(tmp_path):
    with make_client(tmp_path) as client:
        response = client.get('/health')
        assert response.json()['api_version'] == 2
        assert response.headers['cache-control'] == 'no-store'


def test_named_room_preserves_unicode_and_limit(tmp_path):
    with make_client(tmp_path) as client:
        name = 'Á' * 48
        identity = client.post('/api/rooms', headers=ORIGIN, json={
            'name': 'Érica', 'room_name': name}).json()
        assert client.app.state.engine.rooms[identity['code']]['room_name'] == name
