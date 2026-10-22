from concurrent.futures import ThreadPoolExecutor

from starlette.testclient import TestClient

from fun.app import create_app
from tests.test_app import ORIGIN, receive_type


def test_concurrent_tabs_cannot_double_start_or_score(tmp_path, catalog):
    app = create_app(database=str(tmp_path / 'db'), catalog=catalog, origins=['http://testserver'])
    with TestClient(app) as client:
        a = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana'}).json()
        b = client.post(f"/api/rooms/{a['code']}/join", headers=ORIGIN, json={'name': 'Bia'}).json()
        url = f"/ws/{a['code']}"
        with client.websocket_connect(url, headers=ORIGIN) as wa, client.websocket_connect(url, headers=ORIGIN) as tab, client.websocket_connect(url, headers=ORIGIN) as wb:
            for socket, identity in ((wa, a), (tab, a), (wb, b)):
                socket.send_json({'token': identity['token']})
                receive_type(socket, 'state')
            with ThreadPoolExecutor(2) as executor:
                list(executor.map(lambda socket: socket.send_json({'id': 'same-start-id', 'action': 'start'}), (wa, tab)))
            assert receive_type(wa, 'ack')['ok']
            assert receive_type(tab, 'ack')['ok']
            r = app.state.engine.rooms[a['code']]
            assert len(r['history']) == 1 and r['index'] == 0
            answer = {'id': 'same-answer-id', 'action': 'answer', 'round_id': r['round_id'], 'answer': r['deck'][0]['answer']}
            with ThreadPoolExecutor(2) as executor:
                list(executor.map(lambda socket: socket.send_json(answer), (wa, tab)))
            first, second = receive_type(wa, 'ack'), receive_type(tab, 'ack')
            assert first == second
            assert r['people'][a['participant']]['score'] == first['points']


def test_concurrent_last_slot_has_one_winner(tmp_path):
    app = create_app(database=str(tmp_path / 'db'), catalog=[], origins=['http://testserver'])
    with TestClient(app) as client:
        a = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana'}).json()
        for i in range(14):
            assert client.post(f"/api/rooms/{a['code']}/join", headers=ORIGIN, json={'name': str(i)}).status_code == 201
        with ThreadPoolExecutor(2) as executor:
            results = list(executor.map(lambda i: client.post(f"/api/rooms/{a['code']}/join", headers=ORIGIN, json={'name': f'Concorrente {i}'}).status_code, range(2)))
        assert sorted(results) == [201, 400]
        assert len(app.state.engine.members(app.state.engine.rooms[a['code']])) == 16


def test_concurrent_tabs_choose_only_one_game(tmp_path):
    app = create_app(database=str(tmp_path / 'db'), catalog=[], origins=['http://testserver'])
    with TestClient(app) as client:
        host = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana', 'game': None}).json()
        url = f"/ws/{host['code']}"
        with client.websocket_connect(url, headers=ORIGIN) as a, client.websocket_connect(url, headers=ORIGIN) as b:
            for socket in (a, b):
                socket.send_json({'token': host['token']})
                receive_type(socket, 'state')
            def choose(pair):
                socket, game = pair
                socket.send_json(dict(id='choose-' + game, action='select_game', game=game))
            with ThreadPoolExecutor(2) as executor:
                list(executor.map(choose, ((a, 'sabe-essa'), (b, 'batata-quente'))))
            replies = [receive_type(socket, 'ack') for socket in (a, b)]
            assert sum(reply['ok'] for reply in replies) == 1
            state = app.state.engine.snapshot(host['code'], host['participant'])
            assert state['game'] == ('sabe-essa' if replies[0]['ok'] else 'batata-quente')
            assert state['phase'] == 'lobby' and len(state['people']) == 1
