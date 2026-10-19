from collections import Counter

import pytest

from fun.catalog import normalize, select, validate
from fun.engine import Engine, RuleError, points
from fun.store import Store


def act(engine, identity, action, **kw):
    import secrets
    return engine.action(identity['code'], identity['participant'], dict(id=secrets.token_hex(8), action=action, **kw))


def start(game):
    engine, now, a, b = game
    assert act(engine, a, 'start')['ok']
    return engine, now, a, b, engine.rooms[a['code']]


@pytest.mark.parametrize('elapsed,expected', [(0, 200), (.1, 200), (.3, 199), (1.1, 195), (19.999, 100), (20, 0), (30, 0), (-1, 200)])
def test_points_half_up_and_deadline(elapsed, expected):
    assert points(elapsed) == expected


def test_normalization_and_no_fuzzy():
    assert normalize('  AÇÃO! —  está, AQUI... ') == normalize('acao esta aqui')
    assert normalize('acao') != normalize('acoa')


def test_exact_composition_and_history(catalog):
    history = []
    for _ in range(5):
        deck = select(catalog, set().union(*map(set, history[-3:])) if history else set())
        ids = {c.id for c in deck}
        assert len(ids) == 15
        assert Counter(c.kind for c in deck) == {'image': 8, 'text': 7}
        assert Counter(c.difficulty for c in deck) == {'easy': 7, 'medium': 5, 'hard': 3}
        assert all(c.kind == ('image' if i % 2 == 0 else 'text') for i, c in enumerate(deck))
        assert not any(ids & old for old in history[-3:])
        history.append(ids)


def test_selector_handles_non_greedy_composition(catalog):
    special = [c for c in catalog if (c.kind, c.difficulty) in [('image', 'easy'), ('image', 'hard'), ('text', 'medium'), ('text', 'hard')]]
    assert len(select(special, set())) == 15
    with pytest.raises(ValueError):
        select([c for c in catalog if c.kind == 'image'], set())


def test_empty_catalog_and_minimum(game):
    engine, now, a, b = game
    engine.catalog = []
    assert 'Catálogo insuficiente' in act(engine, a, 'start')['error']
    engine.disconnect(b['code'], b['participant'], 'b')
    assert 'dois' in act(engine, a, 'start')['error']


def test_privacy_alias_cooldown_duplicate(game):
    engine, now, a, b, r = start(game)
    view = engine.snapshot(a['code'], a['participant'])
    assert set(view['challenge']) == {'id', 'kind', 'prompt', 'image'}
    assert 'token' not in str(view) and 'aliases' not in str(view)
    round_id = r['round_id']
    assert not act(engine, a, 'answer', round_id=round_id, answer='errado')['correct']
    now[0] += .499
    assert not act(engine, a, 'answer', round_id=round_id, answer=r['deck'][0]['answer'])['ok']
    now[0] += .001
    event = dict(id='duplicate-123', action='answer', round_id=round_id, answer=r['deck'][0]['aliases'][0].upper())
    first = engine.action(a['code'], a['participant'], event)
    assert first['correct'] and first['points'] == 198
    assert engine.action(a['code'], a['participant'], event) == first
    assert r['people'][a['participant']]['score'] == 198
    with pytest.raises(RuleError):
        engine.action(a['code'], a['participant'], event | {'answer': 'different'})
    assert not act(engine, a, 'answer', round_id=round_id, answer=event['answer'])['ok']
    assert act(engine, b, 'answer', round_id=round_id, answer=r['deck'][0]['answer'])['correct']
    assert r['phase'] == 'reveal'
    assert engine.snapshot(a['code'], a['participant'])['challenge']['answer'] == r['deck'][0]['answer']


def test_exact_deadline_and_stale_events(game):
    engine, now, a, b, r = start(game)
    old = r['round_id']
    now[0] += 20
    assert not act(engine, a, 'answer', round_id=old, answer=r['deck'][0]['answer'])['ok']
    assert r['people'][a['participant']]['score'] == 0
    now[0] += 4
    engine.tick()
    assert r['index'] == 1
    assert not act(engine, a, 'answer', round_id=old, answer=r['deck'][1]['answer'])['ok']


def test_all_15_results_manual_lobby_score_reset_history(game):
    engine, now, a, b, r = start(game)
    for i in range(15):
        assert r['index'] == i
        for who in (a, b):
            assert act(engine, who, 'answer', round_id=r['round_id'], answer=r['deck'][i]['answer'])['correct']
        now[0] += 4
        engine.tick()
    assert r['phase'] == 'results' and r['result'] == 'completed'
    assert {p['rank'] for p in engine.snapshot(a['code'], a['participant'])['people']} == {1}
    now[0] += 20
    engine.tick()
    assert r['phase'] == 'results'
    assert not act(engine, b, 'lobby')['ok']
    assert act(engine, a, 'lobby')['ok']
    old = set(r['history'][0])
    assert act(engine, a, 'start')['ok']
    assert not old & {x['id'] for x in r['deck']}
    assert all(p['score'] == 0 for p in r['people'].values())


