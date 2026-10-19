"""Catálogo editorial privado, seleção exata e projeção pública sem respostas antecipadas."""
import json
import random
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path


def normalize(value: str) -> str:
    value = unicodedata.normalize('NFKD', value.casefold())
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value).split())


@dataclass(frozen=True)
class Challenge:
    id: str
    kind: str
    difficulty: str
    prompt: str
    answer: str
    aliases: list[str]
    classification: list[str]
    rights: str
    image: str | None = None
    category: str = ''
    subcategory: str = ''
    source_url: str = ''
    media_source_url: str = ''
    license: str = ''
    license_url: str = ''
    attribution: str = ''
    author: str = ''
    status: str = 'active'
    media_type: str = ''
    media_sha256: str = ''
    verified_at: str = ''
    set_id: str = ''
    verification_note: str = ''
    rights_note: str = ''

    def public(self, reveal=False):
        data = {k: getattr(self, k) for k in ('id', 'kind', 'prompt', 'image')}
        if reveal:
            data['answer'] = self.answer
            if self.attribution:
                data['credits'] = {k: getattr(self, k) for k in
                                   ('attribution', 'author', 'license', 'license_url', 'media_source_url', 'source_url')}
        return data


def validate(rows):
    if not isinstance(rows, list) or len(rows) > 10000:
        raise ValueError('O catálogo deve ser uma lista com até 10.000 desafios.')
    result = []
    ids = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Cada desafio deve ser um objeto.')
        try:
            c = Challenge(**row)
        except TypeError as exc:
            raise ValueError('Campos de desafio ausentes ou desconhecidos.') from exc
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', c.id) or c.id in ids:
            raise ValueError('Identificador inválido ou duplicado.')
        if c.kind not in ('image', 'text') or c.difficulty not in ('easy', 'medium', 'hard'):
            raise ValueError('Tipo ou dificuldade inválidos.')
        if not all(isinstance(x, str) and 0 < len(x) <= 1000 for x in (c.prompt, c.answer, c.rights)):
            raise ValueError('Enunciado, resposta e direitos são obrigatórios.')
        if not isinstance(c.aliases, list) or len(c.aliases) > 40 or not all(isinstance(a, str) and 0 < len(a) <= 200 and normalize(a) for a in c.aliases):
            raise ValueError('Aliases inválidos.')
        if not normalize(c.answer) or len(c.answer) > 200:
            raise ValueError('Resposta inválida.')
        if not isinstance(c.classification, list) or not c.classification or not all(isinstance(x, str) and 0 < len(x) <= 80 for x in c.classification):
            raise ValueError('Informe a classificação editorial.')
        if c.kind == 'image' and (not isinstance(c.image, str) or not re.fullmatch(r'/media/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp)', c.image) or '..' in c.image):
            raise ValueError('Imagem deve ser um arquivo local em /media/.')
        if c.kind == 'text' and c.image is not None:
            raise ValueError('Desafio de texto não usa imagem.')
        if c.status not in ('active', 'draft', 'review', 'inactive'):
            raise ValueError('Status editorial inválido.')
        categories = ('TV e entretenimento', 'Memes e internet', 'Games', 'Música', 'Cinema e séries', 'Cultura e nostalgia')
        if c.category and c.category not in categories:
            raise ValueError('Categoria editorial inválida.')
        for value in (c.source_url, c.media_source_url, c.license_url):
            if value and (not isinstance(value, str) or len(value) > 2000 or not re.fullmatch(r'https://[^\s<>"\x00-\x1f]+', value)):
                raise ValueError('Fonte/licença deve usar uma URL HTTPS válida.')
        if c.media_sha256 and not re.fullmatch('[0-9a-f]{64}', c.media_sha256):
            raise ValueError('Hash da mídia inválido.')
        ids.add(c.id)
        result.append(c)
    return result


def load(path):
    return [c for c in validate(json.loads(Path(path).read_text(encoding='utf-8'))) if c.status == 'active'] if Path(path).exists() else []


def select(catalog, excluded):
    """Busca exata dos dois balanços simultâneos, sem seleção gulosa incompleta."""
    groups = {(k, d): [] for k in ('image', 'text') for d in ('easy', 'medium', 'hard')}
    for c in catalog:
        if c.status == 'active' and c.id not in excluded:
            groups[c.kind, c.difficulty].append(c)
    options = []
    for easy in range(8):
        for medium in range(6):
            hard = 8 - easy - medium
            image_counts = (easy, medium, hard)
            text_counts = (7-easy, 5-medium, 3-hard)
            if all(0 <= n <= len(groups[k, d]) for k, counts in [('image', image_counts), ('text', text_counts)] for d, n in zip(('easy', 'medium', 'hard'), counts)):
                options.append((image_counts, text_counts))
    if not options:
        raise ValueError('Catálogo insuficiente: são necessários 15 desafios inéditos com 8 imagens, 7 textos e dificuldades 7/5/3, excluindo as três partidas anteriores.')
    # Mantém quatro partidas consecutivas viáveis no acervo inicial balanceado.
    # Catálogos diferentes continuam usando as demais composições exatas.
    preferred = ((4, 3, 1), (3, 2, 2))
    counts = preferred if preferred in options else random.choice(options)
    picked = {}
    for k, ns in zip(('image', 'text'), counts):
        picked[k] = [c for d, n in zip(('easy', 'medium', 'hard'), ns) for c in random.sample(groups[k, d], n)]
        random.shuffle(picked[k])
    return [picked['image'].pop() if i % 2 == 0 else picked['text'].pop() for i in range(15)]


def export(challenges):
    return [asdict(c) for c in challenges]
