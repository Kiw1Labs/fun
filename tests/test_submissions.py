import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json

from PIL import Image
import pytest
from starlette.testclient import TestClient

from fun.app import create_app
from fun.catalog import CATEGORIES
from fun.store import Store
from fun.submissions import MAX_BODY, inspect_image

ORIGIN = {'Origin': 'http://testserver'}
AUTH = ('reviewer-test', 'reviewer-test-password')


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv('FUN_ADMIN_USERNAME', AUTH[0])
    monkeypatch.setenv('FUN_ADMIN_PASSWORD', AUTH[1])
    monkeypatch.setenv('FUN_MEDIA', str(tmp_path / 'media'))
    monkeypatch.setenv('FUN_ADMIN_USERS_FILE', str(tmp_path / 'admins.json'))
    return tmp_path / 'fun.db'


def payload(**changes):
    return dict(request_id='submission-request-123456', nickname='', prompt='Quem disse esta frase?',
                reference='Referência artificial\nSegunda linha', answer='Resposta artificial',
                category='Cultura e nostalgia', image=None) | changes


def image_bytes(kind='PNG'):
    output = BytesIO()
    Image.new('RGB', (48, 32), '#808080').save(output, format=kind)
    return output.getvalue()


def test_page_is_unlisted_public_and_categories_need_no_identity(setup):
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        page = client.get('/nova-questao')
        assert page.status_code == 200 and 'Nickname (opcional)' in page.text
        assert page.headers['x-robots-tag'] == 'noindex, nofollow'
        assert 'blob:' in page.headers['content-security-policy']
        assert '/nova-questao' not in client.get('/').text
        assert '/nova-questao' not in client.get('/godmode').text
        for name in ['nova-questao.js', 'nova-questao.css', 'godmode.css']:
            assert client.get('/contribution-assets/' + name).status_code == 200
        assert client.get('/api/question-submissions/categories').json()['categories'] == list(CATEGORIES)
        assert client.get('/api/godmode/submissions').status_code == 401


def test_anonymous_submission_stays_separate_private_and_retry_is_idempotent(setup, catalog):
    app = create_app(database=str(setup), catalog=catalog, origins=['http://testserver'])
    with TestClient(app) as client:
        response = client.post('/api/question-submissions', headers=ORIGIN, json=payload())
        assert response.status_code == 201 and response.json()['received'] is True
        assert response.headers['cache-control'] == 'no-store'
        identifier = response.json()['id']
        assert client.post('/api/question-submissions', headers=ORIGIN, json=payload()).json()['id'] == identifier
        assert client.post('/api/question-submissions', headers=ORIGIN, json=payload(answer='Outra resposta')).status_code == 409
        assert len(app.state.engine.catalog) == len(catalog)
        assert len(client.get('/api/godmode/questions', auth=AUTH).json()['questions']) == len(catalog)
        listing = client.get('/api/godmode/submissions', auth=AUTH).json()
        assert listing['total'] == 1
        submission = listing['submissions'][0]
        assert submission['nickname'] == '' and submission['reference'] == payload()['reference']
        assert submission['tag'] == 'Contribuição' and submission['status'] == 'pending'
        assert not {'request_id', 'fingerprint', 'image_bytes'} & submission.keys()
        assert client.get('/api/question-submissions').status_code == 404
        assert client.get('/api/question-submissions/' + identifier).status_code == 404
    store = Store(str(setup))
    assert store.submissions()[0] == 1 and not store.catalog()
    store.close()


def test_approval_is_authenticated_origin_checked_durable_and_keeps_legacy_catalog(setup, catalog):
    app = create_app(database=str(setup), catalog=catalog, origins=['http://testserver'])
    with TestClient(app) as client:
        identifier = client.post('/api/question-submissions', headers=ORIGIN, json=payload(nickname='<b>Kiwi</b>')).json()['id']
        review = f'/api/godmode/submissions/{identifier}/review'
        decision = dict(action='approve', difficulty='medium', rights='Conteúdo artificial próprio para teste.')
        assert client.post(review, headers=ORIGIN, json=decision).status_code == 401
        assert client.post(review, auth=AUTH, json=decision).status_code == 403
        assert client.post(review, auth=AUTH, headers=ORIGIN, json={'action': 'approve'}).status_code == 400
        assert client.post(review, auth=AUTH, headers=ORIGIN, json=decision | {'rights': ''}).status_code == 400
        response = client.post(review, auth=AUTH, headers=ORIGIN, json=decision)
        assert response.status_code == 200
        question_id = response.json()['question_id']
        repeated = client.post(review, auth=AUTH, headers=ORIGIN, json=decision)
        assert repeated.json() == response.json()
        assert client.post(review, auth=AUTH, headers=ORIGIN, json={'action': 'reject'}).status_code == 409
        assert client.get('/api/godmode/submissions', auth=AUTH).json()['total'] == 0
        assert len(app.state.engine.catalog) == len(catalog) + 1
        approved = next(question for question in app.state.engine.catalog if question.id == question_id)
        public = approved.public()
        assert public['reference'] == payload()['reference']
        assert not {'answer', 'aliases', 'submitted_by', 'submission_id'} & public.keys()
        listed = next(question for question in client.get('/api/godmode/questions', auth=AUTH).json()['questions'] if question['id'] == question_id)
        assert listed['submission_id'] == identifier and listed['submitted_by'] == '<b>Kiwi</b>'
    with TestClient(create_app(database=str(setup), origins=['http://testserver'])) as restarted:
        assert restarted.get('/health').json()['catalog_count'] == len(catalog) + 1
        approved = next(question for question in restarted.app.state.engine.catalog if question.id == question_id)
        assert approved.difficulty == 'medium' and approved.reference == payload()['reference']


