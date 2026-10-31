#!/usr/bin/env bash
# Space entrypoint: apply DB migrations against the Postgres server, then start
# all processes under supervisord.
#
# The database is Postgres on a VPS, reached DIRECTLY over a TLS connection
# (DATABASE_URL, sslmode=require). No tunnel client runs in the Space — an
# in-Space tunnel got the Space flagged as abusive. (We're also off SQLite — a
# single file on HF's network bucket kept corrupting under bun:sqlite.)
#
# Privileges: nothing app-related runs as root. If the container starts as
# root, root is used only to prepare the /audio bucket mount; migrations run as
# `app` via setpriv, and supervisord (which must stay root to reopen
# /dev/stdout for log forwarding) starts every program with user=app. If the
# container starts as uid 1000 directly, everything simply runs as that user.
set -euo pipefail

APP_USER=app
APP_HOME=/home/app
export HOME="$APP_HOME"

# Run a command as the app user (a no-op wrapper when already non-root).
as_app() {
  if [ "$(id -u)" = "0" ]; then
    setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups \
      env HOME="$APP_HOME" USER="$APP_USER" LOGNAME="$APP_USER" "$@"
  else
    "$@"
  fi
}

# /audio is a persistent bucket for logged generation audio. The mount may be
# root-owned at runtime, so as root, (re)create it and hand it to the app user.
AUDIO_LOG_DIR="/audio"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$AUDIO_LOG_DIR" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$AUDIO_LOG_DIR" 2>/dev/null \
    || echo "[entrypoint] could not chown $AUDIO_LOG_DIR (continuing)" >&2
else
  mkdir -p "$AUDIO_LOG_DIR" 2>/dev/null || true
fi
# If the app user still can't write there, fall back to a local (ephemeral) dir
# rather than failing every audio log write.
if ! as_app test -w "$AUDIO_LOG_DIR"; then
  echo "[entrypoint] !!! $AUDIO_LOG_DIR is not writable by $APP_USER;" \
    "logging audio to /app/var/audio-log (NOT persistent)" >&2
  AUDIO_LOG_DIR="/app/var/audio-log"
fi
export AUDIO_LOG_DIR

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] !!! DATABASE_URL is not set — the app cannot reach its DB" >&2
fi

echo "[entrypoint] applying migrations (Postgres)"
cd /app/apps/web
if ! as_app bun run src/server/db/migrate.ts; then
  echo "[entrypoint] !!! MIGRATION FAILED — DB schema may be out of date" >&2
fi
as_app bun run src/server/db/seed.ts \
  || echo "[entrypoint] seed reported an issue (continuing)"
cd /app

echo "[entrypoint] handing off to supervisord (programs run as $APP_USER)"
if [ "$(id -u)" = "0" ]; then
  # -u root only silences supervisord's "running as root" warning; the
  # programs themselves drop to user=app (see supervisord.conf).
  exec supervisord -n -u root -c /etc/supervisor/conf.d/tts-arena.conf
fi
exec supervisord -n -c /etc/supervisor/conf.d/tts-arena.conf
