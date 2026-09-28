#!/usr/bin/env bash
# =============================================================================
# migrate-2026-09.sh — ONE-TIME cleanup for the 2026-09-25 tracker rewrite.
# -----------------------------------------------------------------------------
# Run once, from the repo root or anywhere (paths are self-relative):
#     bash monitor/migrate-2026-09.sh
# Idempotent — safe to re-run (it no-ops on anything already migrated).
#
# What it does (see docs/operation-dossier.md's incident note and check.sh's
# header for the full story of the 2026-09-10 -> 09-24 origin-auto-promotion
# noise loop this is cleaning up after):
#   1. Deletes monitor/state/auto_origins.txt — the auto-origin-promotion
#      mechanism it fed is removed from check.sh entirely.
#   2. Strips denylisted entries (the autonocion.com false-positive and its
#      subdomains) out of monitor/state/auto_apexes.txt and seen_certs.txt —
#      done BEFORE building the tier-1 keep-set, or a denylisted apex that
#      was already auto-promoted would still count as tier-1.
#   3-4. Rewrites monitor/findings.csv to the new 7-column format
#      (type,indicator,source,asn,first_seen,tier,operator) and DELETES
#      outright (per explicit decision — not archived) every row dated
#      2026-09-10 or later whose indicator does not match a current tier-1
#      watchlist/auto-promoted apex or origin (and any denylisted indicator,
#      any date). Rows before 2026-09-10 (the genuine June-July campaign
#      discovery, including the amoreliie.com lead) are kept and
#      tier/operator-backfilled.
#   5. Best-effort prunes the same noise window's NEW/candidate/AUTO-PROMOTE/
#      ORIGIN-CANDIDATE/SCAN-SAVED lines out of monitor.log.
#   6. Appends the 99 Operator-A apexes recovered via the kit content-hash
#      pivot (monitor/migrate-2026-09-hashpivot.tsv — all AS13335, June-July
#      2026 kit build, confirmed live via urlscan hash: search 2026-09-25) to
#      docs/indicators.csv as historical IOCs — real campaign scale the old
#      page.url-only fingerprints missed (they recovered ~2 of these).
# =============================================================================
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MON="$ROOT/monitor"; STATE="$MON/state"; DOCS="$ROOT/docs"
FIND="$MON/findings.csv"; LOG="$MON/monitor.log"
WATCH="$MON/watchlist.txt"; DENYF="$MON/denylist.txt"
CUTOFF="2026-09-10"   # first_seen >= this date is the noise-incident window

echo "== 1. removing auto_origins.txt (origin auto-promotion is removed from check.sh) =="
if [ -f "$STATE/auto_origins.txt" ]; then
  n="$(wc -l < "$STATE/auto_origins.txt")"
  rm -f "$STATE/auto_origins.txt"
  echo "   deleted ($n entries, all traced to zero real operator origins)"
else
  echo "   already removed"
fi

echo "== 2. stripping denylisted entries (autonocion.com false positive, etc.) from state =="
# Must run BEFORE building the keep-set below, or a denylisted apex that was
# already auto-promoted (autonocion.com was, before this fix) would still
# count as "tier-1" and survive the findings.csv filter.
declare -A DENY
if [ -f "$DENYF" ]; then
  while IFS= read -r raw; do
    line="${raw%%#*}"; line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    [[ "$line" == *. ]] && [[ "$line" =~ ^[0-9.]+\.$ ]] && continue   # prefixes not needed here
    DENY["$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')"]=1
  done < "$DENYF"
fi
is_denied_domain() {   # exact match OR a strict subdomain of a denied apex
  local x="$1" d
  [ -n "${DENY[$x]:-}" ] && return 0
  for d in "${!DENY[@]}"; do case "$x" in *".$d") return 0 ;; esac; done
  return 1
}
for f in "$STATE/auto_apexes.txt" "$STATE/seen_certs.txt"; do
  [ -f "$f" ] || continue
  before="$(wc -l < "$f")"
  TMPS="$(mktemp)"
  while IFS= read -r l; do
    entry="${l%%$'\t'*}"   # first column (handles both plain and "apex<TAB>op" formats)
    is_denied_domain "$entry" || echo "$l"
  done < "$f" > "$TMPS"
  mv "$TMPS" "$f"
  after="$(wc -l < "$f")"
  echo "   $f: $before -> $after lines"
done

echo "== 3. building the current tier-1 apex/origin set =="
declare -A KEEP_APEX KEEP_ORIGIN
while IFS= read -r raw; do
  line="${raw%%#*}"; read -r entry kind tier oper _ <<< "$line"
  [ -z "${entry:-}" ] && continue
  case "$kind" in
    apex|dnsonly) [ "${tier:-2}" = "1" ] && KEEP_APEX["$entry"]=1 ;;
    origin)       [ "${tier:-2}" = "1" ] && KEEP_ORIGIN["$entry"]=1 ;;
  esac
done < "$WATCH"
if [ -f "$STATE/auto_apexes.txt" ]; then
  while IFS=$'\t' read -r a _; do [ -n "${a:-}" ] && ! is_denied_domain "$a" && KEEP_APEX["$a"]=1; done < "$STATE/auto_apexes.txt"
fi
echo "   tier-1 apexes: ${#KEEP_APEX[@]}   tier-1 origins: ${#KEEP_ORIGIN[@]}"

