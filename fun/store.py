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
