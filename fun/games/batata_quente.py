"""Política independente de transporte; todas as chamadas ocorrem sob o lock do Engine."""
import secrets

from .lexicon import normalize

DEFAULTS = dict(lives=3, min_seconds=10, max_seconds=30, floor_seconds=5, difficulty='normal')


def settings(value):
    if not isinstance(value, dict) or set(value) != set(DEFAULTS):
        raise ValueError('Configurações inválidas.')
    for field, low, high in [('lives', 1, 5), ('min_seconds', 5, 60), ('max_seconds', 5, 60), ('floor_seconds', 3, 10)]:
        if type(value[field]) is not int or not low <= value[field] <= high:
            raise ValueError(f'Configuração {field} deve ficar entre {low} e {high}.')
    if value['min_seconds'] > value['max_seconds'] or value['floor_seconds'] > value['min_seconds']:
        raise ValueError('Use mínimo ≤ máximo e tempo de passagem ≤ mínimo.')
    if value['difficulty'] not in ('easy', 'normal', 'hard'):
        raise ValueError('Dificuldade inválida.')
    return dict(value)


class BatataQuente:
    def __init__(self, lexicon):
        self.lexicon = lexicon

    def eligible(self, r):
        return [pid for pid in r['roster'] if r['people'][pid]['active'] and r['potato']['lives'][pid] > 0]

    def start(self, r, now, players):
        r['roster'] = [p['id'] for p in players]
        r['potato'] = dict(lives={p['id']: r['settings']['lives'] for p in players}, used={}, spent={},
                           turn=players[0]['id'], fragment=None, log=[], cycle=0, event=None)
        r.update(phase='playing', result=None, winner=None, warning=None)
        self.challenge(r, now)
        if r['phase'] == 'playing':
            self.heat(r, now)

    def challenge(self, r, now):
        game = r['potato']
        game['fragment'] = self.lexicon.pick(game['spent'], r['settings']['difficulty'], game['fragment'])
        r['round_id'] = secrets.token_hex(12)
        if game['fragment'] is None:
            r.update(phase='results', result='dictionary_exhausted', winner=None, deadline=None, activity=now, warning=None)

    def heat(self, r, now):
        config = r['settings']
        seconds = secrets.randbelow(config['max_seconds'] - config['min_seconds'] + 1) + config['min_seconds']
        r.update(started=now, deadline=now + seconds)
        r['potato']['cycle'] += 1

    def next(self, r):
        game, roster = r['potato'], r['roster']
        index = roster.index(game['turn'])
        eligible = set(self.eligible(r))
        for offset in range(1, len(roster) + 1):
            candidate = roster[(index + offset) % len(roster)]
            if candidate in eligible:
                game['turn'] = candidate
                return

    def answer(self, r, pid, event, now):
        game = r['potato']
        if r['phase'] != 'playing' or pid != game['turn'] or event.get('round_id') != r['round_id']:
            raise ValueError('Aguarde sua vez e o trecho atual.')
        if now >= r['deadline']:
            raise ValueError('O prazo desta vez terminou.')
        word = event.get('answer')
        display = self.lexicon.lookup(word)
        if display is None:
            raise ValueError('Palavra ausente do dicionário. Use uma palavra de 3 a 32 letras, sem espaços ou hífens.')
        key = normalize(display)
        if key in game['used']:
            raise ValueError('Essa palavra já foi usada.')
        if game['fragment'] not in key:
            raise ValueError(f'A palavra precisa conter {game["fragment"].upper()}.')
        game['used'][key] = display
        for size in (2, 3):
            for part in {key[i:i + size] for i in range(len(key) - size + 1)}:
                game['spent'][part] = game['spent'].get(part, 0) + 1
        game['log'] = (game['log'] + [dict(player=r['people'][pid]['name'], word=display)])[-8:]
        game['event'] = dict(id=r['round_id'], kind='pass', player=pid, word=display)
        self.next(r)
        self.challenge(r, now)
        if r['phase'] == 'playing':
            r['deadline'] = max(r['deadline'], now + r['settings']['floor_seconds'])
        return dict(correct=True, word=display)

    def expire(self, r, now):
        game = r['potato']
        pid = game['turn']
        game['lives'][pid] = max(0, game['lives'][pid] - 1)
        game['event'] = dict(id=r['round_id'], kind='burn', player=pid)
        self.next(r)
        if len(self.eligible(r)) >= 2:
            self.challenge(r, now)
            if r['phase'] == 'playing':
                self.heat(r, now)

    def snapshot(self, r):
        game = r.get('potato')
        return dict(settings=r['settings'], turn=game['turn'] if game else None,
                    fragment=game['fragment'].upper() if game and game['fragment'] else None,
                    lives=dict(game['lives']) if game else {}, cycle=game['cycle'] if game else 0,
                    used_count=len(game['used']) if game else 0,
                    recent=game['log'] if game else [], event=game['event'] if game else None)
