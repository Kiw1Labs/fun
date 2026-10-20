"""Snapshots atômicos em SQLite exclusivo; tokens são persistidos somente como hash."""
import json
import os
import sqlite3
from pathlib import Path


class Store:
    def __init__(self, path):
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA busy_timeout=3000')
        self.db.execute('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL)')
        with self.db:
            self.db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)')
            self.db.execute('CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            self.db.execute("INSERT OR IGNORE INTO schema_migrations VALUES (1, 'private_question_catalog')")
            self.db.execute('''CREATE TABLE IF NOT EXISTS question_submissions (
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected')), data TEXT NOT NULL,
                image BLOB, created_at REAL NOT NULL, reviewed_at REAL, question_id TEXT)''')
            self.db.execute('CREATE INDEX IF NOT EXISTS submissions_state_created ON question_submissions(state,created_at)')
            self.db.execute("INSERT OR IGNORE INTO schema_migrations VALUES (2, 'moderated_question_submissions')")
        if path != ':memory:' and os.name != 'nt':
            os.chmod(path, 0o600)

    def save(self, code, data):
        with self.db:
            self.db.execute('INSERT INTO rooms VALUES (?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data', (code, json.dumps(data)))

    def all(self):
        return [json.loads(row[0]) for row in self.db.execute('SELECT data FROM rooms')]

    def delete(self, code):
        with self.db:
            self.db.execute('DELETE FROM rooms WHERE code=?', (code,))

    def close(self):
        self.db.close()

    def catalog(self):
        from .catalog import validate
        rows = [json.loads(row[0]) for row in self.db.execute('SELECT data FROM questions ORDER BY id')]
        return [c for c in validate(rows) if c.status == 'active']

    def all_questions(self):
        """Return every persisted editorial record, including inactive drafts."""
        from .catalog import validate
        rows = [json.loads(row[0]) for row in self.db.execute('SELECT data FROM questions ORDER BY id')]
        return [c.__dict__ for c in validate(rows)]

    def import_catalog(self, challenges):
        from .catalog import export
        counts = {'inserted': 0, 'updated': 0, 'unchanged': 0}
        with self.db:
            for challenge in export(challenges):
                data = json.dumps(challenge, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
                old = self.db.execute('SELECT data FROM questions WHERE id=?', (challenge['id'],)).fetchone()
                if old is None:
                    self.db.execute('INSERT INTO questions VALUES (?,?)', (challenge['id'], data))
                    counts['inserted'] += 1
                elif old[0] != data:
                    self.db.execute('UPDATE questions SET data=? WHERE id=?', (data, challenge['id']))
                    counts['updated'] += 1
                else:
                    counts['unchanged'] += 1
        return counts

    def add_submission(self, request_id, fingerprint, data, image, now):
        import secrets
        from .submissions import SubmissionError
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            old = self.db.execute('SELECT id,fingerprint FROM question_submissions WHERE request_id=?', (request_id,)).fetchone()
            if old:
                if old[1] != fingerprint:
                    raise SubmissionError('Este envio já foi recebido com outro conteúdo. Inicie uma nova questão.', 409)
                return old[0]
            count, size = self.db.execute("SELECT count(*),coalesce(sum(length(image)),0) FROM question_submissions WHERE state='pending'").fetchone()
            if count >= 500 or size + len(image or b'') > 64 * 1024 * 1024:
                raise SubmissionError('A fila de contribuições está cheia. Tente novamente mais tarde.', 503)
            identifier = 's_' + secrets.token_hex(16)
            self.db.execute("INSERT INTO question_submissions VALUES (?,?,?,'pending',?,?,?,NULL,NULL)",
                            (identifier, request_id, fingerprint, json.dumps(data, ensure_ascii=False), image, now))
        return identifier

    def submissions(self, page=1):
        total = self.db.execute("SELECT count(*) FROM question_submissions WHERE state='pending'").fetchone()[0]
        rows = self.db.execute("SELECT id,data,created_at FROM question_submissions WHERE state='pending' ORDER BY created_at,id LIMIT 20 OFFSET ?", ((page - 1) * 20,))
        return total, [dict(json.loads(data), id=identifier, created_at=created, status='pending') for identifier, data, created in rows]

    def submission(self, identifier):
        row = self.db.execute('SELECT data,image,state,question_id,created_at FROM question_submissions WHERE id=?', (identifier,)).fetchone()
        return dict(json.loads(row[0]), id=identifier, image_bytes=row[1], state=row[2], question_id=row[3], created_at=row[4]) if row else None

    def review_submission(self, identifier, action, challenge, now, base_catalog):
        from .catalog import export
        from .submissions import SubmissionError
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            row = self.db.execute('SELECT state,question_id FROM question_submissions WHERE id=?', (identifier,)).fetchone()
            if not row:
                raise SubmissionError('Contribuição não encontrada.', 404)
            state = 'approved' if action == 'approve' else 'rejected'
            if row[0] != 'pending':
                if row[0] == state:
                    return row[1]
                raise SubmissionError('Esta contribuição já foi revisada. Atualize a lista.', 409)
            if challenge:
                if self.db.execute('SELECT count(*) FROM questions').fetchone()[0] >= 10000 or len(base_catalog) >= 10000:
                    raise SubmissionError('O acervo atingiu o limite de questões. Revise o catálogo antes de aprovar.', 503)
                # Preserva o acervo legado JSON ao inserir a primeira questão no SQLite.
                if not self.db.execute('SELECT EXISTS(SELECT 1 FROM questions)').fetchone()[0]:
                    for record in export(base_catalog):
                        self.db.execute('INSERT INTO questions VALUES (?,?)', (record['id'], json.dumps(record, ensure_ascii=False)))
                self.db.execute('INSERT INTO questions VALUES (?,?)', (challenge.id, json.dumps(export([challenge])[0], ensure_ascii=False)))
            question_id = challenge.id if challenge else None
            self.db.execute('UPDATE question_submissions SET state=?,reviewed_at=?,question_id=?,image=NULL WHERE id=?', (state, now, question_id, identifier))
        return question_id
