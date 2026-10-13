#!/usr/bin/env bash
# =============================================================================
# monitor/heal-bodies.sh — recover kit JS samples from urlscan's response store.
#   URLSCAN_KEY=... bash monitor/heal-bodies.sh      (no key → clean no-op)
#
# Every body is fetched straight to a file and archived only if
# sha256(decoded body) == its urlscan content hash (monitor/kit-body.js), so a
# truncated or mangled download can never land in kit-source/. Phases:
#   1. heal      — re-fetch archived raw bodies that fail verification (the
#                  pre-2026-10-13 NUL-stripping bug in check.sh).
#   2. missing   — fetch fingerprints.txt hashes that have no archived body.
#   3. snapshot  — (HEAL_SNAPSHOT=N, default 0) archive every /_next/static/chunks
#                  JS body of the N newest confirmed kit scans in findings.csv,
#                  so a complete current build is available for version diffing.
# Only urlscan.io is contacted (stored scan data); kit infrastructure is never
# touched. HEAL_MAX caps fetches per run (default 25) to respect the API quota.
# =============================================================================
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MON="$ROOT/monitor"
RAW="$ROOT/kit-source/raw_bodies"
DEC="$ROOT/kit-source/decompressed"
LOG="${HEAL_LOG:-$MON/monitor.log}"
MAX="${HEAL_MAX:-25}"
SNAP="${HEAL_SNAPSHOT:-0}"
TS="$(date -u +%FT%TZ)"
UA="marketplace-phaas-tracker (research; +github)"
[ -n "${URLSCAN_KEY:-}" ] || { echo "heal-bodies: no URLSCAN_KEY, skipping"; exit 0; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$RAW" "$DEC"

us_get() {  # $1 = URL, $2 = output file. Never capture bodies with $(...) — it drops 0x00 bytes.
  curl -fsS --max-time 30 -A "$UA" -H "API-Key: $URLSCAN_KEY" -o "$2" "$1" 2>/dev/null
}

# Build the queue: "<hash>\t<phase>", de-duplicated, phase order preserved.
Q="$TMP/queue"; : > "$Q"
node "$MON/kit-body.js" audit "$RAW" | sed 's/$/\theal/' >> "$Q"
grep -v '^#' "$MON/fingerprints.txt" | cut -f1 | grep -E '^[0-9a-f]{64}$' | while IFS= read -r h; do
  [ -s "$RAW/$h.js" ] || printf '%s\tmissing\n' "$h"
done >> "$Q"
if [ "$SNAP" -gt 0 ] 2>/dev/null; then
  awk -F, 'NR>1 && $3 ~ /hash:/ && $9 ~ /^[0-9a-f-]{36}$/ {print $5 "\t" $9}' "$MON/findings.csv" \
    | sort -r | cut -f2 | awk '!s[$0]++' | head -n "$SNAP" > "$TMP/uuids"
  while IFS= read -r uuid; do
    if us_get "https://urlscan.io/api/v1/result/$uuid/" "$TMP/result.json"; then
      node "$MON/parse.js" urlscan-hashes < "$TMP/result.json" | while IFS= read -r h; do
        [ -s "$RAW/$h.js" ] || printf '%s\tsnapshot:%s\n' "$h" "$uuid"
      done >> "$Q"
    else
      echo "[$TS] HEAL snapshot: result for scan $uuid unavailable" >> "$LOG"
    fi
    sleep 1
  done < "$TMP/uuids"
fi
awk -F'\t' '!s[$1]++' "$Q" > "$TMP/q2"

ok=0; bad=0; n=0
while IFS=$'\t' read -r h phase; do
  [ "$n" -ge "$MAX" ] && break
  n=$((n+1))
  f="$TMP/body.$h"
  if us_get "https://urlscan.io/responses/$h/" "$f" \
     && node "$MON/kit-body.js" archive "$h" "$f" "$RAW" "$DEC" 2>>"$LOG"; then
    ok=$((ok+1)); echo "[$TS] HEAL ($phase) archived + verified kit body $h" >> "$LOG"
  else
    bad=$((bad+1)); echo "[$TS] HEAL ($phase) kit body $h not recovered (not retained by urlscan, or failed verification)" >> "$LOG"
  fi
  sleep 1
done < "$TMP/q2"
left=$(( $(wc -l < "$TMP/q2") - n ))
echo "heal-bodies: queued=$(wc -l < "$TMP/q2") attempted=$n recovered=$ok failed=$bad remaining=$left"
