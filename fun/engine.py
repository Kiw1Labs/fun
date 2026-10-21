"""Motor síncrono: o adaptador ASGI serializa todas as mutações com um único lock."""
import hashlib
import json
import re
import secrets
import string
import time

from .catalog import Challenge, export
from .games import GAMES
from .games.sabe_essa import points as points
from .games.batata_quente import BatataQuente, DEFAULTS, settings
from .games.lexicon import default_lexicon


class RuleError(ValueError):
    pass


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Engine:
    def __init__(self, store, catalog, clock=time.time, lexicon=None):
        self.store, self.catalog, self.clock = store, catalog, clock
        self._lexicon = lexicon
        self.rooms = {r['code']: r for r in store.all()}
        self.connections = {}
        self.catalog_cache = {}
        now = clock()
        for r in self.rooms.values():
            r.setdefault('room_name', 'Sala de Sabe Essa?')
            r.setdefault('visibility', 'private')
            # Falha/reinício encerra uma partida sem vencedor e reabre a janela de retomada.
            if r['phase'] in ('question', 'reveal', 'playing'):
                self.finish(r, 'cancelled', None, now)
            r['empty_since'] = now
            for p in r['people'].values():
                p.setdefault('last_wrong_answer', None)
                if p['active']:
                    p['offline_since'] = now
            self.save(r)

    @property
    def potato(self):
        if self._lexicon is None:
            self._lexicon = default_lexicon()
        return BatataQuente(self._lexicon)

    def save(self, r):
        self.store.save(r['code'], r)

    def online(self, code, pid):
        return bool(self.connections.get((code, pid)))

    def members(self, r):
        return [p for p in r['people'].values() if p['active']]

    def prune_departed(self, r):
        """Remove ended sessions after the room returns to the lobby."""
        departed = {pid for pid, p in r['people'].items() if not p['active']}
        if not departed:
            return False
        r['people'] = {pid: p for pid, p in r['people'].items() if pid not in departed}
        r['roster'] = [pid for pid in r['roster'] if pid not in departed]
        return True

    def competitors(self, r):
        return [r['people'][pid] for pid in r['roster'] if r['people'][pid]['active']]

    def room(self, code):
        if code not in self.rooms or self.rooms[code]['phase'] == 'closed':
            raise RuleError('Sala inexistente ou encerrada.')
        return self.rooms[code]

    def name(self, name):
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 24 or any(ord(c) < 32 or ord(c) == 127 for c in name):
            raise RuleError('Use um nome de 1 a 24 caracteres.')
        return name.strip()

    def create(self, name, room_name='', visibility='private', game='sabe-essa'):
        name = self.name(name)
        if game not in ('sabe-essa', 'batata-quente'):
            raise RuleError('Jogo inválido.')
        if not isinstance(room_name, str) or len(room_name.strip()) > 48 or any(ord(c) < 32 or ord(c) == 127 for c in room_name):
            raise RuleError('Use um nome de sala com até 48 caracteres.')
        if visibility not in ('public', 'private'):
            raise RuleError('Escolha uma sala pública ou privada.')
        if len(self.rooms) >= 1000:
            raise RuleError('Limite de salas atingido. Tente mais tarde.')
        while True:
            code = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(4))
            if code not in self.rooms:
                break
        now = self.clock()
        r = dict(code=code, game=game, room_name=room_name.strip() or f'Sala do {name}',
                 visibility=visibility, phase='lobby', people={}, host=None,
                 roster=[], history=[], deck=[], index=-1, round_id=None, started=None,
                 deadline=None, reveal_until=None, result=None, winner=None,
                 activity=now, warning=None, empty_since=now, closed_at=None, revision=0, join_seq=0)
        if game == 'batata-quente':
            r['settings'] = dict(DEFAULTS)
        self.rooms[code] = r
        return self.join(code, name)

    def public_rooms(self):
        rooms = []
        for r in self.rooms.values():
            if r['visibility'] != 'public' or r['phase'] == 'closed':
                continue
            members = self.members(r)
            if not any(self.online(r['code'], p['id']) for p in members):
                continue
            rooms.append(dict(code=r['code'], room_name=r['room_name'], game=r['game'],
                              phase=r['phase'], people=len(members)))
        return rooms

    def join(self, code, name):
        r = self.room(code)
        name = self.name(name)
        if r['phase'] == 'lobby':
            self.prune_departed(r)
        limit = 8 if r['game'] == 'batata-quente' else 16
        if len(self.members(r)) >= limit:
            raise RuleError(f'Sala cheia: o limite é de {limit} pessoas.')
        now = self.clock()
        r['join_seq'] += 1
        token, pid = secrets.token_urlsafe(32), secrets.token_hex(12)
        r['people'][pid] = dict(id=pid, token_hash=token_hash(token), name=name,
                               joined=r['join_seq'], active=True, offline_since=now, score=0,
                               answered=False, cooldown=0, last_wrong_answer=None,
                               events={}, departure=None)
        if r['host'] is None:
            r['host'] = pid
        r['activity'], r['warning'] = now, None
        self.touch(r)
        return dict(code=code, participant=pid, token=token)

    def auth(self, code, token):
        r = self.room(code)
        if not isinstance(token, str) or len(token) > 128:
            raise RuleError('Sessão inválida.')
        hashed = token_hash(token)
        for p in self.members(r):
            if secrets.compare_digest(p['token_hash'], hashed):
                return r, p
        raise RuleError('Sessão expirada ou participante removido.')

    def connect(self, code, token, connection):
        self.tick()
        r, p = self.auth(code, token)
        key = (code, p['id'])
        if len(self.connections.get(key, set())) >= 4:
            raise RuleError('Limite de quatro abas por sessão.')
        self.connections.setdefault(key, set()).add(connection)
        p['offline_since'], r['empty_since'] = None, None
        if r['host'] is None:
            r['host'] = p['id']
        self.touch(r)
        return p['id']

    def disconnect(self, code, pid, connection):
        r = self.rooms.get(code)
        links = self.connections.get((code, pid), set())
        links.discard(connection)
        if not links:
            self.connections.pop((code, pid), None)
        if r and pid in r['people'] and r['people'][pid]['active'] and not self.online(code, pid):
            now = self.clock()
            r['people'][pid]['offline_since'] = now
            if not any(self.online(code, p['id']) for p in self.members(r)):
                r['empty_since'] = now
            self.check_outcome(r, now)
            self.touch(r)

    def touch(self, r):
        r['revision'] += 1
        self.save(r)

    def transfer(self, r):
        candidates = [p for p in self.members(r) if self.online(r['code'], p['id'])]
        r['host'] = min(candidates, key=lambda p: (p['joined'], p['id']))['id'] if candidates else None

    def remove(self, r, pid, reason):
        p = r['people'][pid]
        p['active'], p['departure'] = False, reason
        self.connections.pop((r['code'], pid), None)
        if r['host'] == pid:
            self.transfer(r)
        now = self.clock()
        if not any(self.online(r['code'], p['id']) for p in self.members(r)) and r['empty_since'] is None:
            r['empty_since'] = now
        self.check_outcome(r, now)

    def finish(self, r, result, winner, now):
        r.update(phase='results', result=result, winner=winner, activity=now, warning=None, deadline=None)

    def check_outcome(self, r, now):
        if r['game'] == 'batata-quente':
            if r['phase'] != 'playing':
                return
            eligible = self.potato.eligible(r)
            if not any(self.online(r['code'], pid) for pid in eligible):
                self.finish(r, 'cancelled', None, now)
            elif len(eligible) == 1:
                self.finish(r, 'survivor', eligible[0], now)
            elif r['potato']['turn'] not in eligible:
                self.potato.next(r)
                self.potato.challenge(r, now)
                if r['phase'] == 'playing':
                    self.potato.heat(r, now)
            return
        if r['phase'] not in ('question', 'reveal'):
            return
        eligible = self.competitors(r)
        if not any(self.online(r['code'], p['id']) for p in eligible):
            self.finish(r, 'cancelled', None, now)
        elif len(eligible) == 1:
            self.finish(r, 'automatic', eligible[0]['id'], now)
        elif r['phase'] == 'question' and all(p['answered'] for p in eligible):
            self.reveal(r, now)

    def reveal(self, r, now):
        r.update(phase='reveal', reveal_until=now + 4)

    def question(self, r, now):
        r['index'] += 1
        r.update(phase='question', round_id=secrets.token_hex(12), started=now, deadline=now + 20)
        for pid in r['roster']:
            r['people'][pid].update(answered=False, cooldown=0, last_wrong_answer=None)

    def start(self, r, now):
        online = [p for p in self.members(r) if self.online(r['code'], p['id'])]
        if len(online) < 2:
            raise RuleError('São necessários pelo menos dois competidores conectados.')
        if r['game'] == 'batata-quente':
            if not len(self.potato.lexicon):
                raise RuleError('Dicionário indisponível.')
            r['people'] = {p['id']: p for p in self.members(r)}
            self.potato.start(r, now, online)
            return
        try:
            deck = GAMES[r['game']].prepare(self.catalog, r['history'])
        except ValueError as exc:
            raise RuleError(str(exc)) from exc
        # Retira sessões antigas da lista somente ao iniciar outra partida.
        r['people'] = {p['id']: p for p in self.members(r)}
        r['roster'] = list(r['people'])
        for p in r['people'].values():
            p['score'] = 0
        r.update(deck=export(deck), index=-1, winner=None, result=None, warning=None)
        r['history'] = (r['history'] + [[c.id for c in deck]])[-3:]
        self.question(r, now)

    def action(self, code, pid, event):
        self.tick()
        r = self.room(code)
        p = r['people'].get(pid)
        if not p or not p['active'] or not self.online(code, pid):
            raise RuleError('Sua sessão não está ativa.')
        if not isinstance(event, dict) or set(event) - {'id', 'action', 'round_id', 'answer', 'target', 'room_name', 'name', 'settings'}:
            raise RuleError('Mensagem inválida.')
        eid = event.get('id')
        if not isinstance(eid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', eid):
            raise RuleError('Identificador do evento inválido.')
        fingerprint = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
        if eid in p['events']:
            old = p['events'][eid]
            if old['fingerprint'] != fingerprint:
                raise RuleError('Identificador reutilizado com conteúdo diferente.')
            return old['reply']
        now, action = self.clock(), event.get('action')
        reply = dict(type='ack', id=eid, ok=True)
        try:
            if action in ('start', 'lobby', 'kick', 'close', 'rename', 'configure') and r['host'] != pid:
                raise RuleError('Somente o anfitrião pode realizar esta ação.')
            if action == 'configure':
                if r['game'] != 'batata-quente' or r['phase'] != 'lobby':
                    raise RuleError('Altere as configurações no lobby de Batata Quente.')
                r['settings'] = settings(event.get('settings'))
            elif action == 'rename_player':
                if 'target' in event:
                    raise RuleError('Altere apenas o seu próprio nome.')
                p['name'] = self.name(event.get('name'))
            elif action == 'rename':
                if r['phase'] != 'lobby':
                    raise RuleError('O nome da sala só pode ser alterado no lobby.')
                room_name = event.get('room_name')
                if not isinstance(room_name, str) or not 1 <= len(room_name.strip()) <= 48 or any(ord(c) < 32 or ord(c) == 127 for c in room_name):
                    raise RuleError('Use um nome de sala de 1 a 48 caracteres.')
                r['room_name'] = room_name.strip()
            elif action == 'start':
                if r['phase'] not in ('lobby', 'results'):
                    raise RuleError('Já existe uma partida em andamento.')
                self.start(r, now)
            elif action == 'answer':
                if r['game'] == 'batata-quente':
                    if r['phase'] != 'playing':
                        raise RuleError('A partida não está em andamento.')
                    reply.update(self.potato.answer(r, pid, event, now))
                    self.check_outcome(r, now)
                    # O ramo do Sabe Essa? permanece independente.
                else:
                    self.answer_sabe_essa(r, p, pid, event, now, reply)
            elif action == 'leave':
                self.remove(r, pid, 'left')
            elif action == 'kick':
                target = event.get('target')
                if target == pid or target not in r['people'] or not r['people'][target]['active']:
                    raise RuleError('Participante inválido.')
                self.remove(r, target, 'kicked')
            elif action == 'close':
                r.update(phase='closed', result='cancelled', winner=None, closed_at=now)
            elif action == 'lobby':
                if r['phase'] != 'results':
                    raise RuleError('Aguarde o resultado.')
                for player in r['people'].values():
                    player['last_wrong_answer'] = None
                r.update(phase='lobby', activity=now, warning=None)
                if r['game'] == 'batata-quente':
                    r.pop('potato', None)
            elif action == 'presence':
                if r['phase'] not in ('lobby', 'results'):
                    raise RuleError('A presença só é necessária no lobby e nos resultados.')
            else:
                raise RuleError('Ação desconhecida.')
            if action not in ('answer',):
                r['activity'], r['warning'] = now, None
        except ValueError as exc:
            reply.update(ok=False, error=str(exc))
        p['events'][eid] = dict(fingerprint=fingerprint, reply=reply)
        p['events'] = dict(list(p['events'].items())[-256:])
        if r['phase'] == 'lobby':
            self.prune_departed(r)
        self.touch(r)
        return reply

    def answer_sabe_essa(self, r, p, pid, event, now, reply):
        if r['phase'] != 'question' or event.get('round_id') != r['round_id'] or pid not in r['roster']:
            raise RuleError('Você não pode responder a este desafio.')
        answer = event.get('answer')
        if not isinstance(answer, str) or not 1 <= len(answer) <= 200:
            raise RuleError('Resposta inválida: limite de 200 caracteres.')
        if p['answered']:
            raise RuleError('Você já acertou este desafio.')
        if now < p['cooldown']:
            raise RuleError('Aguarde 0,5 segundo entre erros.')
        c = r['deck'][r['index']]
        correct = GAMES[r['game']].accepts(c, answer)
        reply['correct'] = correct
        if correct:
            p['answered'] = True
            reply['points'] = GAMES[r['game']].score(now - r['started'])
            p['score'] += reply['points']
            self.check_outcome(r, now)
        else:
            p['last_wrong_answer'] = answer
            p['cooldown'] = now + .5
            reply['retry_at'] = p['cooldown']

    def tick(self):
        now = self.clock()
        for r in list(self.rooms.values()):
            changed = self.prune_departed(r) if r['phase'] == 'lobby' else False
            if r['phase'] == 'closed':
                if now - r['closed_at'] >= 300:
                    self.store.delete(r['code'])
                    del self.rooms[r['code']]
                    self.catalog_cache.pop(r['code'], None)
                continue
            for p in self.members(r):
                if p['offline_since'] is not None and now - p['offline_since'] >= 60:
                    self.remove(r, p['id'], 'abandoned')
                    changed = True
            if r['phase'] == 'lobby' and self.prune_departed(r):
                changed = True
            if r['empty_since'] is not None and now - r['empty_since'] >= 300:
                r.update(phase='closed', result='cancelled', winner=None, closed_at=now)
                changed = True
            elif r['phase'] == 'playing' and now >= r['deadline']:
                self.potato.expire(r, now)
                self.check_outcome(r, now)
                changed = True
            elif r['phase'] == 'question' and now >= r['deadline']:
                self.reveal(r, now)
                changed = True
            elif r['phase'] == 'reveal' and now >= r['reveal_until']:
                if r['index'] == 14:
                    self.finish(r, 'completed', None, now)
                else:
                    self.question(r, now)
                changed = True
            elif r['phase'] in ('lobby', 'results'):
                if r['warning'] is not None and now >= r['warning']:
                    r.update(phase='closed', result='cancelled', winner=None, closed_at=now)
                    changed = True
                elif r['warning'] is None and now - r['activity'] >= 1800:
                    r['warning'] = now + 120
                    changed = True
            if changed:
                self.touch(r)

    def snapshot(self, code, pid):
        r = self.rooms[code]
        if r['game'] == 'batata-quente':
            return self.potato_snapshot(r, pid)
        now = self.clock()
        people = []
        scores = sorted((r['people'][i]['score'] for i in r['roster'] if r['people'][i]['active']), reverse=True)
        for p in r['people'].values():
            competitor = p['id'] in r['roster']
            people.append(dict(id=p['id'], name=p['name'], score=p['score'],
                               active=p['active'], online=self.online(code, p['id']),
                               host=p['id'] == r['host'], answered=p['answered'],
                               last_wrong_answer=(p.get('last_wrong_answer')
                                                  if r['phase'] != 'lobby' else None),
                               spectator=r['phase'] in ('question', 'reveal', 'results') and not competitor,
                               rank=(scores.index(p['score']) + 1) if competitor and p['active'] else None))
        people.sort(key=lambda p: (-p['score'], p['name'].casefold()))
        current = None
        if r['index'] >= 0 and r['phase'] in ('question', 'reveal', 'results'):
            challenge = r['deck'][r['index']]
            current = Challenge(**challenge).public(reveal=r['phase'] in ('reveal', 'results'))
        me = r['people'].get(pid, {})
        return dict(type='state', code=code, game=r['game'], phase=r['phase'],
                    room_name=r['room_name'], visibility=r['visibility'],
                    revision=r['revision'], you=pid, host=r['host'], people=people,
                    server_now=now, deadline=r['deadline'], warning=r['warning'],
                    round_id=r['round_id'], number=r['index'] + 1, challenge=current,
                    cooldown=me.get('cooldown', 0), result=r['result'], winner=r['winner'],
                    catalog_available=self.catalog_available(r))

    def catalog_available(self, r):
        if r['game'] == 'batata-quente':
            return bool(len(self.potato.lexicon))
        key = (id(self.catalog), tuple(tuple(match) for match in r['history'][-3:]))
        cached = self.catalog_cache.get(r['code'])
        if cached and cached[0] == key:
            return cached[1]
        try:
            GAMES[r['game']].prepare(self.catalog, r['history'])
            result = True
        except ValueError:
            result = False
        self.catalog_cache[r['code']] = key, result
        return result

    def potato_snapshot(self, r, pid):
        potato = self.potato.snapshot(r)
        return dict(type='state', code=r['code'], game=r['game'], phase=r['phase'],
                    room_name=r['room_name'], visibility=r['visibility'], revision=r['revision'],
                    you=pid, host=r['host'], server_now=self.clock(), deadline=r['deadline'],
                    started=r['started'], warning=r['warning'], round_id=r['round_id'],
                    result=r['result'], winner=r['winner'], catalog_available=True, potato=potato,
                    people=[dict(id=p['id'], name=p['name'], active=p['active'],
                                 online=self.online(r['code'], p['id']), host=p['id'] == r['host'],
                                 spectator=r['phase'] != 'lobby' and p['id'] not in r['roster'],
                                 lives=potato['lives'].get(p['id']), joined=p['joined'])
                            for p in r['people'].values()])
