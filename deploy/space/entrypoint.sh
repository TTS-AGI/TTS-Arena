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
# Postgres refuses to start unless the data dir is exactly 0700 (or 0750). The
# persistent bucket can mount with looser perms, so enforce it every boot.
chmod 700 "$PGDATA"

# First boot: initialize the cluster on the persistent volume.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[entrypoint] initializing Postgres cluster at $PGDATA"
  gosu postgres initdb -D "$PGDATA" >/dev/null
  echo "host all all 127.0.0.1/32 trust" >> "$PGDATA/pg_hba.conf"
  echo "listen_addresses='127.0.0.1'" >> "$PGDATA/postgresql.conf"
fi

# A hard container stop can leave a stale lock file that makes pg_ctl think a
# server is still running. Remove it if no process actually holds the port.
if [ -f "$PGDATA/postmaster.pid" ] && ! gosu postgres pg_isready -p 5432 -q; then
  echo "[entrypoint] removing stale postmaster.pid"
  rm -f "$PGDATA/postmaster.pid"
fi

# The persistent bucket sync drops empty directories, but Postgres needs its
# ephemeral runtime subdirs to exist or it FATALs ("could not open directory
# pg_notify"). Recreate any that are missing (they're meant to be empty).
echo "[entrypoint] ensuring runtime subdirectories exist"
for d in \
  pg_notify pg_stat_tmp pg_serial pg_subtrans pg_snapshots pg_commit_ts \
  pg_twophase pg_replslot pg_tblspc pg_wal/archive_status \
  pg_logical pg_logical/snapshots pg_logical/mappings; do
  mkdir -p "$PGDATA/$d"
done
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

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
