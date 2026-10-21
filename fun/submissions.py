"""Validação de contribuições públicas; nenhuma sugestão é um desafio antes da revisão."""
import base64
import hashlib
import json
import os
import re
import struct
import tempfile
from pathlib import Path

from .catalog import normalize

MAX_IMAGE = 512 * 1024
MAX_BODY = 768 * 1024


class SubmissionError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def text(value, name, maximum, required=False, multiline=False):
    if not isinstance(value, str):
        raise SubmissionError(f'{name}: informe um texto válido.')
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise SubmissionError(f'{name}: preencha com até {maximum} caracteres.')
    if any(ord(char) < 32 and (not multiline or char not in '\n\r\t') for char in value):
        raise SubmissionError(f'{name}: texto inválido.')
    return value


def inspect_image(data):
    """Aceita apenas imagens raster com cabeçalhos e dimensões limitados, nunca SVG/HTML."""
    if not data or len(data) > MAX_IMAGE:
        raise SubmissionError('A imagem deve ter até 512 KB.')
    width = height = 0
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) >= 45 and data[12:16] == b'IHDR' and data[-12:] == b'\x00\x00\x00\x00IEND\xaeB`\x82':
        width, height = struct.unpack('>II', data[16:24])
        kind, extension = 'image/png', 'png'
    elif data.startswith(b'\xff\xd8') and data.endswith(b'\xff\xd9'):
        position = 2
        while position + 4 <= len(data):
            if data[position] != 255:
                break
            while position < len(data) and data[position] == 255:
                position += 1
            if position >= len(data):
                break
            marker = data[position]
            position += 1
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                continue
            if marker in (0xD9, 0xDA) or position + 2 > len(data):
                break
            size = int.from_bytes(data[position:position + 2], 'big')
            if size < 2 or position + size > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2) and size >= 8:
                height, width = struct.unpack('>HH', data[position + 3:position + 7])
                break
            position += size
        kind, extension = 'image/jpeg', 'jpg'
    elif len(data) >= 30 and data[:4] == b'RIFF' and data[8:12] == b'WEBP' and int.from_bytes(data[4:8], 'little') + 8 == len(data):
        chunk = data[12:16]
        if chunk == b'VP8X':
            width = 1 + int.from_bytes(data[24:27], 'little')
            height = 1 + int.from_bytes(data[27:30], 'little')
        elif chunk == b'VP8 ' and data[23:26] == b'\x9d\x01\x2a':
            width = int.from_bytes(data[26:28], 'little') & 0x3FFF
            height = int.from_bytes(data[28:30], 'little') & 0x3FFF
        elif chunk == b'VP8L' and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], 'little')
            width, height = (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        kind, extension = 'image/webp', 'webp'
    else:
        raise SubmissionError('Envie uma imagem PNG, JPG ou WebP válida.')
    if not (0 < width <= 4096 and 0 < height <= 4096 and width * height <= 8_000_000):
        raise SubmissionError('Imagem inválida ou com dimensões muito grandes.')
    return kind, extension


def validate_submission(payload):
    fields = {'request_id', 'nickname', 'prompt', 'reference', 'answer', 'category', 'image'}
    if not isinstance(payload, dict) or set(payload) - fields:
        raise SubmissionError('Informe somente os campos da contribuição.')
    request_id = payload.get('request_id')
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}', request_id):
        raise SubmissionError('Identificador de envio inválido. Atualize a página.')
    data = dict(nickname=text(payload.get('nickname', ''), 'Nickname', 24),
                prompt=text(payload.get('prompt', ''), 'Título', 300, required=True),
                reference=text(payload.get('reference', ''), 'Texto de referência', 2000, multiline=True),
                answer=text(payload.get('answer', ''), 'Resposta', 200, required=True),
                category=text(payload.get('category', ''), 'Categorias sugeridas', 300, required=True), tag='Contribuição')
    if not normalize(data['answer']):
        raise SubmissionError('Informe uma resposta com letras ou números.')
    raw_image = payload.get('image')
    if raw_image is not None and data['reference']:
        raise SubmissionError('Escolha apenas um formato: imagem ou texto de referência.')
    if raw_image is None and not data['reference']:
        raise SubmissionError('Adicione uma imagem ou preencha o texto de referência.')
    image = None
    media_type = extension = ''
    if raw_image is not None:
        if not isinstance(raw_image, str) or len(raw_image) > (MAX_IMAGE + 2) // 3 * 4:
            raise SubmissionError('A imagem deve ter até 512 KB.')
        try:
            image = base64.b64decode(raw_image, validate=True)
        except ValueError as exc:
            raise SubmissionError('Imagem inválida.') from exc
        media_type, extension = inspect_image(image)
    data.update(kind='image' if image else 'text', media_type=media_type, extension=extension)
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode() + (image or b'')).hexdigest()
    return request_id, fingerprint, data, image


def publish_image(submission, root):
    image = submission['image_bytes']
    digest = hashlib.sha256(image).hexdigest()
    directory = (Path(root) / 'community').resolve()
    if not directory.is_relative_to(Path(root).resolve()):
        raise SubmissionError('Diretório de mídia indisponível.', 503)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = directory / f"{digest}.{submission['extension']}"
    if target.exists():
        if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise SubmissionError('Mídia existente divergente. Nenhum arquivo foi substituído.', 409)
    else:
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as output:
            temporary = Path(output.name)
            output.write(image)
            output.flush()
            os.fsync(output.fileno())
        try:
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return '/media/community/' + target.name, digest
