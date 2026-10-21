"""Busca binária em bytes: léxico grande sem um dict Python por palavra."""
import bisect
import gzip
import json
import os
import re
import secrets
import unicodedata
from array import array
from functools import lru_cache
from pathlib import Path


def normalize(word):
    return ''.join(c for c in unicodedata.normalize('NFD', word.lower()) if not unicodedata.combining(c))


class Lexicon:
    def __init__(self, path):
        path = Path(path)
        self.data = gzip.decompress((path / 'words.tsv.gz').read_bytes())
        self.offsets = array('I', [0])
        position = 0
        while (position := self.data.find(b'\n', position) + 1) and position < len(self.data):
            self.offsets.append(position)
        self.counts = json.loads((path / 'fragments.json').read_text(encoding='utf-8'))

    def __len__(self):
        return len(self.offsets)

    def key(self, index):
        start = self.offsets[index]
        return self.data[start:self.data.index(b'\t', start)]

    def lookup(self, word):
        if not isinstance(word, str) or not 3 <= len(word) <= 32:
            return None
        word = unicodedata.normalize('NFC', word)
        if not re.fullmatch('[A-Za-zÀ-ÖØ-öø-ÿ]+', word):
            return None
        key = normalize(word).encode('ascii', errors='replace')
        index = bisect.bisect_left(range(len(self.offsets)), key, key=self.key)
        if index == len(self.offsets) or self.key(index) != key:
            return None
        start = self.data.index(b'\t', self.offsets[index]) + 1
        spellings = self.data[start:self.data.index(b'\n', start)].decode().split('|')
        return word.lower() if word.lower() in spellings else spellings[0]

    def pick(self, spent, difficulty='normal', previous=None):
        minimum, maximum = {'easy': (1000, 10**9), 'normal': (200, 5000), 'hard': (30, 500)}[difficulty]
        choices = [part for part, count in self.counts.items()
                   if len(part) == 3 and minimum <= count - spent.get(part, 0) <= maximum and part != previous]
        if not choices:
            choices = [part for part, count in self.counts.items() if count > spent.get(part, 0)]
        return secrets.choice(choices) if choices else None


@lru_cache(maxsize=1)
def default_lexicon():
    return Lexicon(os.getenv('FUN_DICTIONARY') or str(Path(__file__).resolve().parents[2] / 'content/dictionary'))
