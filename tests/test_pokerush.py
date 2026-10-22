"""Regras reais de PokéRush, transporte, concorrência, retomada e pacote offline."""
import hashlib
import json
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from fun.app import create_app
from fun.engine import Engine, RuleError
from fun.games.pokerush import TYPES, PokemonCatalog, default_catalog, normalize
from fun.store import Store
from tests.test_app import ORIGIN, receive_type
from tests.test_engine import act


@pytest.fixture
def rush():
    now = [1000.0]
    store = Store(':memory:')
    engine = Engine(store, [], lambda: now[0])
    host = engine.create('Ana', game='pokerush', visibility='public')
    guest = engine.join(host['code'], 'Bia')
    for player in (host, guest):
        engine.connect(player['code'], player['token'], player['participant'])
    assert act(engine, host, 'start')['ok']
    yield engine, now, host, guest, engine.room(host['code'])
    store.close()


def submit(engine, player, room, name, **extra):
    return act(engine, player, 'answer', round_id=room['round_id'], answer=name, **extra)


def available(engine, room):
    game = room['pokerush']
    return next(p for p in engine.pokerush.catalog.records.values()
                if p['types'] == game['types'] and str(p['id']) not in game['used'])


def test_catalog_local_complete_current_types_images_and_sources():
    root = Path('content/pokerush')
    doc = json.loads((root / 'catalog.json').read_text(encoding='utf-8'))
    catalog = default_catalog()
    assert len(catalog.records) == 151
    for p in doc['pokemon']:
        assert p['source'] == f'https://pokeapi.co/api/v2/pokemon/{p["id"]}/'
        assert p['image'] == f'/assets/pokerush/{p["id"]}.png'
        image = (root / f'{p["id"]}.png').read_bytes()
        assert image.startswith(b'\x89PNG\r\n\x1a\n')
        assert image[25] in (4, 6) or b'tRNS' in image  # Canal alfa ou paleta transparente.
        assert hashlib.sha256(image).hexdigest() == p['image_sha256']
    assert catalog.records[6]['types'] == ['fire', 'flying']
    assert catalog.records[35]['types'] == ['fairy']
    assert catalog.records[81]['types'] == ['electric', 'steel']
    assert catalog.records[122]['types'] == ['fairy', 'psychic']
    assert sum((root / f'{i}.png').stat().st_size for i in range(1, 152)) < 200_000
    with pytest.raises(ValueError):
        PokemonCatalog(doc['pokemon'][:-1])


def test_portuguese_types_match_browser_contract():
    source = Path('frontend/pokerush.js').read_text(encoding='utf-8')
    mapping = dict(re.findall(r"([a-z]+):'([^']+)'", source.split('const icon=')[0]))
    assert mapping == TYPES


@pytest.mark.parametrize('text,identifier', [('CHARMANDER', 4), ('  cHár mander!! ', 4), ('Mr Mime', 122),
    ('  MR. MIME ', 122), ('mr-mime', 122), ('Nidoran F', 29), ('Nidoran ♀', 29), ('nidoran-f', 29),
    ('Nidoran M', 32), ('NIDORAN ♂', 32), ('farfetchd', 83), ("Farfetch’d", 83)])
def test_names_normalize_exactly(text, identifier):
    assert default_catalog().lookup(text)['id'] == identifier
    assert normalize(text) == normalize(default_catalog().records[identifier]['name'])


@pytest.mark.parametrize('text', ['Nidoran', 'Charmande', 'Charmnader', 'Charmanderx', 'Mr M', 'mrmine', '', None, [], 123])
def test_no_fuzzy_or_ambiguous_names(text):
    assert default_catalog().lookup(text) is None


@pytest.mark.parametrize('types,name,correct', [(['fire'], 'Charmander', True), (['fire'], 'Charizard', False),
    (['flying', 'fire'], 'Charizard', True), (['fire', 'flying'], 'Charmeleon', False),
    (['fairy'], 'Clefairy', True), (['normal'], 'Clefairy', False)])
def test_exact_type_sets(rush, types, name, correct):
    engine, _, host, _, room = rush
    room['pokerush']['types'] = types
    assert submit(engine, host, room, name)['correct'] is correct
    assert room['people'][host['participant']]['score'] == (50 if correct else 0)


