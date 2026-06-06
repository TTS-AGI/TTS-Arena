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

# DB lives on the persistent bucket (network-backed). We use a rollback journal
# (DELETE mode), NOT WAL — WAL's mmap'd -wal/-shm sidecars get out of sync on
# networked storage and corrupt the file ("database disk image is malformed").
export SQLITE_PATH="/data/tts_arena.db"
export AUDIO_LOG_DIR="/audio"

# Drop any stale WAL sidecars left over from the old WAL config — if the app no
# longer opens in WAL mode, a leftover -wal/-shm can confuse recovery.
rm -f "${SQLITE_PATH}-wal" "${SQLITE_PATH}-shm" 2>/dev/null || true

# Integrity guard: if the DB file exists but is corrupt, salvage what's readable
# into a fresh file via sqlite3 .recover, keeping a timestamped copy of the
# corrupt original. Better to come back up with the recoverable rows than to
# loop on a malformed file. No-op when the DB is healthy or absent.
if [ -f "$SQLITE_PATH" ]; then
  check="$(sqlite3 "$SQLITE_PATH" 'PRAGMA integrity_check;' 2>&1 | head -1 || echo "error")"
  if [ "$check" != "ok" ]; then
    echo "[entrypoint] !!! DB integrity check failed ($check) — attempting recovery" >&2
    ts="$(date -u +%Y%m%d%H%M%S)"
    cp -f "$SQLITE_PATH" "${SQLITE_PATH}.corrupt-${ts}" 2>/dev/null || true
    if sqlite3 "$SQLITE_PATH" ".recover" 2>/dev/null | sqlite3 "${SQLITE_PATH}.recovered-${ts}" 2>/dev/null \
       && [ -s "${SQLITE_PATH}.recovered-${ts}" ]; then
      mv -f "${SQLITE_PATH}.recovered-${ts}" "$SQLITE_PATH"
      rm -f "${SQLITE_PATH}-wal" "${SQLITE_PATH}-shm" 2>/dev/null || true
      echo "[entrypoint] recovery succeeded; corrupt original kept at ${SQLITE_PATH}.corrupt-${ts}" >&2
    else
      echo "[entrypoint] !!! recovery FAILED — leaving original in place for manual inspection" >&2
    fi
  else
    echo "[entrypoint] DB integrity check: ok"
  fi
fi

echo "[entrypoint] applying migrations + seed (SQLite at $SQLITE_PATH)"
cd /app/apps/web
# Apply migrations with bun:sqlite (drizzle-kit's migrate loads better-sqlite3,
# whose native binary doesn't work under Bun here).
# Migrations are required — a half-migrated DB breaks features (e.g. the
# security tables/columns). Log loudly but don't hard-exit the container, so the
# app still boots and the error is visible in the logs for diagnosis.
if ! bun run src/server/db/migrate.ts; then
  echo "[entrypoint] !!! MIGRATION FAILED — DB schema may be out of date" >&2
fi
bun run src/server/db/seed.ts || echo "[entrypoint] seed reported an issue (continuing)"
cd /app

echo "[entrypoint] handing off to supervisord"
exec supervisord -n -c /etc/supervisor/conf.d/tts-arena.conf
