#!/usr/bin/env bash
# Space entrypoint: apply DB migrations against the Postgres server, then start
# all processes under supervisord.
#
# The database is Postgres on a VPS, reached DIRECTLY over a TLS connection
# (DATABASE_URL, sslmode=require). No tunnel client runs in the Space — an
# in-Space tunnel got the Space flagged as abusive. (We're also off SQLite — a
# single file on HF's network bucket kept corrupting under bun:sqlite.)
set -euo pipefail

# /audio remains a persistent bucket for logged generation audio.
mkdir -p /audio
export AUDIO_LOG_DIR="/audio"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] !!! DATABASE_URL is not set — the app cannot reach its DB" >&2
fi

echo "[entrypoint] applying migrations (Postgres)"
cd /app/apps/web
if ! bun run src/server/db/migrate.ts; then
  echo "[entrypoint] !!! MIGRATION FAILED — DB schema may be out of date" >&2
fi
bun run src/server/db/seed.ts || echo "[entrypoint] seed reported an issue (continuing)"
cd /app

echo "[entrypoint] handing off to supervisord"
exec supervisord -n -c /etc/supervisor/conf.d/tts-arena.conf