def test_spectator_capacity_and_promote(game):
    engine, now, a, b, r = start(game)
    c = engine.join(a['code'], 'Caio')
    engine.connect(c['code'], c['token'], 'c')
    assert next(p for p in engine.snapshot(c['code'], c['participant'])['people'] if p['id'] == c['participant'])['spectator']
    assert not act(engine, c, 'answer', round_id=r['round_id'], answer=r['deck'][0]['answer'])['ok']
    for i in range(13):
        engine.join(a['code'], f'Pessoa {i}')
    with pytest.raises(RuleError, match='cheia'):
        engine.join(a['code'], 'Extra')
    engine.finish(r, 'completed', None, now[0])
    assert act(engine, a, 'start')['ok']
    assert c['participant'] in r['roster']


def test_multitab_disconnect_f5_and_immediate_cancel_with_spectator(game):
    engine, now, a, b, r = start(game)
    c = engine.join(a['code'], 'Espectador')
    engine.connect(c['code'], c['token'], 'c')
    engine.connect(a['code'], a['token'], 'a2')
    engine.disconnect(a['code'], a['participant'], 'a')
    assert engine.online(a['code'], a['participant'])
    engine.disconnect(a['code'], a['participant'], 'a2')
    now[0] += 59
    engine.tick()
    assert r['people'][a['participant']]['active']
    engine.connect(a['code'], a['token'], 'refresh')
    assert r['host'] == a['participant']
    engine.disconnect(a['code'], a['participant'], 'refresh')
    engine.disconnect(b['code'], b['participant'], 'b')
    assert r['phase'] == 'results' and r['result'] == 'cancelled' and r['winner'] is None
    assert engine.online(c['code'], c['participant'])


def test_host_grace_and_abandonment_automatic_win(game):
    engine, now, a, b, r = start(game)
    engine.disconnect(a['code'], a['participant'], 'a')
    now[0] += 59.999
    engine.tick()
    assert r['host'] == a['participant']
    now[0] += .001
    engine.tick()
    assert r['host'] == b['participant']
    assert r['result'] == 'automatic' and r['winner'] == b['participant']
    departed = next(p for p in engine.snapshot(b['code'], b['participant'])['people'] if p['id'] == a['participant'])
    assert not departed['active'] and departed['rank'] is None
    with pytest.raises(RuleError):
        engine.connect(a['code'], a['token'], 'late')


def test_departed_players_remain_in_results_but_are_removed_in_lobby(game):
    engine, now, a, b = game
    engine.rooms[a['code']]['people'][b['participant']]['name'] = 'Celular'
    engine, now, a, b, r = start(game)
    engine.disconnect(b['code'], b['participant'], 'b')
    now[0] += 60
    engine.tick()
    assert r['phase'] == 'results' and r['result'] == 'automatic'
    assert not r['people'][b['participant']]['active']

    returned = engine.join(a['code'], 'Celular')
    engine.connect(returned['code'], returned['token'], 'phone-new')
    rows = [p for p in engine.snapshot(a['code'], a['participant'])['people'] if p['name'] == 'Celular']
    assert {p['id'] for p in rows} == {b['participant'], returned['participant']}

    assert act(engine, a, 'lobby')['ok']
    assert b['participant'] not in r['people']
    assert b['participant'] not in r['roster']
    assert returned['participant'] in r['people']
    rows = [p for p in engine.snapshot(a['code'], a['participant'])['people'] if p['name'] == 'Celular']
    assert [p['id'] for p in rows] == [returned['participant']]


def test_voluntary_host_transfer_oldest_online_and_kick(game):
    engine, now, a, b, r = start(game)
    c = engine.join(a['code'], 'Caio')
    engine.connect(c['code'], c['token'], 'c')
    assert not act(engine, b, 'kick', target=a['participant'])['ok']
    assert act(engine, a, 'leave')['ok']
    assert r['host'] == b['participant'] and r['winner'] == b['participant']
    assert act(engine, b, 'kick', target=c['participant'])['ok']
    with pytest.raises(RuleError):
        engine.auth(c['code'], c['token'])


