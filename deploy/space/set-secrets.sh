#!/usr/bin/env bash
# Sync deployment secrets onto the HF Space via the Hub API. Only non-empty
# values are pushed, so secrets you haven't set in GitHub are left untouched on
# the Space. Requires HF_TOKEN (write) in the environment.
#
#   HF_TOKEN=... ./set-secrets.sh OWNER/SPACE
set -euo pipefail

REPO="${1:?usage: set-secrets.sh OWNER/SPACE}"
API="https://huggingface.co/api/spaces/${REPO}/secrets"

set_secret() {
  local key="$1" val="$2"
  [ -z "$val" ] && return 0
  echo "  setting secret: $key"
  curl -sf -X POST "$API" \
    -H "Authorization: Bearer ${HF_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"key":"%s","value":%s}' "$key" "$(printf '%s' "$val" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
    >/dev/null
}

echo "[set-secrets] syncing secrets to ${REPO}"

# Provider keys + arena config. Values come from the CI environment (GitHub
# secrets). SESSION_SECRET / OAuth are NOT set here — the Space uses its native
# Hugging Face OAuth.
set_secret ELEVENLABS_API_KEY "${ELEVENLABS_API_KEY:-}"
set_secret MINIMAX_API_KEY "${MINIMAX_API_KEY:-}"
set_secret MINIMAX_GROUP_ID "${MINIMAX_GROUP_ID:-}"
set_secret ROUTER_API_KEY "${ROUTER_API_KEY:-}"
set_secret ADMIN_USERS "${ADMIN_USERS:-}"
set_secret PROVIDER_PLUGINS "${PROVIDER_PLUGINS:-}"

echo "[set-secrets] done"
