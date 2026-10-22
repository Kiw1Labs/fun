"""Lobby sem jogo: escolha autoritativa, sessões preservadas e limites dos jogos."""
import pytest

from fun.engine import Engine, RuleError
from fun.store import Store
from tests.test_engine import act


@pytest.fixture
def lobby(catalog):
    now = [10000.0]
    store = Store(':memory:')
    engine = Engine(store, catalog, lambda: now[0])
    host = engine.create('Ana', visibility='public', game=None)
    guest = engine.join(host['code'], 'Bia')
    for identity in (host, guest):
        engine.connect(identity['code'], identity['token'], identity['participant'])
    yield engine, now, host, guest
    store.close()


def test_unassigned_lobby_is_persisted_and_cannot_start(lobby):
    engine, now, host, guest = lobby
    state = engine.snapshot(host['code'], host['participant'])
    assert state['game'] is None and state['phase'] == 'lobby'
    assert state['room_name'] == 'Sala do Ana'
    assert not state['catalog_available'] and state['challenge'] is None
    assert len(state['people']) == 2
    assert engine.public_rooms()[0]['game'] is None
    assert 'Escolha um jogo' in act(engine, host, 'start')['error']
    restored = Engine(engine.store, engine.catalog, lambda: now[0])
    restored.connect(host['code'], host['token'], 'resumed')
    assert restored.snapshot(host['code'], host['participant'])['game'] is None
    assert len(restored.members(restored.room(host['code']))) == 2


@pytest.mark.parametrize('game', ['sabe-essa', 'batata-quente'])
def test_host_selects_game_without_replacing_room_or_sessions(lobby, game):
    engine, _, host, guest = lobby
    assert not act(engine, guest, 'select_game', game=game)['ok']
    assert act(engine, host, 'select_game', game=game)['ok']
    for identity in (host, guest):
        room, player = engine.auth(identity['code'], identity['token'])
        assert player['id'] == identity['participant']
        assert room['game'] == game and room['phase'] == 'lobby'
        assert room['host'] == host['participant']
        assert engine.snapshot(identity['code'], identity['participant'])['game'] == game
    assert act(engine, host, 'start')['ok']
    assert engine.room(host['code'])['phase'] == ('playing' if game == 'batata-quente' else 'question')
    assert not act(engine, host, 'select_game', game='sabe-essa')['ok']


@pytest.mark.parametrize('game', [None, '', 'unknown', [], {}, 123])
def test_invalid_choice_leaves_lobby_unchanged(lobby, game):
    engine, _, host, _ = lobby
    assert not act(engine, host, 'select_game', game=game)['ok']
    assert engine.room(host['code'])['game'] is None


def test_choice_is_idempotent_and_first_game_wins(lobby):
    engine, _, host, _ = lobby
    event = dict(id='choose-once-only', action='select_game', game='sabe-essa')
    first = engine.action(host['code'], host['participant'], event)
    assert first['ok']
    assert engine.action(host['code'], host['participant'], event) == first
    assert not act(engine, host, 'select_game', game='batata-quente')['ok']
    assert engine.room(host['code'])['game'] == 'sabe-essa'


def test_potato_capacity_preserves_everyone_and_reserved_slots(lobby):
    engine, _, host, _ = lobby
    extra = [engine.join(host['code'], f'Pessoa {i}') for i in range(7)]
    assert '8 pessoas' in act(engine, host, 'select_game', game='batata-quente')['error']
    assert engine.room(host['code'])['game'] is None
    assert len(engine.members(engine.room(host['code']))) == 9
    assert act(engine, host, 'kick', target=extra[-1]['participant'])['ok']
    assert act(engine, host, 'select_game', game='batata-quente')['ok']
    with pytest.raises(RuleError, match='8 pessoas'):
        engine.join(host['code'], 'Sem vaga')


def test_neutral_lobby_limit_and_host_transfer(lobby):
    engine, _, host, guest = lobby
    for i in range(14):
        engine.join(host['code'], f'Pessoa {i}')
    with pytest.raises(RuleError, match='16 pessoas'):
        engine.join(host['code'], 'Sem vaga')
    assert act(engine, host, 'leave')['ok']
    assert engine.room(host['code'])['host'] == guest['participant']
    assert act(engine, guest, 'select_game', game='sabe-essa')['ok']


def test_unassigned_lobby_uses_existing_inactivity_and_close(lobby):
    engine, now, host, _ = lobby
    now[0] += 1800
    engine.tick()
    assert engine.snapshot(host['code'], host['participant'])['warning'] == now[0] + 120
    assert act(engine, host, 'presence')['ok']
    assert engine.room(host['code'])['warning'] is None
    assert act(engine, host, 'close')['ok']
    assert engine.snapshot(host['code'], host['participant'])['phase'] == 'closed'
