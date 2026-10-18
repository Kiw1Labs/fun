"""Mede o próprio motor com 16 pessoas sintéticas; não usa banco de produção."""
import json
import statistics
import time
import tracemalloc

from fun.engine import Engine
from fun.store import Store
from tests.fixtures import synthetic_catalog

tracemalloc.start()
store = Store(':memory:')
engine = Engine(store, synthetic_catalog())
people = [engine.create('Pessoa 0')]
code = people[0]['code']
for i in range(1, 16):
    people.append(engine.join(code, f'Pessoa {i}'))
for i, person in enumerate(people):
    engine.connect(code, person['token'], str(i))
host = people[0]['participant']
engine.action(code, host, {'id': 'measure-start', 'action': 'start'})
r = engine.rooms[code]
samples = []
for i in range(100):
    before = time.perf_counter()
    engine.tick()
    for person in people:
        engine.snapshot(code, person['participant'])
    samples.append((time.perf_counter() - before) * 1000)
current, peak = tracemalloc.get_traced_memory()
print(json.dumps({'participants': 16, 'samples': len(samples), 'tick_plus_16_snapshots_median_ms': round(statistics.median(samples), 3), 'p95_ms': round(sorted(samples)[94], 3), 'python_traced_peak_mib': round(peak/1024/1024, 3)}, indent=2))
store.close()
