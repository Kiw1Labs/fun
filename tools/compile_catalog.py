"""Consolida o acervo editorial revisado; não inventa mídia nem fatos em runtime."""
from collections import Counter
import json
from pathlib import Path
import sys

from fun.catalog import export, normalize, validate
from tools.research_content import CACHE, ROOT

NOTES = {
9:'Priscila é a protagonista canina da emissora fictícia de TV Colosso.',
10:'Chaves é o menino da vila interpretado por Roberto Gómez Bolaños; o barril é seu esconderijo recorrente.',
11:'A Praça É Nossa é o humorístico do SBT ambientado em um banco de praça.',
12:'Carminha, interpretada por Adriana Esteves, é a antagonista central de Avenida Brasil, exibida em 2012.',
13:'Beakman usa jaleco verde e é acompanhado pelo rato Lester no programa educativo.',
14:'A tabela de elenco da fonte identifica Marcelo Tas como Professor Tibúrcio em Rá-Tim-Bum; não confundir com Telekid de Castelo Rá-Tim-Bum.',
15:'Lucas Silva e Silva usa o gravador do avô para imaginar histórias na série Mundo da Lua.',
24:'O cachorro do meme Doge é da raça shiba inu.',
25:'O vídeo Para Nossa Alegria reúne Jefferson, Suellen e sua mãe cantando; o enunciado não reproduz a letra.',
26:'Success Kid identifica a fotografia do bebê Sammy Griner com o punho fechado na praia; a foto protegida não é reproduzida.',
27:'Nyan Cat é o gato animado de corpo semelhante a um Pop-Tart que voa deixando arco-íris; a animação e o áudio não são reproduzidos.',
28:'O meme do punho fechado vem de Arthur, no episódio Arthur’s Big Hit; a imagem do desenho não é reproduzida.',
29:'Smudge é o gato da fotografia que foi combinada com a cena da mulher gritando; nenhuma das imagens protegidas é reproduzida.',
30:'Fatso é o gato do vídeo original de 1984; Bento e Skinny são animais posteriores, não aliases.',
39:'Mario é o encanador da Nintendo e irmão de Luigi.',
40:'Creepers são criaturas de Minecraft, jogo reconhecido pela construção com blocos.',
41:'Sonic é o ouriço azul da Sega conhecido pela velocidade.',
42:'Lara Croft é a protagonista da série Tomb Raider.',
43:'Hadouken surgiu em Street Fighter e se tornou um golpe característico da franquia.',
44:'Samus Aran é a protagonista de Metroid.',
45:'O primeiro Horizon Chase foi desenvolvido pela brasileira Aquiris Game Studio.',
54:'A formação clássica dos Beatles reúne John Lennon, Paul McCartney, George Harrison e Ringo Starr.',
55:'Marília Mendonça ficou conhecida pela imprensa como Rainha da Sofrência.',
56:'Chitãozinho e Xororó gravaram Evidências no álbum Cowboy do Asfalto, de 1990; a pergunta distingue essa gravação da composição anterior.',
57:'Acabou Chorare é o segundo álbum dos Novos Baianos, lançado em 1972.',
58:'Da Lama ao Caos é o álbum de estreia de Chico Science e Nação Zumbi.',
59:'Ney Matogrosso integrou a formação clássica dos Secos & Molhados, que ganhou projeção em 1973.',
60:'Ary Barroso compôs Aquarela do Brasil em 1939; não foi reproduzida letra ou gravação.',
69:'Buzz Lightyear é o patrulheiro espacial de brinquedo que se torna amigo de Woody.',
70:'Shrek é o ogro verde do pântano e seu companheiro é o Burro.',
71:'Hogwarts é a escola de magia frequentada por Harry Potter.',
72:'Buscapé e Zé Pequeno integram a narrativa do filme Cidade de Deus, de 2002.',
73:'Han Solo e Chewbacca pilotam a Millennium Falcon na saga Star Wars.',
74:'Overlook é o hotel do filme The Shining, lançado no Brasil como O Iluminado.',
75:'Studio Ghibli produziu Meu Amigo Totoro e A Viagem de Chihiro.',
84:'Festas juninas incluem quadrilhas e tradições de fogueiras e alimentos de milho.',
85:'Saci é o personagem de uma perna só e carapuça vermelha do folclore brasileiro.',
86:'Pipa, também chamada papagaio, raia ou pandorga, voa presa a uma linha.',
87:'Monteiro Lobato criou a série de livros do Sítio do Picapau Amarelo.',
88:'MSN Messenger, depois Windows Live Messenger, oferecia nudges, conhecidos no Brasil como chamar a atenção e tremer a janela.',
89:'A cronologia oficial da Tectoy registra Pense Bem em 1988; a referência enciclopédica descreve os livros de atividades.',
90:'Pager é o aparelho de radiomensagens também conhecido como bip ou beeper.'
}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    seeds = json.loads((ROOT / 'content/questions/seeds.json').read_text(encoding='utf-8'))
    provenance = {p['id']: p for p in json.loads((ROOT / 'content/questions/provenance.json').read_text(encoding='utf-8'))}
    catalog = []
    for i, seed in enumerate(seeds):
        evidence = json.loads((CACHE / (seed['id'] + '.json')).read_text(encoding='utf-8'))
        page = evidence['wikipedia']
        assert not page.get('missing') and 'disambiguation' not in page.get('pageprops', {}), seed['id']
        aliases = []
        seen = {normalize(seed['answer'])}
        for alias in seed['aliases']:
            if normalize(alias) not in seen:
                aliases.append(alias)
                seen.add(normalize(alias))
        row = {k: seed[k] for k in ('id', 'category', 'subcategory', 'kind', 'difficulty', 'prompt', 'answer')}
        row.update(aliases=aliases, classification=[seed['category'], seed['subcategory']], status='active',
                   source_url=seed.get('source_override', page['fullurl']).replace('http://','https://'),
                   verified_at=evidence['researched_at'], set_id=seed.get('set_id',f'initial_{i // 15 + 1}' if i < 90 else 'expansion'), image=None)
        row['status'] = seed.get('status', 'active')
        if seed['kind'] == 'text':
            row.update(license='Enunciado original do projeto', rights='Enunciado original produzido para Sabe Essa?; referências culturais usadas para identificação factual, sem reprodução de letras, áudio, roteiros ou imagens protegidas.',
                       attribution='Enunciado original: Kiw1Labs / Sabe Essa?. Fatos conferidos na referência indicada.',
                       verification_note=seed.get('verification_note') or NOTES[int(seed['id'].split('_')[1])])
        else:
            media = provenance[seed['id']]
            row.update(image=media['image'], media_type='image/webp', media_sha256=media['media_sha256'],
                       media_source_url=media['file_page'], license=media['license'], license_url=media['license_url'],
                       author=media['author'], rights=f"{media['license']}; {media['author']}; {media['file_page']}",
                       rights_note=media['rights_note'],
                       attribution=f"{media['title'].removeprefix('File:')} — {media['author']}. {media['license']}. {media['changes']} A versão otimizada mantém essa licença.",
                       verification_note='Identidade/objeto confirmado na descrição do arquivo e por inspeção visual. A imagem local corresponde à fonte licenciada registrada no manifesto de proveniência.')
            if seed['id'] == 'se_0018':
                row['rights_note'] = 'Uso referencial em desafio cultural, conforme seção 3.6.3 da política de marcas da Wikimedia (https://foundation.wikimedia.org/wiki/Policy:Trademark_policy). Logotipo apenas redimensionado, sem alteração do desenho. Sem vínculo ou endosso.'
                row['attribution'] += ' Wikipedia é marca da Wikimedia Foundation; este jogo não é afiliado nem endossado pela fundação.'
        catalog.append(row)
    checked = validate(catalog)
    for set_id in {c.set_id for c in checked}:
        if not set_id.startswith('initial_'):
            continue
        group = [c for c in checked if c.set_id == set_id]
        assert Counter((c.kind,c.difficulty) for c in group) == {('image','easy'):4,('image','medium'):3,('image','hard'):1,('text','easy'):3,('text','medium'):2,('text','hard'):2}
    (ROOT / 'content/questions/catalog.json').write_text(json.dumps(export(checked), ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    active_files = {Path(c.image).name for c in checked if c.image}
    superseded = ROOT / 'artifacts/superseded-media'
    superseded.mkdir(exist_ok=True)
    for path in (ROOT / 'media/questions').iterdir():
        if path.name not in active_files:
            path.rename(superseded / path.name)
    print('Compiled', len(checked), 'real reviewed questions;',len(active_files),'local images;',sum((ROOT/'media/questions'/p).stat().st_size for p in active_files),'bytes')


if __name__ == '__main__':
    main()