def test_uniform_groups_exhaustion_and_nonrepeat(monkeypatch):
    catalog = default_catalog()
    observed = []
    def choose(options):
        observed.append(options)
        return options[0]
    monkeypatch.setattr('fun.games.pokerush.secrets.choice', choose)
    catalog.pick({}, None)
    assert len(observed[0]) == len(catalog.groups)
    assert len(set(observed[0])) == len(catalog.groups)  # Um bilhete por conjunto, sem peso por Pokémon.
    previous = list(observed[0][0])
    assert catalog.pick({}, previous) != previous
    assert tuple(previous) not in observed[-1]
    used = {str(i): 'someone' for i in range(1, 152) if i != 4}
    assert catalog.eligible(used) == [('fire',)]
    assert catalog.pick(used, ['fire']) == ['fire']
    used['4'] = 'someone'
    assert catalog.eligible(used) == [] and catalog.pick(used, ['fire']) is None


def test_global_used_error_cooldown_and_unchanged_challenge(rush):
    engine, now, host, guest, room = rush
    room['pokerush']['types'] = ['fire']
    assert submit(engine, host, room, 'Charmander')['points'] == 50
    room['pokerush']['types'] = ['fire']
    before = (room['round_id'], room['deadline'], room['pokerush']['streak'])
    wrong = submit(engine, guest, room, 'Charmander')
    assert wrong == dict(ok=True, type='ack', id=wrong['id'], correct=False, retry_at=now[0] + .5)
    assert (room['round_id'], room['deadline'], room['pokerush']['streak']) == before
    assert len(room['pokerush']['used']) == 1
    assert room['people'][guest['participant']]['score'] == 0
    now[0] += .499
    assert not submit(engine, guest, room, 'Charmeleon')['correct']
    now[0] += .001
    assert submit(engine, guest, room, 'Charmeleon')['correct']
    assert room['people'][guest['participant']]['score'] == 50


def test_streak_wrong_does_not_break_it_other_player_does(rush):
    engine, now, host, guest, room = rush
    for expected in (50, 70, 90, 110):
        assert submit(engine, host, room, available(engine, room)['name'])['points'] == expected
    assert room['people'][host['participant']]['score'] == 320
    assert not submit(engine, host, room, 'Isso não existe')['correct']
    assert not submit(engine, guest, room, 'Também não existe')['correct']
    assert room['pokerush']['streak'] == 4
    now[0] += .5
    assert submit(engine, host, room, available(engine, room)['name'])['points'] == 130
    assert submit(engine, guest, room, available(engine, room)['name'])['points'] == 50
    state = engine.snapshot(host['code'], host['participant'])
    assert next(p for p in state['people'] if p['id'] == host['participant'])['streak'] == 0
    assert submit(engine, host, room, available(engine, room)['name'])['points'] == 50
    assert room['pokerush']['stats'][host['participant']] == dict(hits=6, best_streak=5)


def test_stale_messages_duplicates_and_cooldown_order(rush):
    engine, now, host, guest, room = rush
    old_round = room['round_id']
    pokemon = available(engine, room)
    event = dict(id='one-correct-event', action='answer', round_id=old_round, answer=pokemon['name'])
    first = engine.action(host['code'], host['participant'], event)
    assert first['points'] == 50
    assert engine.action(host['code'], host['participant'], event) == first
    # Até outra resposta correta para o desafio antigo é descartada.
    stale = act(engine, guest, 'answer', round_id=old_round, answer=available(engine, room)['name'])
    assert stale['ignored'] and 'correct' not in stale
    assert len(room['pokerush']['used']) == 1 and room['people'][guest['participant']]['cooldown'] == 0
    assert not submit(engine, guest, room, 'inexistente')['correct']
    assert act(engine, guest, 'answer', round_id=old_round, answer='inexistente')['ignored']
    assert room['people'][guest['participant']]['cooldown'] == now[0] + .5
    with pytest.raises(RuleError, match='reutilizado'):
        engine.action(host['code'], host['participant'], dict(event, answer='Pikachu'))


def test_timer_restart_boundary_and_transient_success(rush):
    engine, now, host, guest, room = rush
    initial_deadline = room['deadline']
    now[0] += 29.9
    assert submit(engine, host, room, available(engine, room)['name'])['correct']
    assert room['deadline'] == now[0] + 30 > initial_deadline
    state = engine.snapshot(host['code'], host['participant'])
    player = next(p for p in state['people'] if p['id'] == host['participant'])
    first = player['success']
    assert first['until'] == now[0] + 2 and set(first['pokemon']) == {'id', 'name', 'image', 'types'}
    now[0] += 1
    assert submit(engine, host, room, available(engine, room)['name'])['correct']
    second = engine.snapshot(host['code'], host['participant'])['people'][0]['success']
    assert first['id'] != second['id'] and second['until'] == now[0] + 2
    now[0] += 2
    assert engine.snapshot(host['code'], host['participant'])['people'][0]['success'] is None
    now[0] = room['deadline']
    assert submit(engine, guest, room, available(engine, room)['name'])['ignored']
    assert room['phase'] == 'results' and room['result'] == 'timeout'
    assert engine.snapshot(host['code'], host['participant'])['winners'] == [host['participant']]


