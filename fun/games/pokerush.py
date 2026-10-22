"""PokéRush autoritativo. O adaptador serializa envios, relógio e saídas no lock comum."""
import json
import secrets
import unicodedata
from functools import lru_cache
from pathlib import Path

TYPES = dict(normal='Normal', fire='Fogo', water='Água', electric='Elétrico', grass='Planta',
             ice='Gelo', fighting='Lutador', poison='Veneno', ground='Terra', flying='Voador',
             psychic='Psíquico', bug='Inseto', rock='Pedra', ghost='Fantasma', dragon='Dragão',
             dark='Sombrio', steel='Aço', fairy='Fada')
SECONDS = 30


def normalize(value):
    if not isinstance(value, str):
        return ''
    value = value.casefold().replace('♀', 'f').replace('♂', 'm')
    return ''.join(c for c in unicodedata.normalize('NFKD', value) if c.isalnum())


class PokemonCatalog:
    def __init__(self, records):
        if len(records) != 151 or {p['id'] for p in records} != set(range(1, 152)):
            raise ValueError('O catálogo precisa conter exatamente os 151 Pokémon tradicionais.')
        self.records = {p['id']: p for p in records}
        self.names, self.groups = {}, {}
        for p in records:
            types = tuple(sorted(p['types']))
            if not 1 <= len(types) <= 2 or len(set(types)) != len(types) or set(types) - TYPES.keys():
                raise ValueError('Tipos inválidos no catálogo.')
            self.groups.setdefault(types, []).append(p['id'])
            aliases = [p['name'], p['slug']]
            for alias in aliases:
                key = normalize(alias)
                if key in self.names and self.names[key] != p['id']:
                    raise ValueError('Nomes ambíguos no catálogo.')
                self.names[key] = p['id']

    def lookup(self, answer):
        return self.records.get(self.names.get(normalize(answer)))

    def eligible(self, used):
        return [types for types, identifiers in self.groups.items() if any(str(i) not in used for i in identifiers)]

    def pick(self, used, previous):
        groups = self.eligible(used)
        alternatives = [types for types in groups if list(types) != previous]
        return list(secrets.choice(alternatives or groups)) if groups else None

    def public(self, identifier):
        p = self.records[identifier]
        return {key: p[key] for key in ('id', 'name', 'types', 'image')}


@lru_cache(maxsize=1)
def default_catalog():
    path = Path(__file__).resolve().parents[2] / 'content/pokerush/catalog.json'
    return PokemonCatalog(json.loads(path.read_text(encoding='utf-8'))['pokemon'])


class PokeRush:
    def __init__(self, catalog):
        self.catalog = catalog

    def start(self, r, now, players):
        r['roster'] = [p['id'] for p in players]
        for p in r['people'].values():
            p.update(score=0, cooldown=0, answered=False, last_wrong_answer=None)
        r['pokerush'] = dict(used={}, types=None, streak_player=None, streak=0,
                             stats={p['id']: dict(hits=0, best_streak=0) for p in players}, successes={})
        r.update(phase='playing', result=None, winner=None, warning=None, deck=[], index=-1)
        self.challenge(r, now)

    def challenge(self, r, now):
        game = r['pokerush']
        game['types'] = self.catalog.pick(game['used'], game['types'])
        if game['types'] is None:
            self.finish(r, 'exhausted', now)
            return
        r.update(round_id=secrets.token_hex(12), started=now, deadline=now + SECONDS)

    def finish(self, r, result, now):
        r.update(phase='results', result=result, winner=None, deadline=None, activity=now, warning=None)

    def answer(self, r, pid, event, now):
        # Verificar a identidade antes do cooldown: um envio atrasado nunca pune nem usa o novo desafio.
        if event.get('round_id') != r['round_id'] or r['phase'] != 'playing':
            return dict(ignored=True)
        if pid not in r['roster']:
            raise ValueError('Você está acompanhando esta partida.')
        if now >= r['deadline']:
            return dict(ignored=True)
        p, game = r['people'][pid], r['pokerush']
        if now < p['cooldown']:
            return dict(correct=False, retry_at=p['cooldown'])
        answer = event.get('answer')
        pokemon = self.catalog.lookup(answer) if isinstance(answer, str) and 1 <= len(answer) <= 200 else None
        if pokemon is None or str(pokemon['id']) in game['used'] or sorted(pokemon['types']) != sorted(game['types']):
            p['cooldown'] = now + .5
            return dict(correct=False, retry_at=p['cooldown'])
        game['used'][str(pokemon['id'])] = pid
        game['streak'] = game['streak'] + 1 if game['streak_player'] == pid else 1
        game['streak_player'] = pid
        points = 50 + 20 * (game['streak'] - 1)
        p['score'] += points
        stats = game['stats'][pid]
        stats['hits'] += 1
        stats['best_streak'] = max(stats['best_streak'], game['streak'])
        game['successes'][pid] = dict(id=r['round_id'], pokemon=pokemon['id'], points=points, at=now, until=now + 2)
        self.challenge(r, now)
        return dict(correct=True, points=points)

    def snapshot(self, r, pid, now, online):
        game = r.get('pokerush', {})
        scores = sorted([r['people'][i]['score'] for i in r['roster'] if r['people'][i]['active']], reverse=True)
        winners = []
        if r['phase'] == 'results' and r['result'] != 'cancelled':
            winners = [i for i in r['roster'] if r['people'][i]['active'] and
                       (i == r['winner'] if r['winner'] else r['people'][i]['score'] == scores[0])]
        people = []
        for p in r['people'].values():
            competitor = p['id'] in r['roster']
            success = game.get('successes', {}).get(p['id'])
            if success and success['until'] > now:
                success = dict(success, pokemon=self.catalog.public(success['pokemon']))
            else:
                success = None
            people.append(dict(id=p['id'], name=p['name'], score=p['score'], active=p['active'],
                               online=online(r['code'], p['id']), host=p['id'] == r['host'], joined=p['joined'],
                               spectator=r['phase'] != 'lobby' and not competitor,
                               rank=scores.index(p['score']) + 1 if competitor and p['active'] else None,
                               streak=game.get('streak', 0) if game.get('streak_player') == p['id'] else 0,
                               hits=game.get('stats', {}).get(p['id'], {}).get('hits', 0),
                               best_streak=game.get('stats', {}).get(p['id'], {}).get('best_streak', 0), success=success))
        people.sort(key=lambda p: (-p['score'], p['joined']) if r['phase'] == 'results' else (0, p['joined']))
        return dict(type='state', code=r['code'], game=r['game'], phase=r['phase'], room_name=r['room_name'],
                    visibility=r['visibility'], revision=r['revision'], you=pid, host=r['host'], people=people,
                    server_now=now, started=r['started'], deadline=r['deadline'], warning=r['warning'],
                    round_id=r['round_id'], cooldown=r['people'].get(pid, {}).get('cooldown', 0),
                    result=r['result'], winner=r['winner'], winners=winners, catalog_available=True,
                    pokerush=dict(types=game.get('types'), used_count=len(game.get('used', {}))))
