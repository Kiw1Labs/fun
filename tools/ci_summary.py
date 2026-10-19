"""Gera um resumo em pt-BR para execuções do GitHub Actions."""
import os
from pathlib import Path


STEPS = (
    ('checkout', 'Baixar o código', 'O runner não conseguiu preparar os arquivos do repositório.'),
    ('python', 'Preparar Python 3.11', 'O runner não conseguiu configurar o Python esperado.'),
    ('node', 'Preparar Node.js 22', 'O runner não conseguiu configurar o Node.js esperado.'),
    ('deps_prod', 'Instalar dependências do servidor',
     'Falhou a instalação dos pacotes fixados para o servidor. Confira o erro do pip nesta etapa.'),
    ('deps_dev', 'Instalar ferramentas de teste',
     'Falhou a instalação de pytest, Ruff ou outras ferramentas de desenvolvimento. Confira o erro do pip.'),
    ('npm_ci', 'Instalar dependências da interface',
     'O npm não conseguiu instalar as dependências declaradas no lockfile.'),
    ('frontend', 'Conferir e compilar a interface',
     'A verificação JavaScript ou a compilação da interface encontrou um erro.'),
    ('ruff', 'Verificar qualidade do Python',
     'O Ruff encontrou problemas de estilo ou erros estáticos no Python.'),
    ('pytest', 'Executar testes Python',
     'Um ou mais testes Python falharam. O log mostra o arquivo, o teste e a asserção que não passou.'),
    ('chromium', 'Instalar Chromium para os testes',
     'O runner não conseguiu instalar o Chromium e seus requisitos de sistema.'),
    ('browser', 'Testar o jogo em navegadores',
     'Um cenário de navegador falhou. O log identifica o cenário e a verificação que deu errado.'),
    ('dev', 'Testar o servidor de desenvolvimento',
     'O teste de inicialização, atualização ou encerramento do servidor local falhou.'),
    ('catalog', 'Testar o catálogo',
     'A validação do catálogo ou da partida de teste falhou.'),
)


def render_summary(outcomes):
    lines = ['## Relatório de testes do Fun', '']
    failed = []
    skipped = []
    for key, title, explanation in STEPS:
        outcome = outcomes.get(key, 'skipped')
        if outcome == 'success':
            lines.append(f'- **{title}:** passou.')
        elif outcome == 'failure':
            failed.append((title, explanation))
            lines.append(f'- **{title}:** falhou.')
        else:
            skipped.append(title)
            lines.append(f'- **{title}:** não executado (uma etapa anterior falhou ou foi cancelada).')

    lines.append('')
    if failed:
        lines.extend(['### O que deu errado', ''])
        lines.extend(f'- **{title}:** {explanation}' for title, explanation in failed)
        lines.extend(['', 'Abra a etapa marcada como falha para ver a saída completa, incluindo o comando e a mensagem técnica. As etapas não executadas não chegaram a rodar.'])
    elif skipped:
        lines.extend(['**Não foi registrada falha nas etapas executadas, mas a validação não terminou.**', ''])
        lines.append('Etapas que não rodaram: ' + ', '.join(skipped) + '.')
    else:
        lines.extend(['**Todas as etapas de verificação passaram.**', ''])
    return '\n'.join(lines) + '\n'


def main():
    outcomes = {
        key: os.environ.get(f'OUTCOME_{key.upper()}', 'skipped')
        for key, _, _ in STEPS
    }
    summary = render_summary(outcomes)
    destination = os.environ.get('GITHUB_STEP_SUMMARY')
    if destination:
        with Path(destination).open('a', encoding='utf-8') as report:
            report.write(summary)
    else:
        print(summary, end='')


if __name__ == '__main__':
    main()
