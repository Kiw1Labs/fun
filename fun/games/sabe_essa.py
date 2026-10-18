"""Política do primeiro jogo; registro separado do ciclo de vida de salas."""
import math

from ..catalog import normalize, select


def points(elapsed):
    return 0 if elapsed >= 20 else max(0, min(200, math.floor(200 - 5 * max(0, elapsed) + .5)))


class SabeEssa:
    @staticmethod
    def prepare(catalog, history):
        return select(catalog, {x for match in history[-3:] for x in match})

    @staticmethod
    def accepts(challenge, answer):
        return normalize(answer) in [normalize(a) for a in [challenge['answer']] + challenge['aliases']]

    score = staticmethod(points)