def test_use_all_151_and_restart_resets_everything(rush):
    engine, _, host, guest, room = rush
    for count in range(151):
        player = host if count % 2 else guest
        pokemon = available(engine, room)
        assert submit(engine, player, room, pokemon['name'])['correct']
        assert len(room['pokerush']['used']) == count + 1
        if count < 150:
            assert room['phase'] == 'playing'
            assert engine.pokerush.catalog.eligible(room['pokerush']['used'])
    assert room['phase'] == 'results' and room['result'] == 'exhausted' and room['deadline'] is None
    assert not act(engine, guest, 'start')['ok']
    assert act(engine, host, 'start')['ok']
    assert room['phase'] == 'playing' and not room['pokerush']['used']
    assert room['pokerush']['streak'] == 0 and not room['pokerush']['successes']
    assert all(p['score'] == 0 and p['cooldown'] == 0 for p in room['people'].values())


def test_ties_results_lobby_and_spectator_next_match(rush):
    engine, now, host, guest, room = rush
    spectator = engine.join(host['code'], 'Caio')
    engine.connect(host['code'], spectator['token'], 'spectator')
    assert engine.snapshot(host['code'], spectator['participant'])['people'][-1]['spectator']
    assert not submit(engine, spectator, room, available(engine, room)['name'])['ok']
    assert submit(engine, host, room, available(engine, room)['name'])['points'] == 50
    assert submit(engine, guest, room, available(engine, room)['name'])['points'] == 50
    now[0] = room['deadline']
    engine.tick()
    state = engine.snapshot(host['code'], host['participant'])
    assert state['winners'] == [host['participant'], guest['participant']]
    assert [p['rank'] for p in state['people']] == [1, 1, None]
    assert not act(engine, guest, 'lobby')['ok']
    assert act(engine, host, 'lobby')['ok']
    assert not any(p['spectator'] or p['success'] or p['score'] for p in engine.snapshot(host['code'], host['participant'])['people'])
    assert act(engine, host, 'start')['ok']
    assert spectator['participant'] in room['roster']


def test_reconnect_preserves_score_stats_and_identity_restart_cancels(rush):
    engine, now, host, guest, room = rush
    assert submit(engine, guest, room, available(engine, room)['name'])['points'] == 50
    engine.disconnect(host['code'], guest['participant'], guest['participant'])
    now[0] += 1
    assert room['phase'] == 'playing'
    assert engine.connect(host['code'], guest['token'], 'returned') == guest['participant']
    me = next(p for p in engine.snapshot(host['code'], guest['participant'])['people'] if p['id'] == guest['participant'])
    assert me['score'] == 50 and me['hits'] == 1 and me['best_streak'] == 1 and not me['spectator']
    restored = Engine(engine.store, [], lambda: now[0])
    assert restored.room(host['code'])['result'] == 'cancelled'
    restored.connect(host['code'], guest['token'], 'after-restart')
    state = restored.snapshot(host['code'], guest['participant'])
    assert state['winners'] == [] and next(p for p in state['people'] if p['id'] == guest['participant'])['score'] == 50


def test_departures_transfer_abandonment_all_offline_and_cleanup(rush):
    engine, now, host, guest, room = rush
    third = engine.join(host['code'], 'Caio')
    engine.connect(host['code'], third['token'], 'spectator')
    assert act(engine, host, 'leave')['ok']
    assert room['host'] == guest['participant'] and room['result'] == 'automatic'
    assert engine.snapshot(host['code'], guest['participant'])['winners'] == [guest['participant']]
    assert act(engine, guest, 'start')['ok']
    engine.disconnect(host['code'], guest['participant'], guest['participant'])
    engine.disconnect(host['code'], third['participant'], 'spectator')
    assert room['result'] == 'cancelled' and engine.snapshot(host['code'], third['participant'])['winners'] == []
    now[0] += 301
    engine.tick()
    assert room['phase'] == 'closed'
    now[0] += 300
    engine.tick()
    assert host['code'] not in engine.rooms


