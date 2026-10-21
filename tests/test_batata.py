import json
import uuid

import pytest
from starlette.testclient import TestClient

from fun.app import create_app
from fun.engine import Engine, RuleError
from fun.games.lexicon import default_lexicon, normalize
from fun.store import Store


def event(action, **extras):
    return dict(id=uuid.uuid4().hex, action=action, **extras)


@pytest.fixture
def potato():
    now = [1000.0]
    store = Store(':memory:')
    engine = Engine(store, [], lambda: now[0])
    a = engine.create('Ana', game='batata-quente')
    b = engine.join(a['code'], 'Bia')
    for person in (a, b):
        engine.connect(person['code'], person['token'], person['participant'])
    yield engine, now, a, b
    store.close()


def action(engine, person, kind, **extras):
    return engine.action(person['code'], person['participant'], event(kind, **extras))


def start(potato):
    engine, now, a, b = potato
    assert action(engine, a, 'start')['ok']
    return engine, now, a, b, engine.room(a['code'])


def answer(engine, person, r, word):
    return action(engine, person, 'answer', round_id=r['round_id'], answer=word)


def test_real_lexicon_and_normalization(monkeypatch):
    monkeypatch.setenv('FUN_DICTIONARY', '')
    lexicon = default_lexicon()
    assert len(lexicon) > 100000
    for word in ('braço', 'BRACO', 'pães', 'paes', 'banana', 'batata', 'casa', 'casas', 'cantamos', 'jogamos'):
        assert lexicon.lookup(word), word
    assert normalize(lexicon.lookup('BRACO')) == 'braco'
    assert lexicon.lookup('brac\u0327o')
    for word in ('zzqqqww', 'casa azul', 'guarda-chuva', '<script>', '123', 'Eduardo', '', None, [], 'a'*500):
        assert lexicon.lookup(word) is None, word
    for difficulty in ('easy', 'normal', 'hard'):
        fragment = lexicon.pick({}, difficulty)
        low, high = {'easy': (1000, 10**9), 'normal': (200, 5000), 'hard': (30, 500)}[difficulty]
        assert len(fragment) == 3 and low <= lexicon.counts[fragment] <= high
    assert lexicon.pick(lexicon.counts) is None


def test_defaults_host_permissions_and_limits(potato):
    engine, _, a, b = potato
    r = engine.room(a['code'])
    assert r['settings'] == dict(lives=3, min_seconds=10, max_seconds=30, floor_seconds=5, difficulty='normal')
    assert not action(engine, b, 'start')['ok']
    assert not action(engine, b, 'configure', settings=r['settings'])['ok']
    for _ in range(6):
        engine.join(a['code'], 'Convidado')
    with pytest.raises(RuleError, match='Sala cheia'):
        engine.join(a['code'], 'Sem vaga')
    other = engine.create('Outro jogo')
    assert other['code'] != a['code'] and engine.room(other['code'])['game'] == 'sabe-essa'


@pytest.mark.parametrize('change', [{'lives': True}, {'lives': 0}, {'lives': 6}, {'min_seconds': 4},
                                   {'max_seconds': 61}, {'floor_seconds': 11}, {'min_seconds': 50},
                                   {'difficulty': []}, {'difficulty': 'unknown'}])
def test_invalid_configuration(potato, change):
    engine, _, a, _ = potato
    before = dict(engine.room(a['code'])['settings'])
    assert not action(engine, a, 'configure', settings=before | change)['ok']
    assert engine.room(a['code'])['settings'] == before


def test_pass_preserves_deadline_floor_and_new_fragment(potato):
    engine, now, a, b, r = start(potato)
    assert 10 <= r['deadline'] - now[0] <= 30
    r['potato']['fragment'] = 'bra'
    deadline, first_round = r['deadline'], r['round_id']
    assert answer(engine, a, r, 'BRAÇO')['ok']
    assert r['deadline'] == deadline and r['potato']['turn'] == b['participant']
    assert r['round_id'] != first_round and r['potato']['fragment'] != 'bra'
    assert normalize(r['potato']['used']['braco']) == 'braco'
    now[0] = deadline - 1
    r['potato']['fragment'] = 'cas'
    assert answer(engine, b, r, 'casa')['ok']
    assert r['deadline'] == now[0] + 5
    assert r['potato']['cycle'] == 1


def test_invalid_repeat_and_out_of_turn_do_not_advance(potato):
    engine, _, a, b, r = start(potato)
    r['potato']['fragment'] = 'bra'
    before = (r['deadline'], r['round_id'], dict(r['potato']['lives']))
    assert 'vez' in answer(engine, b, r, 'braço')['error']
    assert 'dicionário' in answer(engine, a, r, 'zzzzzz')['error']
    assert 'conter BRA' in answer(engine, a, r, 'casa')['error']
    assert (r['deadline'], r['round_id'], r['potato']['lives']) == before
    assert answer(engine, a, r, 'braço')['ok']
    r['potato']['fragment'] = 'bra'
    assert 'já foi usada' in answer(engine, b, r, 'BRACO')['error']
    assert r['potato']['turn'] == b['participant']


