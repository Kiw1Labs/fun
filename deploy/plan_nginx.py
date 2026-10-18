"""Produz candidato aditivo e backup privado; nunca substitui ou recarrega o Nginx."""
import argparse
import hashlib
import re
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('active', type=Path, help='Arquivo -c do master realmente ativo')
parser.add_argument('output', type=Path, help='Diretório novo para plano e backup')
parser.add_argument('--include', default='/root/fun/current/deploy/nginx-fun.conf')
args = parser.parse_args()
if not re.fullmatch(r'/[A-Za-z0-9_./-]+', args.include) or '..' in args.include:
    raise SystemExit('Caminho de include inválido.')
text = args.active.read_text()
if args.include in text:
    raise SystemExit('Include já presente; revisar a configuração sem duplicar.')
# Lexer ignora comentários e strings, conservando as posições das chaves.
tokens = list(re.finditer(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\#[^\n]*|[{}]|[^\s{};]+''', text))
depth, found, close = 0, False, None
for i, token in enumerate(tokens):
    value = token.group()
    if value.startswith(('#', '"', "'")):
        continue
    if not found and value == 'http' and i+1 < len(tokens) and tokens[i+1].group() == '{':
        found = True
        continue
    if found:
        if value == '{':
            depth += 1
        elif value == '}':
            depth -= 1
            if depth == 0:
                close = token.start()
                break
if close is None:
    raise SystemExit('Não foi possível identificar unicamente o bloco http. Revisão manual necessária.')
args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
shutil.copy2(args.active, args.output / 'nginx-before.conf')
candidate = text[:close] + f'    # Fun: adição isolada por hostname e porta\n    include {args.include};\n' + text[close:]
(args.output / 'nginx-candidate.conf').write_text(candidate)
(args.output / 'before.sha256').write_text(hashlib.sha256(text.encode()).hexdigest() + '\n')
print('Backup e candidato preparados. Compare, rode nginx -t e obtenha autorização antes do reload compartilhado.')
