from collections import Counter
from dataclasses import replace
from pathlib import Path
import random
import sqlite3

from PIL import Image
import pytest
from starlette.testclient import TestClient

from fun.app import create_app
from fun.catalog import load, normalize, select
from fun.engine import Engine
from fun.store import Store
from tools.import_catalog import import_database

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/questions/catalog.json'


def test_real_catalog_media_rights_sets_and_no_answer_in_names():
    catalog = load(SOURCE)
    assert len(catalog) == 90
    assert len({normalize(c.answer) for c in catalog}) == 90
    assert len({c.category for c in catalog}) == 6
    assert set(Counter(c.category for c in catalog).values()) == {15}
    assert Counter(c.kind for c in catalog) == {'image': 48, 'text': 42}
    assert Counter(c.difficulty for c in catalog) == {'easy': 42, 'medium': 30, 'hard': 18}
    for c in catalog:
        assert c.source_url.startswith('https://') and c.verification_note and c.attribution
        assert c.category and c.subcategory and c.license and c.verified_at
        if c.kind == 'image':
            assert c.author and c.media_source_url and c.license_url
            image_path = ROOT / c.image.removeprefix('/')
            assert normalize(c.answer) not in normalize(image_path.name)
            with Image.open(image_path) as image:
                image.load()
                assert image.format == 'WEBP' and max(image.size) <= 800
                assert not image.getexif()
            assert image_path.stat().st_size < 300_000
    expected = {('image','easy'):4,('image','medium'):3,('image','hard'):1,
                ('text','easy'):3,('text','medium'):2,('text','hard'):2}
    for group in {c.set_id for c in catalog}:
        assert Counter((c.kind,c.difficulty) for c in catalog if c.set_id == group) == expected


def test_four_matches_available_across_random_choices():
    catalog = load(SOURCE)
    for seed in range(100):
        random.seed(seed)
        history = []
        for _ in range(8):
            excluded = set().union(*history[-3:]) if history else set()
            deck = select(catalog, excluded)
            ids = {c.id for c in deck}
            assert len(ids) == 15 and not ids & excluded
            assert Counter(c.difficulty for c in deck) == {'easy': 7,'medium':5,'hard':3}
            assert [c.kind for c in deck] == ['image' if i % 2 == 0 else 'text' for i in range(15)]
            history.append(ids)


def test_idempotent_import_preserves_existing_rooms_and_deactivation(tmp_path):
    database = tmp_path / 'fun.sqlite3'
    db = sqlite3.connect(database)
    db.execute('CREATE TABLE rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL)')
    db.execute('INSERT INTO rooms VALUES (?,?)', ('ABCD','{"user_data":"preserve exactly"}'))
    db.commit()
    db.close()
    first = import_database(SOURCE,database,ROOT/'media',tmp_path/'media')
    second = import_database(SOURCE,database,ROOT/'media',tmp_path/'media')
    assert first['inserted'] == 90 and first['images_verified'] == 48
    assert second == {**first,'inserted':0,'unchanged':90}
    store = Store(str(database))
    assert store.db.execute('SELECT data FROM rooms WHERE code=?',('ABCD',)).fetchone()[0] == '{"user_data":"preserve exactly"}'
    assert store.db.execute('SELECT count(*) FROM schema_migrations').fetchone()[0] == 1
    old = store.catalog()[0]
    store.import_catalog([replace(old,status='inactive')])
    assert len(store.catalog()) == 89
    store.import_catalog([old])
    assert len(store.catalog()) == 90
    store.close()


def test_missing_media_aborts_import_without_touching_rooms(tmp_path):
    database = tmp_path / 'not-created.sqlite3'
    with pytest.raises(ValueError,match='mídia local inexistente'):
        import_database(SOURCE,database,tmp_path/'missing',tmp_path/'media')
    assert not database.exists()


def test_four_complete_matches_real_answers_scoring_privacy_and_history(tmp_path):
    store = Store(str(tmp_path/'simulation.sqlite3'))
    store.import_catalog(load(SOURCE))
    now = [10_000.0]
    engine = Engine(store,store.catalog(),lambda:now[0])
    a=engine.create('Validação A')
    b=engine.join(a['code'],'Validação B')
    engine.connect(a['code'],a['token'],'a')
    engine.connect(b['code'],b['token'],'b')
    history=[]
    serial=0
    def action(person,verb,**kwargs):
        nonlocal serial
        serial+=1
        return engine.action(a['code'],person['participant'],{'id':f'catalog-event-{serial}','action':verb,**kwargs})
    for _ in range(4):
        assert action(a,'start')['ok']
        room=engine.rooms[a['code']]
        deck=room['deck']
        ids={c['id'] for c in deck}
        assert not ids & (set().union(*history[-3:]) if history else set())
        assert Counter(c['kind'] for c in deck)=={'image':8,'text':7}
        assert Counter(c['difficulty'] for c in deck)=={'easy':7,'medium':5,'hard':3}
        history.append(ids)
        for index,c in enumerate(deck):
            assert room['index']==index and room['phase']=='question'
            view=engine.snapshot(a['code'],a['participant'])['challenge']
            assert set(view)=={'id','kind','prompt','image'}
            assert 'aliases' not in view and 'credits' not in view and 'source_url' not in view
            now[0]+=1
            wrong=action(a,'answer',answer='Resposta deliberadamente errada',round_id=room['round_id'])
            assert wrong['ok'] and not wrong['correct']
            early=action(a,'answer',answer=c['answer'],round_id=room['round_id'])
            assert not early['ok']
            now[0]+=.5
            variant=c['aliases'][0] if c['aliases'] else c['answer'].upper()
            for person in [a,b]:
                reply=action(person,'answer',answer=variant,round_id=room['round_id'])
                assert reply['ok'] and reply['correct'] and reply['points']==193
            revealed=engine.snapshot(a['code'],a['participant'])['challenge']
            assert revealed['answer']==c['answer'] and revealed['credits']['source_url']==c['source_url']
            assert 'aliases' not in revealed
            now[0]+=4.01
            engine.tick()
        assert room['phase']=='results'
        assert {p['score'] for p in room['people'].values()}=={2895}
    assert len(set().union(*history))==60
    store.close()


def test_runtime_loads_persistent_catalog_and_blocks_private_paths(tmp_path,monkeypatch):
    database=tmp_path/'runtime.sqlite3'
    import_database(SOURCE,database,ROOT/'media',tmp_path/'media')
    monkeypatch.setenv('FUN_MEDIA',str(tmp_path/'media'))
    with TestClient(create_app(database=str(database),static_dir=ROOT/'dist')) as client:
        assert len(client.app.state.engine.catalog)==90
        for path in ['/content/questions/catalog.json','/api/questions','/data/fun.sqlite3','/.env']:
            assert client.get(path).status_code==404
        for c in client.app.state.engine.catalog:
            if c.image:
                response=client.get(c.image)
                assert response.status_code==200 and response.headers['content-type'].startswith('image/webp')
                assert len(response.content)<300_000