def test_duplicate_submission_and_old_turn(potato):
    engine, _, a, _, r = start(potato)
    r['potato']['fragment'] = 'bra'
    send = event('answer', round_id=r['round_id'], answer='braço')
    first = engine.action(a['code'], a['participant'], send)
    assert first['ok']
    assert engine.action(a['code'], a['participant'], send) == first
    assert len(r['potato']['used']) == 1
    assert not engine.action(a['code'], a['participant'], send | {'id': uuid.uuid4().hex})['ok']


def test_timeout_exactly_once_late_word_and_winner(potato):
    engine, now, a, b, r = start(potato)
    r['potato']['fragment'] = 'bra'
    late = event('answer', round_id=r['round_id'], answer='braço')
    now[0] = r['deadline']
    assert not engine.action(a['code'], a['participant'], late)['ok']
    assert r['potato']['lives'][a['participant']] == 2
    engine.tick()
    assert r['potato']['lives'][a['participant']] == 2
    assert r['potato']['turn'] == b['participant']
    for _ in range(4):
        now[0] = r['deadline']
        engine.tick()
    assert r['phase'] == 'results' and r['winner'] == b['participant']
    assert r['potato']['lives'][a['participant']] == 0
    assert r['potato']['lives'][b['participant']] == 1
    engine.tick()
    assert r['potato']['lives'][b['participant']] == 1
    assert action(engine, a, 'start')['ok']
    assert r['phase'] == 'playing' and r['winner'] is None and r['potato']['used'] == {}
    assert set(r['potato']['lives'].values()) == {3}


def test_reconnect_spectator_and_host_departure(potato):
    engine, now, a, b, r = start(potato)
    spectator = engine.join(a['code'], 'Observadora')
    engine.connect(a['code'], spectator['token'], 'spectator')
    snapshot = engine.snapshot(a['code'], spectator['participant'])
    assert next(p for p in snapshot['people'] if p['id'] == spectator['participant'])['spectator']
    deadline = r['deadline']
    engine.disconnect(a['code'], a['participant'], a['participant'])
    now[0] += 1
    engine.connect(a['code'], a['token'], 'new-tab')
    assert len(engine.members(r)) == 3 and r['deadline'] == deadline
    assert r['potato']['lives'][a['participant']] == 3
    assert action(engine, a, 'leave')['ok']
    assert r['host'] == b['participant'] and r['winner'] == b['participant']
    assert action(engine, b, 'lobby')['ok']
    assert 'potato' not in r
    assert action(engine, b, 'start')['ok']
    assert spectator['participant'] in r['roster']


def test_host_involuntary_disconnect_transfers_after_grace(potato):
    engine, now, a, b = potato
    r = engine.room(a['code'])
    engine.disconnect(a['code'], a['participant'], a['participant'])
    now[0] += 59
    engine.tick()
    assert r['host'] == a['participant']
    now[0] += 1
    engine.tick()
    assert r['host'] == b['participant']
    with pytest.raises(RuleError, match='expirada'):
        engine.connect(a['code'], a['token'], 'too-late')


def test_all_competitors_offline_cancels_and_restart_cancels(potato):
    engine, _, a, b, r = start(potato)
    engine.disconnect(a['code'], a['participant'], a['participant'])
    engine.disconnect(b['code'], b['participant'], b['participant'])
    assert r['phase'] == 'results' and r['winner'] is None and r['result'] == 'cancelled'
    engine.connect(a['code'], a['token'], 'again-a')
    engine.connect(b['code'], b['token'], 'again-b')
    assert action(engine, a, 'start')['ok']
    recovered = Engine(engine.store, [], engine.clock)
    assert recovered.rooms[a['code']]['phase'] == 'results'
    assert recovered.rooms[a['code']]['winner'] is None


def test_kick_turn_holder_advances_with_three_players(potato):
    engine, _, a, b = potato
    c = engine.join(a['code'], 'Caio')
    engine.connect(a['code'], c['token'], 'c')
    assert action(engine, a, 'start')['ok']
    r = engine.room(a['code'])
    r['potato']['fragment'] = 'bra'
    assert answer(engine, a, r, 'braço')['ok']
    assert action(engine, a, 'kick', target=b['participant'])['ok']
    assert r['phase'] == 'playing' and r['potato']['turn'] == c['participant']
    assert r['potato']['cycle'] == 2


def test_room_isolation_and_snapshot_secrets(potato):
    engine, _, a, _, r = start(potato)
    another = engine.create('Outra', game='batata-quente')
    snapshot = engine.snapshot(a['code'], a['participant'])
    wire = json.dumps(snapshot)
    assert a['token'] not in wire and 'token_hash' not in wire
    assert 'used"' not in wire and 'spent' not in wire
    assert engine.snapshot(another['code'], another['participant'])['phase'] == 'lobby'
    assert r['phase'] == 'playing'