def test_photo_is_private_until_approval_and_rejection_never_publishes(setup, tmp_path):
    data = image_bytes()
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        identifier = client.post('/api/question-submissions', headers=ORIGIN,
                                 json=payload(image=base64.b64encode(data).decode())).json()['id']
        image_path = f'/api/godmode/submissions/{identifier}/image'
        assert client.get(image_path).status_code == 401
        response = client.get(image_path, auth=AUTH)
        assert response.content == data and response.headers['content-type'] == 'image/png'
        assert response.headers['cache-control'] == 'no-store'
        assert not list((tmp_path / 'media').rglob('*'))
        decision = dict(action='approve', difficulty='easy', rights='Imagem artificial de autoria do teste.')
        assert client.post(f'/api/godmode/submissions/{identifier}/review', auth=AUTH, headers=ORIGIN, json=decision).status_code == 200
        approved = client.get('/api/godmode/questions', auth=AUTH).json()['questions'][0]
        assert approved['image'].startswith('/media/community/')
        assert client.get(approved['image']).content == data
        assert client.get(image_path, auth=AUTH).status_code == 404
        second = client.post('/api/question-submissions', headers=ORIGIN,
                             json=payload(request_id='another-request-123456', image=base64.b64encode(data).decode())).json()['id']
        assert client.post(f'/api/godmode/submissions/{second}/review', headers=ORIGIN, auth=AUTH, json={'action':'reject'}).status_code == 200
        assert client.get('/health').json()['catalog_count'] == 1
        assert client.get(f'/api/godmode/submissions/{second}/image', auth=AUTH).status_code == 404
    store = Store(str(setup))
    assert store.submission(second)['state'] == 'rejected'
    assert store.submission(second)['image_bytes'] is None
    store.close()


@pytest.mark.parametrize('change', [dict(prompt='  '), dict(answer='...'), dict(category='Outra'),
    dict(nickname='n' * 25), dict(reference='x' * 2001), dict(status='active'),
    dict(image=base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>').decode()),
    dict(image='%%%'), dict(image=base64.b64encode(b'x' * (512 * 1024 + 1)).decode()), dict(request_id='../outside')])
def test_invalid_submissions_never_reach_the_catalog(setup, change):
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        assert client.post('/api/question-submissions', headers=ORIGIN, json=payload(**change)).status_code == 400
        assert client.get('/api/godmode/submissions', auth=AUTH).json()['total'] == 0
        assert client.get('/health').json()['catalog_count'] == 0


@pytest.mark.parametrize('kind', ['PNG', 'JPEG', 'WEBP'])
def test_raster_formats_are_detected_by_content(kind):
    media_type, extension = inspect_image(image_bytes(kind))
    assert media_type == {'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[kind]
    assert extension in ('png','jpg','webp')


def test_request_limits_json_origin_pagination_and_pending_capacity(setup):
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        assert client.post('/api/question-submissions', json=payload()).status_code == 403
        assert client.post('/api/question-submissions', headers=ORIGIN, content='not-json').status_code == 415
        assert client.post('/api/question-submissions', headers=ORIGIN | {'Content-Type':'application/json'}, content='x' * (MAX_BODY + 1)).status_code == 413
        assert client.get('/api/godmode/submissions?page=-1', auth=AUTH).status_code == 400
        for index in range(4):
            assert client.post('/api/question-submissions', headers=ORIGIN, json=payload(request_id=f'rate-request-123456-{index}')).status_code == 201
        assert client.post('/api/question-submissions', headers=ORIGIN, json=payload()).status_code == 429
    store = Store(str(setup))
    with store.db:
        for index in range(500):
            store.db.execute("INSERT INTO question_submissions VALUES (?,?,?,'pending',?,NULL,1,NULL,NULL)",
                             (f'capacity-{index}', f'capacity-request-{index}', str(index), json.dumps(payload())))
    store.close()
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        assert client.post('/api/question-submissions', headers=ORIGIN, json=payload()).status_code == 503
        listing = client.get('/api/godmode/submissions?page=2', auth=AUTH).json()
        assert listing['total'] == 504 and len(listing['submissions']) == 20


def test_concurrent_approvals_insert_once(setup):
    with TestClient(create_app(database=str(setup), catalog=[], origins=['http://testserver'])) as client:
        identifier = client.post('/api/question-submissions', headers=ORIGIN, json=payload()).json()['id']
        def approve(_):
            return client.post(f'/api/godmode/submissions/{identifier}/review', auth=AUTH, headers=ORIGIN,
                               json=dict(action='approve', difficulty='easy', rights='Autoria artificial do teste.'))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(approve, range(2)))
        assert all(response.status_code == 200 for response in responses)
        assert responses[0].json() == responses[1].json()
        assert client.get('/health').json()['catalog_count'] == 1
