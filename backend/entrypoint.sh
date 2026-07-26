#!/bin/sh
set -e
MAX_WAIT=30
i=0
while [ ! -f /app/package.json ] && [ "$i" -lt "$MAX_WAIT" ]; do
  echo "[entrypoint] Waiting for /app/package.json... ${i}s"
  sleep 1
  i=$((i + 1))
done
if [ ! -f /app/package.json ]; then
  echo "[entrypoint] FATAL: /app/package.json still missing after ${MAX_WAIT}s."
  exit 1
fi
echo "[entrypoint] package.json found after ${i}s, starting app."
exec "$@"
