#!/usr/bin/env bash
# =============================================================================
#  Marketplace-PhaaS  INFRASTRUCTURE  TRACKER  — single-pass, KEYLESS.
# -----------------------------------------------------------------------------
#  Captures every infrastructure signal for the watchlist on each run and
#  reports only what is NEW since the last run. Designed for a GitHub Actions
#  cron (state is committed back to the repo), but runs fine locally too.
#
#  Signals per run:
#    1. CT logs   — new certs / subdomains (certspotter + crt.sh, keyless)
#                   · apex queries  -> subdomains of watched apexes (high confidence)
#                   · token queries -> candidate new cluster apexes (lower confidence)
#    2. urlscan   — kit fingerprints -> new live kit domains + served IP/ASN (keyless)
#    3. DNS       — re-resolve in-scope hosts over public resolvers (DoH);
#                   flag new A/AAAA, and especially NON-Cloudflare origins.
#
#  To keep signal high and noise low, DNS is resolved ONLY for confirmed in-scope
#  hosts (watched apexes, their CT subdomains, and kit-fingerprint urlscan hits) —
#  never for the broad token-substring candidates, which are reported but not resolved.
#
#  Inputs : monitor/watchlist.txt
#  Outputs: monitor/findings.csv  (type,indicator,source,asn,first_seen)
#           monitor/monitor.log   (human log)
#           monitor/NEW_THIS_RUN.txt  (delta for the alert step; empty = nothing new)
#           monitor/state/*        (dedup state, committed by CI)
#
#  No API keys. No probing of operator systems — only public CT/urlscan/DNS data.
# =============================================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MON="$ROOT/monitor"
STATE="$MON/state"; mkdir -p "$STATE"
WATCH="$MON/watchlist.txt"
PARSE="$MON/parse.js"
LOG="$MON/monitor.log";          touch "$LOG"
FIND="$MON/findings.csv"
NEW="$MON/NEW_THIS_RUN.txt";     : > "$NEW"
TS="$(date -u +%FT%TZ)"
UA="marketplace-phaas-tracker (research; +github)"

SEEN_CERT="$STATE/seen_certs.txt";   touch "$SEEN_CERT"
SEEN_DOM="$STATE/seen_domains.txt";  touch "$SEEN_DOM"
SEEN_DNS="$STATE/seen_dns.txt";      touch "$SEEN_DNS"
INIT="$STATE/initialized"
SCANS="$MON/scans.csv"
SCANNED="$STATE/scanned.txt";        touch "$SCANNED"

[ -s "$FIND" ]  || echo "type,indicator,source,asn,first_seen" > "$FIND"
[ -s "$SCANS" ] || echo "domain,uuid,result,visibility,first_scanned" > "$SCANS"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
CERTS_APEX="$TMP/certs_apex"; : > "$CERTS_APEX"   # subdomains of watched apexes
CERTS_TOK="$TMP/certs_tok";   : > "$CERTS_TOK"    # token-substring candidates
USCAN="$TMP/uscan";           : > "$USCAN"        # domain<TAB>ip<TAB>asn (kit fingerprints)
HOSTS="$TMP/hosts";           : > "$HOSTS"         # in-scope hosts to DNS-resolve
DNSPAIRS="$TMP/dns";          : > "$DNSPAIRS"

# --- health accounting (F4) --------------------------------------------------
# Every external call records ok|empty|error per source so a run can tell
# "genuinely quiet" from "blind because a source failed". All state is file-based
# so it survives the pipeline subshells the call sites run in.
HEALTHF="$TMP/health"; : > "$HEALTHF"
note_health() { printf '%s\t%s\n' "$1" "$2" >> "$HEALTHF"; }   # source<TAB>ok|empty|error

# fetch_h <timeout> <tries> <label> <url> [curl-opts...]
#   echoes the body to stdout and records health. Retries transient failures
#   (non-zero curl exit OR empty body) with linear backoff.
fetch_h() {
  local to="$1" tries="$2" label="$3" url="$4"; shift 4
  local body rc attempt=0
  while :; do
    body="$(curl -fsS --max-time "$to" -A "$UA" "$@" "$url" 2>/dev/null)"; rc=$?
    { [ $rc -eq 0 ] && [ -n "$body" ]; } && break
    attempt=$((attempt+1)); [ "$attempt" -ge "$tries" ] && break
    sleep $((attempt*2))
  done
  if   [ $rc -ne 0 ];  then note_health "$label" "error"
  elif [ -z "$body" ]; then note_health "$label" "empty"
  else                      note_health "$label" "ok"; fi
  printf '%s' "$body"
}
# plain fetch (no health) — used where a miss is benign.
fetch() { curl -fsS --max-time 40 -A "$UA" "$1" 2>/dev/null; }