def test_kick_during_match_inclusive_ranking(game):
    engine, now, a, b, r = start(game)
    act(engine, b, 'answer', round_id=r['round_id'], answer=r['deck'][0]['answer'])
    score = r['people'][b['participant']]['score']
    assert act(engine, a, 'kick', target=b['participant'])['ok']
    assert r['winner'] == a['participant']
    row = next(p for p in engine.snapshot(a['code'], a['participant'])['people'] if p['id'] == b['participant'])
    assert row['score'] == score and row['rank'] is None and not row['active']


def test_presence_30_plus_2_and_empty_5(game):
    engine, now, a, b = game
    r = engine.rooms[a['code']]
    now[0] += 1800
    engine.tick()
    assert r['warning'] == now[0] + 120
    assert act(engine, b, 'presence')['ok']
    assert r['warning'] is None
    now[0] += 1800
    engine.tick()
    now[0] += 120
    engine.tick()
    assert r['phase'] == 'closed'


def test_empty_expiry(game):
    engine, now, a, b = game
    r = engine.rooms[a['code']]
    engine.disconnect(a['code'], a['participant'], 'a')
    engine.disconnect(b['code'], b['participant'], 'b')
    now[0] += 299.99
    engine.tick()
    assert r['phase'] == 'lobby'
    now[0] += .01
    engine.tick()
    assert r['phase'] == 'closed'


@pytest.mark.parametrize('phase', ['lobby', 'question', 'reveal', 'results'])
def test_close_any_phase(game, phase):
    engine, now, a, b, r = start(game)
    r['phase'] = phase
    if phase == 'reveal':
        engine.reveal(r, now[0])
    assert not act(engine, b, 'close')['ok']
    assert act(engine, a, 'close')['ok']
    assert r['phase'] == 'closed' and r['winner'] is None and r['result'] == 'cancelled'


def test_restart_recovers_identity_scores_and_history(tmp_path, catalog):
    path = str(tmp_path / 'fun.sqlite3')
    store = Store(path)
    engine = Engine(store, catalog, lambda: 10000)
    a = engine.create('Ana')
    b = engine.join(a['code'], 'Bia')
    engine.connect(a['code'], a['token'], 'a')
    engine.connect(b['code'], b['token'], 'b')
    act(engine, a, 'start')
    r = engine.rooms[a['code']]
    act(engine, a, 'answer', round_id=r['round_id'], answer=r['deck'][0]['answer'])
    store.close()
    store = Store(path)
    restored = Engine(store, catalog, lambda: 10001)
    restored.connect(a['code'], a['token'], 'new')
    snapshot = restored.snapshot(a['code'], a['participant'])
    assert snapshot['result'] == 'cancelled'
    assert snapshot['people'][0]['score'] == 200
    assert len(restored.rooms[a['code']]['history']) == 1
    assert a['token'] not in str(store.all())
    store.close()


def test_catalog_validation(catalog):
    from dataclasses import asdict
    row = asdict(catalog[0])
    for changes in ({'image': 'https://evil/image.jpg'}, {'image': '/media/../private.png'}, {'aliases': 'foo'}, {'rights': ''}, {'answer': '!!!'}):
        with pytest.raises(ValueError):
            validate([row | changes])
    with pytest.raises(ValueError):
        validate([row, row])


def test_malicious_actions(game):
    engine, now, a, b, r = start(game)
    for event in [None, [], {'id': 'bad', 'action': 'start'}, {'id': 'valid-id1', 'action': 'answer', 'score': 99999}]:
        with pytest.raises(RuleError):
            engine.action(a['code'], a['participant'], event)
    assert r['people'][a['participant']]['score'] == 0


def test_public_directory_capacity_offline_and_legacy_recovery(tmp_path):
    path = str(tmp_path / 'directory.sqlite3')
    store = Store(path)
    engine = Engine(store, [], lambda: 10000)
    a = engine.create('Ana', 'Turma da noite', 'public')
    engine.connect(a['code'], a['token'], 'a')
    for i in range(15):
        engine.join(a['code'], f'Pessoa {i}')
    assert engine.public_rooms()[0]['people'] == 16
    with pytest.raises(RuleError, match='cheia'):
        engine.join(a['code'], 'Extra')
    engine.disconnect(a['code'], a['participant'], 'a')
    assert engine.public_rooms() == []
    store.close()
    store = Store(path)
    restored = Engine(store, [], lambda: 10001)
    restored.connect(a['code'], a['token'], 'new')
    assert restored.public_rooms()[0]['room_name'] == 'Turma da noite'
    legacy = restored.rooms[a['code']]
    del legacy['visibility']
    del legacy['room_name']
    restored.save(legacy)
    store.close()
    store = Store(path)
    restored = Engine(store, [], lambda: 10002)
    restored.connect(a['code'], a['token'], 'legacy')
    assert restored.snapshot(a['code'], a['participant'])['visibility'] == 'private'
    assert restored.public_rooms() == []
    store.close()
