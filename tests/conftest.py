import pytest

from fun.engine import Engine
from fun.store import Store
from tests.fixtures import synthetic_catalog


@pytest.fixture
def catalog():
    # Conteúdo artificial exclusivamente de teste: 8 partidas possíveis por célula.
    return synthetic_catalog()


@pytest.fixture
def game(catalog):
    now = [10000.0]
    store = Store(':memory:')
    engine = Engine(store, catalog, lambda: now[0])
    a = engine.create('Ana')
    b = engine.join(a['code'], 'Bia')
    engine.connect(a['code'], a['token'], 'a')
    engine.connect(b['code'], b['token'], 'b')
    yield engine, now, a, b
    store.close()