# crt.sh is chronically slow/flaky. Retry within fetch_h, AND trip a per-run
# circuit breaker on the first hard failure so we don't hammer a dead host 14×
# (the breaker flag is a file because call sites run inside pipeline subshells).
CRTSH_DEAD="$TMP/crtsh_dead"
crtsh_get() {
  [ -e "$CRTSH_DEAD" ] && return 0
  local body; body="$(fetch_h 50 2 "crtsh" "$1")"
  [ -z "$body" ] && : > "$CRTSH_DEAD"
  printf '%s' "$body"
}
# DoH fetch — 1.1.1.1 REQUIRES the dns-json Accept header (else HTTP 400, empty
# body); the header is harmless for dns.google. Short timeout, since DoH is fast
# and we query two resolvers as mutual fallback.
fetch_doh() { fetch_h 15 2 "$1" "$2" -H "accept: application/dns-json"; }

# urlscan search. Uses URLSCAN_KEY (CI secret) when present for consistent,
# complete results — but a bad/expired/throttled key must NOT blind the arm, so
# fall back to keyless (a 500/day IP quota, ample for this watchlist). Records a
# single "urlscan" health entry reflecting whether ANY path returned data.
us_search()  {
  local q="$1" body=""
  if [ -n "${URLSCAN_KEY:-}" ]; then
    body="$(curl -fsS --max-time 45 -A "$UA" -H "API-Key: $URLSCAN_KEY" -G "https://urlscan.io/api/v1/search/" \
      --data-urlencode "q=$q" --data-urlencode "size=100" 2>/dev/null)"
  fi
  if [ -z "$body" ]; then   # no key, or the keyed call failed -> keyless fallback
    body="$(curl -fsS --max-time 45 -A "$UA" -G "https://urlscan.io/api/v1/search/" \
      --data-urlencode "q=$q" --data-urlencode "size=100" 2>/dev/null)"
  fi
  if [ -n "$body" ]; then note_health "urlscan" "ok"; else note_health "urlscan" "error"; fi
  printf '%s' "$body"
}
# urlscan SUBMIT — save a PUBLIC scan (timestamped page + screenshot = evidence) of
# a live scam page. Requires URLSCAN_KEY. Fire-and-forget; the scan finishes async
# on urlscan's side. Echoes "uuid<TAB>result_url" on success, nothing on failure.
us_submit() {
  [ -n "${URLSCAN_KEY:-}" ] || return 0
  curl -fsS --max-time 30 -A "$UA" -H "API-Key: $URLSCAN_KEY" -H "Content-Type: application/json" \
    --data "{\"url\":\"https://$1/\",\"visibility\":\"public\",\"tags\":[\"marketplace-phaas\",\"auto-monitor\"]}" \
    "https://urlscan.io/api/v1/scan/" 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);if(j.uuid)console.log(j.uuid+"\t"+(j.result||""))}catch(e){}})'
}

