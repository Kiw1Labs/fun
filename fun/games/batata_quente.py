"""Política independente de transporte; todas as chamadas ocorrem sob o lock do Engine."""
import secrets

from .lexicon import normalize

DEFAULTS = dict(lives=3, min_seconds=10, max_seconds=30, floor_seconds=5, difficulty='easy')
DIFFICULTY_PATTERN = ('easy', 'easy', 'easy', 'normal', 'easy', 'easy', 'hard')


def difficulty(lap):
    return DIFFICULTY_PATTERN[(lap - 1) % len(DIFFICULTY_PATTERN)]


class BatataQuente:
    def __init__(self, lexicon):
        self.lexicon = lexicon

    def eligible(self, r):
        return [pid for pid in r['roster'] if r['people'][pid]['active'] and r['potato']['lives'][pid] > 0]

    def start(self, r, now, players):
        r['settings'] = dict(DEFAULTS)
        r['roster'] = [p['id'] for p in players]
        r['potato'] = dict(lives={p['id']: r['settings']['lives'] for p in players}, used={}, spent={},
                           turn=players[0]['id'], fragment=None, log=[], cycle=0, event=None,
                           lap=1, lap_remaining=list(r['roster']), hold=None)
        r.update(phase='playing', result=None, winner=None, warning=None)
        self.challenge(r, now)
        if r['phase'] == 'playing':
            self.heat(r, now)

    def challenge(self, r, now):
        game = r['potato']
        game['fragment'] = self.lexicon.pick(game['spent'], difficulty(game['lap']), game['fragment'])
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
        previous = game['turn']
        index = roster.index(game['turn'])
        eligible = set(self.eligible(r))
        game['lap_remaining'] = [pid for pid in game['lap_remaining'] if pid in eligible and pid != previous]
        if not game['lap_remaining']:
            game['lap'] += 1
            game['lap_remaining'] = self.eligible(r)
        if game['hold']:
            game['hold']['remaining'] = [pid for pid in game['hold']['remaining'] if pid in eligible and pid != previous]
            if not game['hold']['remaining']:
                game['hold'] = None
        for offset in range(1, len(roster) + 1):
            candidate = roster[(index + offset) % len(roster)]
            if candidate in eligible:
                game['turn'] = candidate
                return

    def next_challenge(self, r, now):
        game = r['potato']
        available = self.lexicon.counts.get(game['fragment'], 0) - game['spent'].get(game['fragment'], 0) if game['hold'] else 0
        if game['hold'] and available > 0:
            # Mesmo trecho, nova identidade de turno para rejeitar mensagens atrasadas.
            r['round_id'] = secrets.token_hex(12)
        else:
            game['hold'] = None
            self.challenge(r, now)

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
        self.next_challenge(r, now)
        if r['phase'] == 'playing':
            r['deadline'] = max(r['deadline'], now + r['settings']['floor_seconds'])
        return dict(correct=True, word=display)

    def expire(self, r, now):
        game = r['potato']
        pid = game['turn']
        game['lives'][pid] = max(0, game['lives'][pid] - 1)
        game['event'] = dict(id=r['round_id'], kind='burn', player=pid)
        game['hold'] = dict(player=pid, remaining=[other for other in self.eligible(r) if other != pid])
        self.next(r)
        if len(self.eligible(r)) >= 2:
            self.next_challenge(r, now)
            if r['phase'] == 'playing':
                self.heat(r, now)

    def snapshot(self, r):
        game = r.get('potato')
        lap = game.get('lap', 1) if game else 1
        hold = game.get('hold') if game else None
        return dict(settings=r['settings'], turn=game['turn'] if game else None,
                    fragment=game['fragment'].upper() if game and game['fragment'] else None,
                    lives=dict(game['lives']) if game else {}, cycle=game['cycle'] if game else 0,
                    lap=lap, difficulty=difficulty(lap), lap_in_cycle=(lap - 1) % len(DIFFICULTY_PATTERN) + 1,
                    fragment_hold=(dict(player=hold['player'] if hold['player'] in self.eligible(r) else None)
                                   if hold and r['phase'] == 'playing' else None),
                    used_count=len(game['used']) if game else 0,
                    recent=game['log'] if game else [], event=game['event'] if game else None)
