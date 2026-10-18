"""Ensaio local HTTP/WS real com 15 competidores e um espectador sintéticos."""
import asyncio
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from websockets.asyncio.client import connect


async def until(socket, kind, predicate=lambda m: True):
    for _ in range(150):
        message = json.loads(await asyncio.wait_for(socket.recv(), 5))
        if message.get('type') == kind and predicate(message):
            return message
    raise AssertionError('Mensagem não recebida')


async def check(directory):
    origin = 'http://127.0.0.1:15052'
    async with httpx.AsyncClient(base_url=origin, headers={'Origin': origin}, trust_env=False) as client:
        for _ in range(100):
            try:
                if (await client.get('/health')).status_code == 200:
                    break
            except httpx.ConnectError:
                pass
            await asyncio.sleep(.1)
        else:
            raise AssertionError('Servidor de teste não iniciou.')
        baseline = (await client.get('/_fixture_metrics')).json()
        began = time.perf_counter()
        a = (await client.post('/api/rooms', json={'name': 'Sintético 0'})).json()
        code = a['code']
        people = [a]
        for i in range(1, 15):
            response = await client.post(f'/api/rooms/{code}/join', json={'name': f'Sintético {i}'})
            assert response.status_code == 201
            people.append(response.json())
        sockets = []
        async def attach(identity):
            socket = await connect(f'ws://127.0.0.1:15052/ws/{code}', origin=origin)
            sockets.append(socket)
            await socket.send(json.dumps({'token': identity['token']}))
            return await until(socket, 'state')
        try:
            for person in people:
                await attach(person)
            host = sockets[0]
            await host.send(json.dumps({'id': 'live-start-event', 'action': 'start'}))
            assert (await until(host, 'ack'))['ok']
            state = await until(host, 'state', lambda m: m['phase'] == 'question')
            c = (await client.post(f'/api/rooms/{code}/join', json={'name': 'Espectador sintético'})).json()
            spectator_state = await attach(c)
            assert next(p for p in spectator_state['people'] if p['id'] == c['participant'])['spectator']
            assert (await client.post(f'/api/rooms/{code}/join', json={'name': 'Sem vaga'})).status_code == 400
            answers = json.loads((directory / 'answers.json').read_text())
            event = {'id': 'live-answer-event', 'action': 'answer', 'round_id': state['round_id'], 'answer': answers[state['challenge']['id']]}
            async def attempt(socket):
                start = time.perf_counter()
                await socket.send(json.dumps(event))
                ack = await until(socket, 'ack')
                assert ack['correct'] and 0 < ack['points'] <= 200
                await socket.send(json.dumps(event))
                assert await until(socket, 'ack') == ack
                return (time.perf_counter() - start) * 1000
            latencies = await asyncio.gather(*(attempt(socket) for socket in sockets[:15]))
            revealed = await until(host, 'state', lambda m: m['phase'] == 'reveal')
            scores = {p['id']: p['score'] for p in revealed['people']}
            await sockets[1].close()
            await attach(people[1])
            # Retomada preserva o score no snapshot publicado ao espectador.
            resumed = await until(sockets[15], 'state', lambda m: not next(p for p in m['people'] if p['id'] == people[1]['participant'])['online'])
            resumed = await until(sockets[15], 'state', lambda m: next(p for p in m['people'] if p['id'] == people[1]['participant'])['online'])
            assert next(p for p in resumed['people'] if p['id'] == people[1]['participant'])['score'] == scores[people[1]['participant']]
            await asyncio.gather(*(socket.close() for socket in sockets[:15]), sockets[-1].close())
            cancelled = await until(sockets[15], 'state', lambda m: m['result'] == 'cancelled')
            assert cancelled['winner'] is None
            measured = (await client.get('/_fixture_metrics')).json()
            elapsed = time.perf_counter() - began
            result = dict(participants=16, competitors=15, duplicated_answers=15,
                          ack_with_duplicate_median_ms=round(statistics.median(latencies), 2),
                          ack_with_duplicate_max_ms=round(max(latencies), 2),
                          rss_idle_mib=baseline['rss_mib'], rss_after_mib=measured['rss_mib'],
                          cpu_seconds=round(measured['cpu_seconds']-baseline['cpu_seconds'], 3),
                          elapsed_seconds=round(elapsed, 3),
                          immediate_cancel_with_spectator=True, resume_preserved_score=True)
            Path('artifacts/live-metrics.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
        finally:
            await asyncio.gather(*(socket.close() for socket in sockets), return_exceptions=True)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='fun-live-') as name:
        directory = Path(name)
        env = os.environ | {'FUN_PORT': '15052', 'FUN_ORIGINS': 'http://127.0.0.1:15052',
                            'FUN_DATABASE': str(directory / 'test.sqlite3'), 'FUN_TEST_FIXTURES': '1',
                            'FUN_TEST_ANSWERS': str(directory / 'answers.json')}
        child = subprocess.Popen([sys.executable, '-m', 'tests.browser_server'], env=env,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            asyncio.run(check(directory))
        finally:
            if child.poll() is None:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], capture_output=True, check=True)
                else:
                    child.terminate()
                child.wait(timeout=10)
