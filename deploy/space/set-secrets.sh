#!/usr/bin/env bash
# Sync deployment secrets onto the HF Space via the Hub API. Only non-empty
# values are pushed, and secrets already set on the Space are skipped (to avoid
# HF's 429 rate limit). Provider names are NOT hardcoded here: the full set of
# repo secrets arrives as a JSON blob in $ALL_SECRETS (GitHub's
# toJSON(secrets)), and everything except an infra-only exclude-list is synced.
#
# Requires HF_TOKEN (write) and ALL_SECRETS (JSON) in the environment.
#
#   HF_TOKEN=... ALL_SECRETS='{"K":"v",...}' ./set-secrets.sh OWNER/SPACE
set -euo pipefail

REPO="${1:?usage: set-secrets.sh OWNER/SPACE}"
API="https://huggingface.co/api/spaces/${REPO}/secrets"

# Set non-empty SYNC_SECRETS_FORCE to push every secret even if already present.
FORCE="${SYNC_SECRETS_FORCE:-}"

# Fetch the keys already set on the Space so we can skip them. The HF API only
# returns key names (not values), which is enough to avoid re-pushing unchanged
# secrets — re-pushing all of them on every deploy is what trips HF's 429 rate
# limit. On any error we just treat the set as empty (push everything).
#
# Prefer huggingface_hub (the documented API: get_space_secrets returns a dict
# keyed by secret name); fall back to the REST endpoint, parsing whichever shape
# it returns (dict keyed by name, a list, or {secrets:[...]}).
EXISTING="$(REPO="$REPO" HF_TOKEN="$HF_TOKEN" python3 - <<'PY' 2>/dev/null || true
import os, sys
repo, token = os.environ["REPO"], os.environ["HF_TOKEN"]
keys = []
try:
    from huggingface_hub import HfApi
    keys = list(HfApi(token=token).get_space_secrets(repo_id=repo).keys())
except Exception:
    try:
        import json, urllib.request
        req = urllib.request.Request(
            f"https://huggingface.co/api/spaces/{repo}/secrets",
            headers={"Authorization": f"Bearer {token}"},
        )
        d = json.load(urllib.request.urlopen(req, timeout=15))
        if isinstance(d, dict):
            items = d.get("secrets", d.get("data"))
            keys = (
                list(d.keys())
                if items is None
                else [s.get("key", "") for s in items if isinstance(s, dict)]
            )
        elif isinstance(d, list):
            keys = [s.get("key", "") for s in d if isinstance(s, dict)]
    except Exception:
        keys = []
print("\n".join(k for k in keys if k))
PY
)"

is_set() {
  [ -z "$FORCE" ] || return 1
  printf '%s\n' "$EXISTING" | grep -qx "$1"
}

# Tracks whether any secret hit a non-fatal failure (e.g. exhausted 429
# retries). The caller decides whether that should fail the deploy.
RATE_LIMITED=0

set_secret() {
  local key="$1" val="$2"
  [ -z "$val" ] && return 0
  if is_set "$key"; then
    echo "  skipping $key (already set)"
    return 0
  fi
  echo "  setting secret: $key"
  # Build the JSON body with python so the value is safely escaped (a stray
  # quote/newline in a key would otherwise produce malformed JSON).
  local body
  body="$(KEY="$key" VAL="$val" python3 -c 'import json,os; print(json.dumps({"key":os.environ["KEY"],"value":os.environ["VAL"]}))')"

  # Retry on transient failures (429 rate-limit, 5xx) with exponential backoff.
  # Capture the HTTP status separately from the body so real errors are reported
  # (curl -f hides the response body, which makes 4xx/5xx undebuggable).
  local attempt status resp body_out delay=5
  for attempt in 1 2 3 4 5 6; do
    resp="$(curl -sS -X POST "$API" \
      -H "Authorization: Bearer ${HF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -w '\n%{http_code}' || true)"
    status="${resp##*$'\n'}"
    body_out="${resp%$'\n'*}"
    [[ "$status" =~ ^[0-9]+$ ]] || status=0

    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
      return 0
    fi
    # Auth/permission/validation errors won't fix themselves — fail fast.
    if [ "$status" -eq 401 ] || [ "$status" -eq 403 ] || [ "$status" -eq 400 ]; then
      echo "    ERROR ($status): $body_out" >&2
      return 1
    fi
    echo "    attempt $attempt failed ($status) — retrying in ${delay}s" >&2
    sleep "$delay"
    delay=$((delay * 2))
  done
  echo "    WARN: giving up on $key after retries (last status $status)" >&2
  RATE_LIMITED=1
  return 0
}

echo "[set-secrets] syncing secrets to ${REPO}"

# Sync every GitHub repo secret to the Space, EXCEPT infra-only ones that must
# not leak into the Space's runtime. Provider names (public or private) are NOT
# enumerated here, so this public script reveals nothing about which providers
# exist — new providers are picked up automatically by adding a repo secret.
#
# Secrets arrive as one JSON blob in $ALL_SECRETS (GitHub's toJSON(secrets)).
# Keys are read with python; values are passed via env to set_secret so they're
# never interpolated into the command line.
# Note: PRIVATE_PROVIDERS_TOKEN IS synced — the Space's Docker build mounts it
# as a build secret (RUN --mount=type=secret,id=PRIVATE_PROVIDERS_TOKEN) to
# clone the private providers. HF_TOKEN/github_token stay out (deploy infra).
EXCLUDE_RE='^(github_token|HF_TOKEN|PRIVATE_PROVIDERS_REPO|SYNC_SECRETS_FORCE)$'

if [ -z "${ALL_SECRETS:-}" ]; then
  echo "[set-secrets] ALL_SECRETS is empty; nothing to sync" >&2
else
  # Emit the secret keys to sync (one per line), excluding the infra-only set.
  KEYS="$(ALL_SECRETS="$ALL_SECRETS" EXCLUDE_RE="$EXCLUDE_RE" python3 - <<'PY'
import json, os, re
exclude = re.compile(os.environ["EXCLUDE_RE"])
try:
    secrets = json.loads(os.environ["ALL_SECRETS"])
except Exception:
    secrets = {}
for k in secrets:
    if not exclude.match(k):
        print(k)
PY
)"
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    # Pull this secret's value out of the JSON blob (kept out of argv).
    val="$(ALL_SECRETS="$ALL_SECRETS" KEY="$key" python3 -c 'import json,os; print(json.loads(os.environ["ALL_SECRETS"]).get(os.environ["KEY"],""), end="")')"
    set_secret "$key" "$val"
  done <<<"$KEYS"
fi

if [ "$RATE_LIMITED" = "1" ]; then
  echo "[set-secrets] done with warnings: some secrets were rate-limited (429)." >&2
  echo "[set-secrets] they're left as-is on the Space; re-run later to update them." >&2
else
  echo "[set-secrets] done"
fi