# --- parse watchlist into apexes (have a dot), tokens (bare), origin IPs --------
# Order matters: an IPv4 contains dots, so it MUST be matched before the apex
# rule. Origin IPs drive a urlscan page.ip watch (new domains on a known origin).
APEXES=(); PATTERNS=(); ORIGINS=()
while IFS= read -r line; do
  line="${line%%#*}"; line="$(printf '%s' "$line" | tr -d '[:space:]')"
  [ -z "$line" ] && continue
  if   [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$line" == *:*:* ]]; then ORIGINS+=("$line")
  elif [[ "$line" == *.* ]]; then APEXES+=("$line")
  else PATTERNS+=("$line"); fi
done < "$WATCH"

# --- Cloudflare-edge heuristic (so we can flag non-CF origins, the best lead) --
# Well-known Cloudflare published ranges; an IP outside these is treated as a
# candidate real origin and flagged. (Heuristic, not authoritative ASN lookup.)
is_cf_ip() {
  case "$1" in
    104.1[6-9].*|104.2[0-9].*|104.3[0-1].*) return 0 ;;       # 104.16.0.0/12
    172.6[4-9].*|172.7[0-1].*)              return 0 ;;       # 172.64.0.0/13
    188.114.9[6-9].*)                       return 0 ;;       # 188.114.96.0/20
    162.158.*|162.159.*|173.245.*|141.101.*|108.162.*) return 0 ;;
    103.21.244.*|103.22.20[0-7].*|103.31.4.*|190.93.*|197.234.24*|198.41.12[8-9].*|198.41.1[3-9]*) return 0 ;;
    2606:4700:*|2803:f800:*|2405:b500:*|2405:8100:*|2a06:98c1:*) return 0 ;;
    *) return 1 ;;
  esac
}

# ============================ 1. CT LOGS =====================================
for apex in "${APEXES[@]:-}"; do
  [ -z "$apex" ] && continue
  fetch_h 30 2 "certspotter" "https://api.certspotter.com/v1/issuances?domain=$apex&include_subdomains=true&expand=dns_names" \
    | node "$PARSE" certspotter >> "$CERTS_APEX"
  crtsh_get "https://crt.sh/?q=$apex&output=json" | node "$PARSE" crtsh >> "$CERTS_APEX"
done
for pat in "${PATTERNS[@]:-}"; do
  [ -z "$pat" ] && continue
  crtsh_get "https://crt.sh/?q=%25${pat}%25&output=json" | node "$PARSE" crtsh >> "$CERTS_TOK"
done
sort -u "$CERTS_APEX" -o "$CERTS_APEX"
# token candidates: drop any already covered as an apex subdomain
sort -u "$CERTS_TOK" | comm -23 - "$CERTS_APEX" > "$TMP/ct_tok2" && mv "$TMP/ct_tok2" "$CERTS_TOK"

# ============================ 2. URLSCAN =====================================
# Specific kit fingerprints only (the canonical per-victim "?us=<channel>" tag,
# the self-hosted card-exfil WebSocket path, and the builder's "Continental
# Group" /static/cg.png mark) + an exact per-apex query. Deliberately NOT broad
# path matches like "/a/" or "/ws/helpdesk" — those collide with normal SaaS.
URLSCAN_QUERIES=(
  'page.url:"us=gm" OR page.url:"us=dlm" OR page.url:"us=sml" OR page.url:"us=ym"'
  'page.url:"/api/ws/stripe/sync"'
  'page.url:"/static/cg.png"'
)
for apex in "${APEXES[@]:-}"; do [ -n "$apex" ] && URLSCAN_QUERIES+=("page.domain:\"$apex\""); done
# Origin-IP watch: surface NEW domains that land on a known (dedicated) origin,
# even if they match no apex/token yet. Only list dedicated IPs in the watchlist
# — a shared CDN IP would flood this with unrelated tenants.
for ip in "${ORIGINS[@]:-}"; do [ -n "$ip" ] && URLSCAN_QUERIES+=("page.ip:\"$ip\""); done

for q in "${URLSCAN_QUERIES[@]}"; do
  us_search "$q" | node "$PARSE" urlscan >> "$USCAN"
  sleep 1
done
sort -u "$USCAN" -o "$USCAN"
cut -f1 "$USCAN" | grep -v '^$' | sort -u > "$TMP/uscan_doms"

# ============================ 3. DNS =========================================
# In-scope hosts only: watched apexes + their CT subdomains + kit-fingerprint
# urlscan hits. (Token candidates are reported but NOT resolved — they are
# substring guesses and would flood DNS with unrelated infrastructure.)
{ printf '%s\n' "${APEXES[@]:-}"; cat "$CERTS_APEX" "$TMP/uscan_doms"; } \
  | grep -v '^$' | sort -u > "$HOSTS"

while IFS= read -r h; do
  [ -z "$h" ] && continue
  for t in A AAAA; do
    {
      fetch_doh "dns-cf"     "https://1.1.1.1/dns-query?name=${h}&type=${t}" | node "$PARSE" doh
      fetch_doh "dns-google" "https://dns.google/resolve?name=${h}&type=${t}" | node "$PARSE" doh
    } | sort -u | while IFS= read -r ip; do
      [ -z "$ip" ] && continue
      printf '%s\t%s\n' "$h" "$ip" >> "$DNSPAIRS"
    done
  done
