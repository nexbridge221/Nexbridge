#!/usr/bin/env bash
# Démarre / arrête PostgreSQL et Redis de développement (données dans .nexbridge-local/, ignoré par Git).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/env.sh"
DATA="$ROOT/.nexbridge-local"
PGDATA="$DATA/postgres"
PGPORT="${PGPORT:-5433}"
REDIS_PORT="${REDIS_PORT:-6380}"
mkdir -p "$DATA"

start() {
  if [ ! -d "$PGDATA" ]; then
    initdb -D "$PGDATA" -U nexbridge --auth=trust -E UTF8 --locale=C >/dev/null
    echo "Base PostgreSQL initialisée."
  fi
  pg_ctl -D "$PGDATA" status >/dev/null 2>&1 || pg_ctl -D "$PGDATA" -o "-p $PGPORT -c listen_addresses=127.0.0.1" -l "$DATA/postgres.log" start >/dev/null
  createdb -h 127.0.0.1 -p "$PGPORT" -U nexbridge nexbridge 2>/dev/null || true
  createdb -h 127.0.0.1 -p "$PGPORT" -U nexbridge nexbridge_test 2>/dev/null || true
  redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1 || redis-server --port "$REDIS_PORT" --bind 127.0.0.1 --daemonize yes --dir "$DATA" --save "" --appendonly no --logfile "$DATA/redis.log" >/dev/null
  status
}
stop() {
  pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
  redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
  echo "Services arrêtés."
}
status() {
  pg_ctl -D "$PGDATA" status >/dev/null 2>&1 && echo "PostgreSQL : en marche (127.0.0.1:$PGPORT)" || echo "PostgreSQL : arrêté"
  redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1 && echo "Redis      : en marche (127.0.0.1:$REDIS_PORT)" || echo "Redis      : arrêté"
}
"${1:-status}"
