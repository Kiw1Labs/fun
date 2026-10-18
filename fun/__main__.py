import os
from pathlib import Path

import uvicorn

if __name__ == '__main__':
    os.umask(0o077)
    log_path = os.getenv('FUN_LOG')
    log_config = None
    if log_path:
        Path(log_path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        log_config = {
            'version': 1, 'disable_existing_loggers': False,
            'formatters': {'default': {'format': '%(asctime)s %(levelname)s %(name)s %(message)s'}},
            'handlers': {'rotating': {'class': 'logging.handlers.RotatingFileHandler',
                                      'filename': log_path, 'maxBytes': 1_000_000, 'backupCount': 5,
                                      'formatter': 'default', 'encoding': 'utf-8'}},
            'root': {'handlers': ['rotating'], 'level': 'INFO'},
            'loggers': {'uvicorn': {'handlers': ['rotating'], 'level': 'INFO', 'propagate': False}},
        }
    uvicorn.run('fun.app:create_app', factory=True, host='127.0.0.1',
                port=int(os.getenv('FUN_PORT', '5050')), workers=1,
                ws='websockets-sansio', ws_max_size=4096, ws_max_queue=16,
                ws_ping_interval=15, ws_ping_timeout=20,
                proxy_headers=True, forwarded_allow_ips='127.0.0.1', access_log=False,
                **({'log_config': log_config} if log_config else {}))