def test_eight_players_elimination_and_spectating(potato):
    engine, now, a, _ = potato
    for number in range(6):
        player = engine.join(a['code'], f'Jogador {number}')
        engine.connect(a['code'], player['token'], player['participant'])
    config = dict(engine.room(a['code'])['settings'], lives=1)
    assert action(engine, a, 'configure', settings=config)['ok']
    assert action(engine, a, 'start')['ok']
    r = engine.room(a['code'])
    assert len(r['roster']) == 8
    for index in range(7):
        turn = r['roster'][index]
        assert r['potato']['turn'] == turn
        now[0] = r['deadline']
        engine.tick()
        assert r['potato']['lives'][turn] == 0
        if index == 0:
            assert not answer(engine, a, r, 'casa')['ok']
    assert r['phase'] == 'results' and r['winner'] == r['roster'][-1]


def test_exhausted_dictionary_ends_without_an_impossible_turn(potato):
    engine, now, a, _ = potato

    class TinyLexicon:
        def __len__(self):
            return 1

        def lookup(self, word):
            return 'braço' if normalize(word) == 'braco' else None

        def pick(self, spent, difficulty, previous):
            return None if spent.get('bra') else 'bra'

    engine._lexicon = TinyLexicon()
    assert action(engine, a, 'start')['ok']
    r = engine.room(a['code'])
    assert answer(engine, a, r, 'braço')['ok']
    assert r['phase'] == 'results' and r['result'] == 'dictionary_exhausted'
    assert r['deadline'] is None and r['winner'] is None and r['activity'] == now[0]


def receive(ws, kind):
    while True:
        msg = ws.receive_json()
        if msg['type'] == kind:
            return msg


def test_real_http_websocket_multiplayer_race_and_reconnect(tmp_path, monkeypatch):
    monkeypatch.setenv('FUN_MEDIA', str(tmp_path / 'media'))
    now = [1000.0]
    app = create_app(database=str(tmp_path / 'game.db'), catalog=[], clock=lambda: now[0], origins=['http://testserver'])
    headers = {'origin': 'http://testserver'}
    with TestClient(app) as client:
        a = client.post('/api/rooms', headers=headers, json=dict(name='Ana', game='batata-quente')).json()
        code = a['code']
        b = client.post(f'/api/rooms/{code}/join', headers=headers, json=dict(name='Bia')).json()
        with client.websocket_connect(f'/ws/{code}', headers=headers) as wa, client.websocket_connect(f'/ws/{code}', headers=headers) as wb:
            wa.send_json({'token': a['token']})
            receive(wa, 'state')
            wb.send_json({'token': b['token']})
            receive(wb, 'state')
            wa.send_json(event('start'))
            assert receive(wa, 'ack')['ok']
            snapshot = receive(wa, 'state')
            assert snapshot['phase'] == 'playing'
            r = app.state.engine.rooms[code]
            r['potato']['fragment'] = 'bra'
            send = event('answer', round_id=r['round_id'], answer='braço')
            wa.send_json(send)
            wa.send_json(send | {'id': uuid.uuid4().hex})
            assert receive(wa, 'ack')['ok']
            assert not receive(wa, 'ack')['ok']
            assert r['potato']['turn'] == b['participant'] and len(r['potato']['used']) == 1
            with client.websocket_connect(f'/ws/{code}', headers=headers) as tab:
                tab.send_json({'token': a['token']})
                assert receive(tab, 'state')['you'] == a['participant']
                assert len(app.state.engine.members(r)) == 2
            now[0] = r['deadline']
            wb.send_json(event('answer', round_id=r['round_id'], answer='casa'))
            assert not receive(wb, 'ack')['ok']
            assert r['potato']['lives'][b['participant']] == 2
            wa.send_json(event('leave'))
            assert receive(wa, 'ack')['ok']
            assert r['host'] == b['participant'] and r['winner'] == b['participant']


def test_background_ticker_burns_without_client_sending(tmp_path, monkeypatch):
    monkeypatch.setenv('FUN_MEDIA', str(tmp_path / 'media'))
    # Relógio real, sem advance/tick do cliente: o servidor precisa publicar o resultado.
    app = create_app(database=str(tmp_path / 'real-clock.db'), catalog=[], origins=['http://testserver'])
    headers = {'origin': 'http://testserver'}
    with TestClient(app) as client:
        a = client.post('/api/rooms', headers=headers, json=dict(name='Ana', game='batata-quente')).json()
        code = a['code']
        b = client.post(f'/api/rooms/{code}/join', headers=headers, json=dict(name='Bia')).json()
        with client.websocket_connect(f'/ws/{code}', headers=headers) as wa, client.websocket_connect(f'/ws/{code}', headers=headers) as wb:
            wa.send_json({'token': a['token']})
            receive(wa, 'state')
            wb.send_json({'token': b['token']})
            receive(wb, 'state')
            wa.send_json(event('configure', settings=dict(lives=1, min_seconds=5, max_seconds=5, floor_seconds=3, difficulty='normal')))
            assert receive(wa, 'ack')['ok']
            wa.send_json(event('start'))
            assert receive(wa, 'ack')['ok']
            first = receive(wa, 'state')
            while first['phase'] != 'results':
                first = receive(wa, 'state')
            assert first['winner'] == b['participant']
            assert first['potato']['lives'][a['participant']] == 0
