from fun.catalog import validate


def synthetic_catalog():
    return validate([dict(id=f'test_{kind}_{difficulty}_{i}', kind=kind, difficulty=difficulty,
                         prompt=f'Enunciado artificial {i}', answer=f'Resposta sintética {i}',
                         aliases=[f'Alias artificial {i}'], classification=['fixture'],
                         rights='Criado apenas para testes; não publicar.',
                         image=f'/media/test_{i}.png' if kind == 'image' else None)
                     for kind in ('image', 'text') for difficulty in ('easy', 'medium', 'hard') for i in range(64)])
