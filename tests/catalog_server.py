"""Servidor de integração isolado com catálogo real; nunca empacotado para produção."""
import os
from pathlib import Path
import time

import uvicorn
from starlette.responses import JSONResponse
from starlette.routing import Route

from fun.app import create_app
from tools.import_catalog import import_database

ROOT = Path(__file__).resolve().parents[1]


def app():
    import_database(ROOT/'content/questions/catalog.json', Path(os.environ['FUN_DATABASE']), ROOT/'media', Path(os.environ['FUN_MEDIA']))
    offset = [0.0]
    epoch, monotonic = time.time(), time.monotonic()
    application = create_app(clock=lambda:epoch + time.monotonic()-monotonic+offset[0])
    async def advance(request):
        if request.headers.get('origin') != os.environ['FUN_ORIGINS']:
            return JSONResponse({'error':'Origem inválida'},status_code=403)
        seconds=(await request.json()).get('seconds')
        if not isinstance(seconds,(int,float)) or not 0 < seconds <= 25:
            return JSONResponse({'error':'Intervalo inválido'},status_code=400)
        offset[0]+=seconds
        return JSONResponse({'advanced':seconds})
    application.router.routes.insert(0,Route('/_catalog_test/advance',advance,methods=['POST']))
    return application


if __name__ == '__main__':
    uvicorn.run('tests.catalog_server:app',factory=True,host='127.0.0.1',port=15056,ws='websockets-sansio',access_log=False)