def test_offline_competitors_cancel_even_with_connected_spectator(rush):
    engine, _, host, guest, room = rush
    spectator = engine.join(host['code'], 'Observador')
    engine.connect(host['code'], spectator['token'], 'watching')
    engine.disconnect(host['code'], host['participant'], host['participant'])
    engine.disconnect(host['code'], guest['participant'], guest['participant'])
    assert room['phase'] == 'results' and room['result'] == 'cancelled'
    assert engine.online(host['code'], spectator['participant'])
    assert engine.snapshot(host['code'], spectator['participant'])['winners'] == []


def test_abandonment_transfers_host_and_departed_scores_survive(rush):
    engine, now, host, guest, room = rush
    assert submit(engine, host, room, available(engine, room)['name'])['correct']
    engine.disconnect(host['code'], host['participant'], host['participant'])
    assert room['host'] == host['participant']
    # O prazo da partida pode acabar antes da janela de reconexão; o placar ainda precisa ser preservado.
    now[0] += 60
    engine.tick()
    assert room['host'] == guest['participant']
    state = engine.snapshot(host['code'], guest['participant'])
    departed = next(p for p in state['people'] if p['id'] == host['participant'])
    assert not departed['active'] and departed['score'] == 50 and departed['hits'] == 1 and departed['rank'] is None
    assert act(engine, guest, 'lobby')['ok']
    assert host['participant'] not in room['people']


def test_lobby_choice_capacity_and_host_authorization():
    store = Store(':memory:')
    engine = Engine(store, [])
    host = engine.create('Ana', game=None)
    players = [host] + [engine.join(host['code'], f'Pessoa {i}') for i in range(15)]
    for player in players:
        engine.connect(player['code'], player['token'], player['participant'])
    assert not act(engine, players[1], 'select_game', game='pokerush')['ok']
    assert act(engine, host, 'select_game', game='pokerush')['ok']
    assert engine.public_rooms() == []
    assert not act(engine, players[1], 'start')['ok']
    assert act(engine, host, 'start')['ok']
    assert len(engine.room(host['code'])['roster']) == 16
    with pytest.raises(RuleError, match='16 pessoas'):
        engine.join(host['code'], 'Sem vaga')
    store.close()


@pytest.mark.parametrize('different_answers', [False, True])
def test_real_http_ws_simultaneous_answers_local_assets_and_replay(tmp_path, different_answers):
    now = [1000.0]
    app = create_app(database=str(tmp_path / 'rush.db'), catalog=[], clock=lambda: now[0], origins=['http://testserver'])
    with TestClient(app) as client:
        assert 'pokerush' in client.get('/health').json()['features']
        host = client.post('/api/rooms', headers=ORIGIN, json={'name': 'Ana', 'game': 'pokerush'}).json()
        guest = client.post(f'/api/rooms/{host["code"]}/join', headers=ORIGIN, json={'name': 'Bia'}).json()
        assert client.get('/assets/pokerush/catalog.json').status_code == 200
        assert client.get('/assets/pokerush/1.png').content.startswith(b'\x89PNG')
        url = f'/ws/{host["code"]}'
        with client.websocket_connect(url, headers=ORIGIN) as a, client.websocket_connect(url, headers=ORIGIN) as b:
            for socket, identity in ((a, host), (b, guest)):
                socket.send_json({'token': identity['token']})
                assert receive_type(socket, 'state')['game'] == 'pokerush'
            a.send_json(dict(id=uuid.uuid4().hex, action='start'))
            assert receive_type(a, 'ack')['ok']
            room = app.state.engine.room(host['code'])
            round_id = room['round_id']
            room['pokerush']['types'] = ['fire']
            answers = ['Charmander', 'Charmeleon' if different_answers else 'Charmander']
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(socket.send_json, dict(id=uuid.uuid4().hex, action='answer', round_id=round_id,
                           answer=answer)) for socket, answer in zip((a, b), answers)]
                for future in futures:
                    future.result()
            replies = [receive_type(socket, 'ack') for socket in (a, b)]
            assert sum(reply.get('correct', False) for reply in replies) == 1
            assert sum(reply.get('ignored', False) for reply in replies) == 1
            assert sum(p['score'] for p in room['people'].values()) == 50
            assert len(room['pokerush']['used']) == 1
            assert all(p['cooldown'] == 0 for p in room['people'].values())
            payload = json.dumps(app.state.engine.snapshot(host['code'], host['participant']))
            assert 'token' not in payload and 'last_wrong_answer' not in payload
