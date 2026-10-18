#!/bin/sh
set -eu
umask 077
cd /root/fun/current
set -a
. /root/fun/shared/fun.env
set +a
exec /root/fun/venv/bin/python -m fun
