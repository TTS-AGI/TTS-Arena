#!/usr/bin/env bash
# Leak guard: the public repo must only ever carry the anti-fraud STUB.
#
# The real detection logic lives in the private repo (TTS-AGI/Antifraud) and is
# cloned over apps/web/src/server/antifraud/impl during the Space's Docker
# build. If someone develops against a local clone of the private repo and
# commits by accident, the tactics leak publicly and can't be un-leaked.
#
# So: every .ts file under impl/ must carry the @antifraud-stub marker, the
# directory must stay tiny, and no extra source files may appear there.
set -euo pipefail

DIR="apps/web/src/server/antifraud/impl"
MARKER="@antifraud-stub"
MAX_LINES=40 # a stub file is ~12 lines; the real impl is hundreds
ALLOWED="assess.ts config.ts sweep.ts collector.ts ingest.ts README.md"

fail=0
note() {
  echo "::error file=${1}::${2}"
  echo "LEAK GUARD: ${1}: ${2}" >&2
  fail=1
}

[ -d "$DIR" ] || {
  echo "LEAK GUARD: ${DIR} is missing" >&2
  exit 1
}

for path in "$DIR"/*; do
  name="$(basename "$path")"
  case " $ALLOWED " in
  *" $name "*) ;;
  *) note "$path" "unexpected file in the stub dir — private detection code must not be committed" ;;
  esac
done

for name in assess.ts config.ts sweep.ts collector.ts ingest.ts; do
  path="$DIR/$name"
  [ -f "$path" ] || {
    note "$path" "missing stub file"
    continue
  }
  grep -q "$MARKER" "$path" ||
    note "$path" "missing the ${MARKER} marker — this looks like the real implementation"
  lines="$(wc -l <"$path" | tr -d ' ')"
  [ "$lines" -le "$MAX_LINES" ] ||
    note "$path" "${lines} lines (max ${MAX_LINES}) — this looks like the real implementation"
done

if [ "$fail" = "1" ]; then
  echo >&2
  echo "The public repo ships permissive stubs only. Edit TTS-AGI/Antifraud instead." >&2
  exit 1
fi
echo "anti-fraud stub guard: ok"
