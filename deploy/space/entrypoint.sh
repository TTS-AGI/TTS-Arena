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

# Integrity guard. Two failure modes have bitten us on the networked bucket:
#   1. the file is outright malformed (integrity_check fails), and
#   2. integrity_check says "ok" yet specific INDEXED queries still throw
#      "database disk image is malformed" — a corrupt index page that the
#      high-level check doesn't flag.
# So: if integrity_check fails, salvage via .recover. Then ALWAYS rebuild
# indexes and rewrite the file (REINDEX + VACUUM) — cheap on a small DB and the
# reliable fix for case 2. A successful VACUUM produces a clean, defragmented
# file with freshly built indexes.
if [ -f "$SQLITE_PATH" ]; then
  ts="$(date -u +%Y%m%d%H%M%S)"
  rm -f "${SQLITE_PATH}-wal" "${SQLITE_PATH}-shm" 2>/dev/null || true

  # REINDEX + VACUUM was not enough (integrity_check=ok and VACUUM=ok, yet the
  # app's indexed queries still threw "malformed"). So rebuild the DB the
  # thorough way: dump the whole thing to SQL and reload into a fresh file. This
  # discards every page/index/b-tree and reconstructs them from the row data via
  # the schema — the strongest file-level repair short of manual surgery.
  #
  # Prefer .dump (lossless when the DB is readable); fall back to .recover
  # (salvages a genuinely corrupt file). Whatever lands, it's a brand-new file.
  rebuilt=""
  if sqlite3 "$SQLITE_PATH" ".dump" 2>/dev/null | sqlite3 "${SQLITE_PATH}.rebuilt-${ts}" 2>/dev/null \
     && [ -s "${SQLITE_PATH}.rebuilt-${ts}" ] \
     && [ "$(sqlite3 "${SQLITE_PATH}.rebuilt-${ts}" 'PRAGMA integrity_check;' 2>&1 | head -1)" = "ok" ]; then
    rebuilt="dump"
  elif sqlite3 "$SQLITE_PATH" ".recover" 2>/dev/null | sqlite3 "${SQLITE_PATH}.rebuilt-${ts}" 2>/dev/null \
     && [ -s "${SQLITE_PATH}.rebuilt-${ts}" ]; then
    rebuilt="recover"
  fi

  if [ -n "$rebuilt" ]; then
    cp -f "$SQLITE_PATH" "${SQLITE_PATH}.prerebuild-${ts}" 2>/dev/null || true
    mv -f "${SQLITE_PATH}.rebuilt-${ts}" "$SQLITE_PATH"
    rm -f "${SQLITE_PATH}-wal" "${SQLITE_PATH}-shm" 2>/dev/null || true
    sqlite3 "$SQLITE_PATH" 'PRAGMA journal_mode=DELETE;' >/dev/null 2>&1 || true
    echo "[entrypoint] DB rebuilt via .$rebuilt (pre-rebuild copy at ${SQLITE_PATH}.prerebuild-${ts})"
  else
    rm -f "${SQLITE_PATH}.rebuilt-${ts}" 2>/dev/null || true
    echo "[entrypoint] !!! DB rebuild FAILED — leaving file as-is" >&2
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