is_kept_indicator() {   # domain/cert (exact or subdomain of a kept apex) or exact origin IP
  local x="$1" a
  is_denied_domain "$x" && return 1
  [ -n "${KEEP_ORIGIN[$x]:-}" ] && return 0
  [ -n "${KEEP_APEX[$x]:-}" ] && return 0
  for a in "${!KEEP_APEX[@]}"; do
    case "$x" in *".$a") return 0 ;; esac
  done
  return 1
}

echo "== 4. rewriting findings.csv (deleting post-$CUTOFF noise, keeping tier-1) =="
if [ -f "$FIND" ]; then
  TMPF="$(mktemp)"
  echo "type,indicator,source,asn,first_seen,tier,operator,matched_url,scan_uuid" > "$TMPF"
  # NOTE: reads/writes the 9-column format added 2026-09-25 (matched_url,
  # scan_uuid) — must stay in sync with check.sh's header or a stray extra
  # comma-field silently gets absorbed into the last `read` variable.
  tail -n +2 "$FIND" | while IFS=, read -r type indicator source asn first_seen tier operator murl uuid; do
    [ -z "${type:-}" ] && continue
    is_denied_domain "${indicator:-}" && continue   # e.g. autonocion.com, however dated
    if [[ "${first_seen:-}" < "$CUTOFF" ]]; then
      t="${tier:-2}"; o="${operator:--}"
      if [ -z "${tier:-}" ]; then   # pre-migration row, backfill from current watchlist
        if [ -n "${KEEP_ORIGIN[$indicator]:-}" ]; then t=1; o=B
        elif is_kept_indicator "$indicator"; then t=1; o=A
        else t=2; o=-; fi
      fi
      printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "$type" "$indicator" "$source" "$asn" "$first_seen" "$t" "$o" "${murl:-}" "${uuid:-}"
    elif is_kept_indicator "$indicator"; then
      t="${tier:-1}"; o="${operator:-A}"
      [ -n "${KEEP_ORIGIN[$indicator]:-}" ] && o=B
      printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "$type" "$indicator" "$source" "$asn" "$first_seen" "$t" "$o" "${murl:-}" "${uuid:-}"
    fi
    # else: dropped (post-cutoff, not a confirmed tier-1 indicator — 2026-09 noise incident)
  done >> "$TMPF"
  before="$(($(wc -l < "$FIND") - 1))"
  after="$(($(wc -l < "$TMPF") - 1))"
  mv "$TMPF" "$FIND"
  echo "   findings.csv: $before rows -> $after rows ($((before - after)) noise rows deleted)"
else
  echo "   no findings.csv found — skipping"
fi

echo "== 5. best-effort pruning monitor.log noise window =="
if [ -f "$LOG" ]; then
  KEPT_INDICATORS="$(cut -d, -f2 "$FIND" | sort -u)"
  TMPL="$(mktemp)"; printf '%s\n' "$KEPT_INDICATORS" > "$TMPL"
  before_lines="$(wc -l < "$LOG")"
  awk -v cutoff="$CUTOFF" -v keepf="$TMPL" '
    BEGIN { while ((getline k < keepf) > 0) if (k!="") keep[k]=1 }
    {
      ts = substr($0, 2, 20)   # "[2026-09-10T12:00:00Z] ..."
      is_noise_line = ($0 ~ /NEW |candidate |AUTO-PROMOTE|ORIGIN-CANDIDATE|SCAN-SAVED/)
      if (is_noise_line && ts >= cutoff) {
        matched = 0
        for (k in keep) { if (index($0, k) > 0) { matched = 1; break } }
        if (!matched) next   # drop this line
      }
      print
    }
  ' "$LOG" > "$TMPL.out"
  after_lines="$(wc -l < "$TMPL.out")"
  mv "$TMPL.out" "$LOG"; rm -f "$TMPL"
  echo "   monitor.log: $before_lines lines -> $after_lines lines ($((before_lines - after_lines)) noise lines pruned)"
else
  echo "   no monitor.log found — skipping"
fi

echo "== 6. appending recovered hash-pivot apexes to docs/indicators.csv =="
PIVOT="$MON/migrate-2026-09-hashpivot.tsv"
IND="$DOCS/indicators.csv"
if [ -f "$PIVOT" ] && [ -f "$IND" ]; then
  added=0
  while IFS=$'\t' read -r apex lastseen; do
    [ -z "${apex:-}" ] && continue
    grep -qF ",$apex," "$IND" 2>/dev/null && continue   # already present
    brand="marketplace-PhaaS (various)"
    case "$apex" in
      *blocket*) brand="Blocket (SE)" ;;
      *kleinan*) brand="Kleinanzeigen (DE)" ;;
      *correos*) brand="Correos (ES)" ;;
      *frakt*)   brand="courier (frakt-, Nordic)" ;;
      *olx*)     brand="OLX (PL)" ;;
    esac
    printf 'domain,%s,A,%s,AS13335(Cloudflare),%s,medium,"recovered via kit content-hash pivot 2026-09-25 (hash fa7787e1.../67736529.../08a004fa...); kit build 2026-06/07; dead now (daily rotation) — see monitor/migrate-2026-09-hashpivot.tsv"\n' \
      "$apex" "$brand" "$lastseen" >> "$IND"
    added=$((added+1))
  done < "$PIVOT"
  echo "   appended $added new historical IOC rows to docs/indicators.csv"
else
  echo "   missing $PIVOT or $IND — skipping"
fi

echo "== migrate-2026-09 complete =="
