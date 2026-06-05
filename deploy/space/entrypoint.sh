#!/usr/bin/env bash
# Space entrypoint: ensure the persistent buckets exist, apply migrations + seed
# against the SQLite file, then start all processes under supervisord.
#
# The database is a single SQLite file on the /data bucket. Unlike Postgres'
# multi-file data directory (which the bucket sync silently corrupted), one file
# survives the bucket round-trip cleanly.
set -euo pipefail

# Persistent buckets: /data holds the DB, /audio holds logged generations.
mkdir -p /data /audio

# DB lives on the persistent bucket. WAL sidecar files (-wal, -shm) live next to
# it; they're checkpointed into the main file so a restart loses nothing.
export SQLITE_PATH="/data/tts_arena.db"
export AUDIO_LOG_DIR="/audio"

echo "[entrypoint] applying migrations + seed (SQLite at $SQLITE_PATH)"
cd /app/apps/web
# Apply migrations with bun:sqlite (drizzle-kit's migrate loads better-sqlite3,
# whose native binary doesn't work under Bun here).
bun run src/server/db/migrate.ts || echo "[entrypoint] migrate reported an issue (continuing)"
bun run src/server/db/seed.ts || echo "[entrypoint] seed reported an issue (continuing)"
cd /app

echo "[entrypoint] handing off to supervisord"
exec supervisord -n -c /etc/supervisor/conf.d/tts-arena.conf
