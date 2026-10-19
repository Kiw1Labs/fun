from tools.ci_summary import STEPS, render_summary


def test_failure_summary_explains_failed_and_skipped_steps_in_portuguese():
    summary = render_summary({
        'checkout': 'success',
        'deps_prod': 'success',
        'deps_dev': 'failure',
        'npm_ci': 'skipped',
        'pytest': 'skipped',
    })

    assert '## Relatório de testes do Fun' in summary
    assert '### O que deu errado' in summary
    assert 'Instalar ferramentas de teste:** falhou' in summary
    assert 'Falhou a instala\u00e7\u00e3o de pytest' in summary
    assert 'Executar testes Python:** n\u00e3o executado' in summary


def test_success_summary_is_in_portuguese():
    summary = render_summary({key: 'success' for key, _, _ in STEPS})

    assert 'Todas as etapas de verifica\u00e7\u00e3o passaram.' in summary
    assert 'Executar testes Python:** passou' in summary
