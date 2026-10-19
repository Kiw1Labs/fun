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