done < "$HOSTS"
sort -u "$DNSPAIRS" -o "$DNSPAIRS"

# ====================== record helper + delta logic ==========================
record() { # type indicator source asn  -> findings.csv + log + NEW_THIS_RUN (alerts)
  printf '%s,%s,%s,%s,%s\n' "$1" "$2" "$3" "$4" "$TS" >> "$FIND"
  echo "[$TS] NEW $1  $2  [$3${4:+ / $4}]" >> "$LOG"
  echo "$1  $2  [$3${4:+ / $4}]" >> "$NEW"
}
record_quiet() { # like record() but does NOT alert — for low-confidence candidates.
  # CT substring/token matches collide with legitimate companies (e.g. an unrelated
  # firm called "paycore") and crt.sh results flap between runs, so they are logged
  # to findings.csv for manual review but never open an Issue.
  printf '%s,%s,%s,%s,%s\n' "$1" "$2" "$3" "$4" "$TS" >> "$FIND"
  echo "[$TS] candidate $1  $2  [$3]" >> "$LOG"
}

# ---- FIRST RUN: seed the baseline silently (no alerts), then exit -----------
if [ ! -f "$INIT" ]; then
  sort -u "$CERTS_APEX" "$CERTS_TOK" > "$SEEN_CERT"
  cat "$TMP/uscan_doms" > "$SEEN_DOM"
  cut -f2 "$DNSPAIRS" | sort -u > "$SEEN_DNS"
  : > "$NEW"
  echo "[$TS] baseline seeded — certs:$(wc -l < "$SEEN_CERT") domains:$(wc -l < "$SEEN_DOM") ips:$(wc -l < "$SEEN_DNS")" >> "$LOG"
  touch "$INIT"
  exit 0
fi

# ---- DELTAS: new certs — apex subdomains (high conf) then token candidates ---
comm -13 "$SEEN_CERT" "$CERTS_APEX" | grep -v '^$' | while IFS= read -r name; do
  record "cert" "$name" "ct-log (apex subdomain)" ""
done
comm -13 "$SEEN_CERT" "$CERTS_TOK" | grep -v '^$' | while IFS= read -r name; do
  record_quiet "cert" "$name" "ct-log (token candidate — review)" ""
done

# ---- DELTAS: new domains (urlscan kit fingerprints) -------------------------
comm -13 "$SEEN_DOM" "$TMP/uscan_doms" | grep -v '^$' | while IFS= read -r d; do
  asn="$(awk -F'\t' -v d="$d" '$1==d{print $3; exit}' "$USCAN")"
  ip="$(awk -F'\t' -v d="$d" '$1==d{print $2; exit}' "$USCAN")"
  record "domain" "$d" "urlscan${ip:+ @$ip}" "$asn"
done

# ---- DELTAS: new IPs (DNS over in-scope hosts) — flag non-Cloudflare origins --
cut -f2 "$DNSPAIRS" | sort -u > "$TMP/ips_now"
comm -13 "$SEEN_DNS" "$TMP/ips_now" | grep -v '^$' | while IFS= read -r ip; do
  host="$(awk -F'\t' -v ip="$ip" '$2==ip{print $1; exit}' "$DNSPAIRS")"
  if is_cf_ip "$ip"; then
    record "ip" "$ip" "dns (${host})" "Cloudflare-edge"
  else
    record "ip" "$ip" "dns (${host})" "NON-CF ORIGIN — high value"
  fi
done

# ====================== F4: source-health accounting =========================
# A "no new indicators" run is only meaningful if the sources actually answered.
# Emit a HEALTH line every run, and alert when a CRITICAL source goes blind —
# deduped against state so a persistent outage doesn't reopen an Issue each run.
hstat() { # <label> -> prints "ok/total"; exit 1 if DOWN (queried but 0 ok)
  awk -F'\t' -v L="$1" '
    $1==L { t++; if ($2=="ok") o++ }
    END   { printf "%d/%d", o+0, t+0; exit (t>0 && o==0) ? 1 : 0 }' "$HEALTHF"
}
CS=$(hstat certspotter); cs_down=$?
CR=$(hstat crtsh);       cr_down=$?
US=$(hstat urlscan);     us_down=$?
DG=$(hstat dns-google);  dg_down=$?
DC=$(hstat dns-cf);      dc_down=$?
dns_down=0; [ $dg_down -eq 1 ] && [ $dc_down -eq 1 ] && dns_down=1   # only if BOTH resolvers fail
echo "[$TS] HEALTH certspotter=$CS crtsh=$CR urlscan=$US dns-google=$DG dns-cf=$DC" >> "$LOG"

