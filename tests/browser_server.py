"""Servidor isolado de fixtures; nunca incluído no pacote de produção."""
import os
import time
from pathlib import Path

import uvicorn
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from fun.app import create_app
from fun.admin_accounts import accounts_path
from tools.add_admin import add_user
from tests.fixtures import synthetic_catalog
from tests.metrics import metrics


def app():
    if os.getenv('FUN_TEST_MULTI_ADMIN') == '1':
        add_user(accounts_path(), 'browser-second', 'browser-second-password')
        add_user(accounts_path(), 'browser-third', 'browser-third-password')
    catalog = synthetic_catalog() if os.getenv('FUN_TEST_FIXTURES') == '1' else []
    epoch, monotonic, offset = time.time(), time.monotonic(), [0]
    frozen = bool(catalog) and os.getenv('FUN_TEST_FROZEN_CLOCK') == '1'
    application = create_app(catalog=catalog, clock=lambda: epoch + (0 if frozen else time.monotonic() - monotonic) + offset[0])
    async def process_metrics(request):
        return JSONResponse(metrics())
    application.router.routes.insert(0, Route('/_fixture_metrics', process_metrics))
    if catalog:
        async def advance(request):
            if request.headers.get('origin') != os.environ['FUN_ORIGINS']:
                return JSONResponse({'error': 'Origem inválida.'}, status_code=403)
            seconds = (await request.json()).get('seconds')
            if not isinstance(seconds, (int, float)) or not 0 < seconds <= 3600:
                return JSONResponse({'error': 'Intervalo inválido.'}, status_code=400)
            offset[0] += seconds
            return JSONResponse({'advanced': seconds})
        application.router.routes.insert(0, Route('/_fixture/advance', advance, methods=['POST']))
        async def image(request):
            # SVG artificial somente na rota do servidor de teste, sem arquivos em produção.
            return Response('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#e6edde"/><text x="80" y="130" font-size="32">FIXTURE DE TESTE</text></svg>', media_type='image/svg+xml')
        application.router.routes.insert(0, Route('/media/{name}', image))
        Path(os.environ['FUN_TEST_ANSWERS']).write_text(__import__('json').dumps({c.id: c.answer for c in catalog}), encoding='utf-8')
    return application


if __name__ == '__main__':
    uvicorn.run('tests.browser_server:app', factory=True, host='127.0.0.1', port=int(os.getenv('FUN_PORT', '15050')),
                ws='websockets-sansio', ws_max_size=4096, access_log=False)
