#!/usr/bin/env bash
# Space entrypoint: bring up Postgres on the persistent /data bucket, apply
# migrations + seed, then start all processes under supervisord.
set -euo pipefail

PGDATA=/data/pgdata
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | head -n1)"
export PATH="$PGBIN:$PATH"

# Postgres must run as the `postgres` user; ensure it owns its data + buckets.
mkdir -p "$PGDATA" /audio
chown -R postgres:postgres /data /audio

# First boot: initialize the cluster on the persistent volume.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[entrypoint] initializing Postgres cluster at $PGDATA"
  gosu postgres initdb -D "$PGDATA" >/dev/null
  echo "host all all 127.0.0.1/32 trust" >> "$PGDATA/pg_hba.conf"
  echo "listen_addresses='127.0.0.1'" >> "$PGDATA/postgresql.conf"
fi

echo "[entrypoint] starting Postgres"
gosu postgres pg_ctl -D "$PGDATA" -w -o "-p 5432" start

# Ensure the role + database exist (idempotent).
gosu postgres psql -p 5432 -tAc "SELECT 1 FROM pg_roles WHERE rolname='arena'" \
  | grep -q 1 || gosu postgres psql -p 5432 -c "CREATE ROLE arena LOGIN PASSWORD 'arena' SUPERUSER"
gosu postgres psql -p 5432 -tAc "SELECT 1 FROM pg_database WHERE datname='tts_arena'" \
  | grep -q 1 || gosu postgres createdb -p 5432 -O arena tts_arena

export DATABASE_URL="postgresql://arena:arena@127.0.0.1:5432/tts_arena"
export AUDIO_LOG_DIR="/audio"

echo "[entrypoint] applying migrations + seed"
cd /app/apps/web
bunx drizzle-kit migrate || echo "[entrypoint] migrate reported an issue (continuing)"
bun run src/server/db/seed.ts || echo "[entrypoint] seed reported an issue (continuing)"
cd /app

echo "[entrypoint] handing off to supervisord"
exec supervisord -n -c /etc/supervisor/conf.d/tts-arena.conf