# crt.sh is chronically flaky and now retried + breaker-guarded; log-only, never an Issue.
[ $cr_down -eq 1 ] && echo "[$TS] HEALTH-NOTE crtsh degraded ($CR) — CT token/new-apex discovery skipped this run" >> "$LOG"

# Issue-worthy outages (rare, genuinely alarming): certspotter, urlscan, or BOTH DNS resolvers.
DOWNF="$STATE/health_down.txt"; touch "$DOWNF"
NOWDOWN="$TMP/nowdown"; : > "$NOWDOWN"
[ $cs_down  -eq 1 ] && echo "certspotter" >> "$NOWDOWN"
[ $us_down  -eq 1 ] && echo "urlscan"     >> "$NOWDOWN"
[ $dns_down -eq 1 ] && echo "dns"         >> "$NOWDOWN"
sort -u "$NOWDOWN" -o "$NOWDOWN"
comm -13 "$DOWNF" "$NOWDOWN" | grep -v '^$' | while IFS= read -r d; do   # newly down -> alert once
  echo "source-health  $d DOWN — this run is BLIND to $d; 'no new indicators' is not trustworthy until it recovers" >> "$NEW"
  echo "[$TS] HEALTH-ALERT $d went DOWN" >> "$LOG"
done
comm -23 "$DOWNF" "$NOWDOWN" | grep -v '^$' | while IFS= read -r d; do   # recovered -> log only
  echo "[$TS] HEALTH-RECOVERED $d" >> "$LOG"
done
cp "$NOWDOWN" "$DOWNF"

# ====================== SAVE: public urlscans of live scam pages =============
# Preserve timestamped evidence (page + screenshot) for every LIVE in-scope host.
# Backfills currently-live hosts over a few runs (capped), then catches new ones
# as they appear. Deduped via state/scanned.txt (a host is scanned at most once).
# Requires URLSCAN_KEY; visibility = public (citable case-file evidence).
if [ -n "${URLSCAN_KEY:-}" ]; then
  cut -f1 "$DNSPAIRS" | grep -v '^$' | sort -u > "$TMP/live_hosts"
  SCAN_MAX=20
  comm -23 "$TMP/live_hosts" <(sort -u "$SCANNED") | head -n "$SCAN_MAX" | while IFS= read -r h; do
    [ -z "$h" ] && continue
    IFS=$'\t' read -r uuid url <<< "$(us_submit "$h")"
    if [ -n "${uuid:-}" ]; then
      printf '%s,%s,%s,public,%s\n' "$h" "$uuid" "$url" "$TS" >> "$SCANS"
      echo "[$TS] SCAN-SAVED $h -> $url" >> "$LOG"
      echo "$h" >> "$SCANNED"
    fi
    sleep 2
  done
  rem=$(comm -23 "$TMP/live_hosts" <(sort -u "$SCANNED") | grep -c . 2>/dev/null || echo 0)
  [ "${rem:-0}" -gt 0 ] && echo "[$TS] SCAN-BACKLOG $rem live host(s) queued for next run (cap $SCAN_MAX/run)" >> "$LOG"
fi

# ---- advance state ----------------------------------------------------------
sort -u "$SEEN_CERT" "$CERTS_APEX" "$CERTS_TOK" -o "$SEEN_CERT"
sort -u "$SEEN_DOM" "$TMP/uscan_doms"           -o "$SEEN_DOM"
sort -u "$SEEN_DNS" "$TMP/ips_now"              -o "$SEEN_DNS"

if [ -s "$NEW" ]; then
  echo "[$TS] $(wc -l < "$NEW") new indicator(s) this run" >> "$LOG"
else
  echo "[$TS] no new indicators" >> "$LOG"
fi
