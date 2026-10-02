#!/usr/bin/env bash
# =============================================================================
#  Marketplace-PhaaS  INFRASTRUCTURE  TRACKER  — single-pass, KEYLESS.
# -----------------------------------------------------------------------------
#  Captures every infrastructure signal for the watchlist on each run and
#  reports only what is NEW since the last run. Designed for a GitHub Actions
#  cron (state is committed back to the repo), but runs fine locally too.
#
#  2026-09-25 rewrite. This is the second major version. The first version's
#  automatic "promote any new non-Cloudflare IP to a permanent watch" logic
#  turned into a self-reinforcing noise loop (2026-09-10 -> 09-24): dead
#  Operator-A apexes re-resolved to shared cloud IPs (normal domain-death
#  churn), those got auto-promoted as "dedicated origins" on a urlscan
#  apex-count of 0 (meaning "the check returned nothing", treated as "safe"),
#  and each promoted IP's page.ip query then pulled in ~100 unrelated tenant
#  domains per run, some of which produced MORE non-CF IPs, compounding.
#  Traced live: NONE of the 40 auto-promoted origins were real operator
#  infrastructure. See docs/operation-dossier.md's incident note and
#  monitor/migrate-2026-09.sh for the one-time cleanup this rewrite required.
#
#  What changed:
#    - Automatic ORIGIN promotion is REMOVED entirely. A new non-CF IP on a
#      tracked host is logged to discovered.csv for manual review only — it
#      is never auto-queried, never auto-watched.
#    - monitor/denylist.txt is checked on every input path (apex/token/
#      dnsonly/CT-result/urlscan-result/DNS-target) — nothing on it is ever
#      queried, resolved, or recorded, no matter what a source returns.
#    - The two "kit-fingerprint" urlscan queries that never actually matched
#      anything (`page.url:"/api/ws/stripe/sync"`, `page.url:"/static/cg.png"`
#      — page.url only ever holds the top-level navigated URL, never a
#      WebSocket path or an image asset) are dropped. The `us=<channel>`
#      fingerprint is kept but is now filtered through a strict client-side
#      regex + ASN check in parse.js's urlscan-kit mode, because urlscan's
#      own search tokenizes on punctuation and cannot be told to match
#      `?us=gm` and not `/us/gm-...` (verified live: a legitimate car-news
#      site's article path false-positived and got auto-promoted before this
#      fix). The primary fingerprint is now CONTENT-HASH search
#      (monitor/fingerprints.txt, hash:<sha256> of the kit's own JS chunks) —
#      verified live to recover 60-72 distinct apexes per hash query, versus
#      ~2 for the old page.url queries.
#    - State is split: monitor/state/tracked_hosts.tsv is the ONLY set that
#      gets DNS-re-resolved each run (curated watchlist + CT subdomains +
#      confirmed kit-fingerprint hits), and it DECAYS (active -> dead after 8
#      consecutive empty resolutions -> retired after ~90 days of periodic
#      rechecks). The old design re-resolved monitor/state/seen_domains.txt's
#      ENTIRE history forever, which is how one bad indicator polluted every
#      future run indefinitely. seen_domains.txt/seen_dns.txt/seen_certs.txt
#      are now dedup-memory only (delta detection), not a re-resolve queue.
#    - Two-tier scope: every finding gets a tier (1 = alerts, 2 = log-only)
#      and an operator (A = the live, Cloudflare-hidden, daily-rotating kit —
#      the primary target; B = the older, already-documented/exposed PHP
#      kit — real but static origins, secondary priority). Tier-1 Operator-A
#      findings drive the per-run GitHub Issue (NEW_TIER1.txt); tier-1
#      Operator-B findings accumulate in state/pending_opb.txt for a weekly
#      digest instead, so Operator A ("the big scam running") is never
#      buried under the already-exposed side of the case.
#
#  Signals per run:
#    1. CT logs   — new certs / subdomains (certspotter + crt.sh, keyless)
#                   · apex queries  -> subdomains of watched apexes (tier 1)
#                   · token queries -> candidate new cluster apexes (tier 2)
#    2. urlscan   — kit fingerprints (content-hash primary, URL+ASN-filtered
#                   `us=` secondary) -> new live kit domains + served IP/ASN
#    3. DNS       — re-resolve TRACKED hosts only (not full history); flag
#                   non-Cloudflare origins for manual review (never auto-watch)
#
#  Inputs : monitor/watchlist.txt, monitor/denylist.txt, monitor/fingerprints.txt
#  Outputs: monitor/findings.csv        (type,indicator,source,asn,first_seen,tier,operator,matched_url,scan_uuid)
#           monitor/monitor.log          (human log)
#           monitor/NEW_TIER1.txt        (Operator-A tier-1 delta -> per-run Issue)
#           monitor/state/pending_opb.txt (Operator-B tier-1 delta -> weekly digest)
#           monitor/discovered.csv       (kind,indicator,status,reason,first_seen — manual-review candidates)
#           monitor/state/*              (dedup + tracked-host state, committed by CI)
#
#  No API keys required. No probing of operator systems — only public
#  CT/urlscan/DNS data.
# =============================================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MON="$ROOT/monitor"
STATE="$MON/state"; mkdir -p "$STATE"
WATCH="$MON/watchlist.txt"
DENYF="$MON/denylist.txt";   touch "$DENYF"
FPRINTS="$MON/fingerprints.txt"; touch "$FPRINTS"
PARSE="$MON/parse.js"
LOG="$MON/monitor.log";          touch "$LOG"
FIND="$MON/findings.csv"
NEW1="$MON/NEW_TIER1.txt";      : > "$NEW1"     # Operator-A tier-1 delta -> per-run Issue
TS="$(date -u +%FT%TZ)"
UA="marketplace-phaas-tracker (research; +github)"

SEEN_CERT="$STATE/seen_certs.txt";   touch "$SEEN_CERT"
SEEN_DOM="$STATE/seen_domains.txt";  touch "$SEEN_DOM"   # dedup memory only (NOT re-resolved)
SEEN_DNS="$STATE/seen_dns.txt";      touch "$SEEN_DNS"
INIT="$STATE/initialized"
SCANS="$MON/scans.csv"
SCANNED="$STATE/scanned.txt";        touch "$SCANNED"
AUTO_APEX="$STATE/auto_apexes.txt";  touch "$AUTO_APEX"   # self-evolved apexes: "apex<TAB>operator"
TRACKED="$STATE/tracked_hosts.tsv";  touch "$TRACKED"     # host tier operator source first_seen last_ok fail_streak status
PENDOPB="$STATE/pending_opb.txt";    touch "$PENDOPB"     # Operator-B tier-1 delta, accumulates for the weekly digest
DISCO="$MON/discovered.csv"                               # manual-review candidates (never auto-watched)

[ -s "$FIND" ]  || echo "type,indicator,source,asn,first_seen,tier,operator,matched_url,scan_uuid" > "$FIND"
[ -s "$SCANS" ] || echo "domain,uuid,result,visibility,first_scanned" > "$SCANS"
[ -s "$DISCO" ] || echo "kind,indicator,status,reason,first_seen" > "$DISCO"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
CERTS_APEX="$TMP/certs_apex"; : > "$CERTS_APEX"   # subdomains of watched apexes (tier1/A)
CERTS_TOK="$TMP/certs_tok";   : > "$CERTS_TOK"    # token-substring candidates (tier2)
USCAN="$TMP/uscan";           : > "$USCAN"        # domain<TAB>ip<TAB>asn<TAB>tier<TAB>operator<TAB>source<TAB>matched_url<TAB>scan_uuid
CANDF="$TMP/candidates";      : > "$CANDF"        # host<TAB>tier<TAB>operator<TAB>source (today's tracked-host candidates)
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

# crt.sh is the unlimited CT source (no per-account cap, unlike certspotter) but
# chronically slow/flaky. Retry within fetch_h; trip a per-run circuit breaker only
# after 3 CONSECUTIVE hard failures (tolerate transient blips, bail on a real
# outage). Counter is a file because call sites run in pipeline subshells.
CRTSH_FAILS="$TMP/crtsh_fails"; echo 0 > "$CRTSH_FAILS"
crtsh_get() {
  [ "$(cat "$CRTSH_FAILS" 2>/dev/null || echo 0)" -ge 3 ] && return 0
  local body; body="$(fetch_h 50 2 "crtsh" "$1")"
  if [ -z "$body" ]; then echo $(( $(cat "$CRTSH_FAILS" 2>/dev/null || echo 0) + 1 )) > "$CRTSH_FAILS"
  else echo 0 > "$CRTSH_FAILS"; fi
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
# urlscan RESULT — fetch a finished scan's full result (requests, hashes, etc.)
# for hash-chaining. Requires URLSCAN_KEY (keyless result fetches are unreliable/
# 403 for many scans). Silent no-op without a key.
us_result() {
  [ -n "${URLSCAN_KEY:-}" ] || return 0
  curl -fsS --max-time 30 -A "$UA" -H "API-Key: $URLSCAN_KEY" "https://urlscan.io/api/v1/result/$1/" 2>/dev/null
}
# urlscan RESPONSE BODY — fetch a stored response body by its content hash, for
# archiving a NEWLY hash-chained fingerprint's actual source (same endpoint the
# original kit-source/raw_bodies/ capture used — see docs/operation-dossier.md
# §14 Methodology). Confirmed live: returns HTTP 403 keyless, so this requires
# URLSCAN_KEY; silent no-op without one (fingerprints.txt still gets the hash
# either way — only the archived source sample is skipped).
us_response() {
  [ -n "${URLSCAN_KEY:-}" ] || return 0
  curl -fsS --max-time 30 -A "$UA" -H "API-Key: $URLSCAN_KEY" "https://urlscan.io/responses/$1/" 2>/dev/null
}

# --- denylist: never query/resolve/record anything on this list -------------
# Exact apex/domain/IP matches, plus dotted-IPv4 PREFIXES ending in "." (this
# repo has no CIDR math; a prefix is the supported shorthand for "whole pool").
DENY_EXACT="$TMP/deny_exact"; DENY_PREFIX="$TMP/deny_prefix"
: > "$DENY_EXACT"; : > "$DENY_PREFIX"
while IFS= read -r line; do
  line="${line%%#*}"; line="$(printf '%s' "$line" | tr -d '[:space:]')"
  [ -z "$line" ] && continue
  if [[ "$line" == *. ]] && [[ "$line" =~ ^[0-9.]+\.$ ]]; then echo "$line" >> "$DENY_PREFIX"
  else printf '%s\n' "$line" | tr '[:upper:]' '[:lower:]' >> "$DENY_EXACT"; fi
done < "$DENYF"
sort -u "$DENY_EXACT" -o "$DENY_EXACT"
is_denied() {   # exact-match check (apex/domain/token/IP) — case-insensitive
  local x; x="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  grep -qxF "$x" "$DENY_EXACT" 2>/dev/null && return 0
  while IFS= read -r pfx; do [ -n "$pfx" ] && [[ "$x" == "$pfx"* ]] && return 0; done < "$DENY_PREFIX"
  return 1
}
# RFC1918 / loopback / link-local — never a real internet-facing operator origin.
is_bogon_ip() {
  case "$1" in
    127.*|10.*|192.168.*|169.254.*|0.*|::1|fc[0-9a-f][0-9a-f]:*|fe80:*) return 0 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- parse watchlist.txt: "<entry> <kind> <tier> <operator>" per line -------
declare -A TIER OPER
APEXES=(); PATTERNS=(); ORIGINS=(); DNSONLY=()
while IFS= read -r raw; do
  line="${raw%%#*}"
  read -r entry kind tier oper _ <<< "$line"
  [ -z "${entry:-}" ] && continue
  is_denied "$entry" && continue
  kind="${kind:-apex}"; tier="${tier:-2}"; oper="${oper:--}"
  TIER["$entry"]="$tier"; OPER["$entry"]="$oper"
  case "$kind" in
    apex)    APEXES+=("$entry") ;;
    token)   PATTERNS+=("$entry") ;;
    origin)  ORIGINS+=("$entry") ;;
    dnsonly) DNSONLY+=("$entry") ;;
  esac
done < "$WATCH"
# self-evolved apexes (kit-fingerprint confirmed): "apex<TAB>operator" per line,
# treated exactly like curated watchlist apexes (tier 1 always — only a
# confirmed kit hit gets here). Tolerates the pre-rewrite plain-apex format
# (no tab) by defaulting operator to A.
while IFS=$'\t' read -r a op; do
  [ -z "${a:-}" ] && continue
  is_denied "$a" && continue
  APEXES+=("$a"); TIER["$a"]=1; OPER["$a"]="${op:-A}"
done < "$AUTO_APEX"

# --- ~victim subdomain suppression ------------------------------------------
# A dnsonly entry is a compromised LEGIT site: we DNS+scan the apex itself but
# its own cpanel/webmail/www/... subdomains are the victim's infrastructure, not
# kit landings. Drop any host that is a STRICT subdomain of a dnsonly apex from
# every import/resolve path; the apex itself is kept (length guard).
DNSONLY_SFX="$TMP/dnsonly_sfx"; : > "$DNSONLY_SFX"
for v in "${DNSONLY[@]:-}"; do [ -n "$v" ] && printf '.%s\n' "$v" >> "$DNSONLY_SFX"; done
strip_victim_subs() {  # filter stdin -> stdout: drop hosts ending in ".<victim-apex>"
  [ -s "$DNSONLY_SFX" ] || { cat; return; }
  awk -v sfxf="$DNSONLY_SFX" '
    BEGIN{ while((getline s < sfxf)>0) sfx[++n]=s }
    { drop=0; for(i=1;i<=n;i++){ L=length(sfx[i]); if(length($0)>L && substr($0,length($0)-L+1)==sfx[i]){drop=1;break} } if(!drop) print }'
}

# --- Cloudflare-edge heuristic (so we can flag non-CF origins, the best lead) --
# Well-known Cloudflare published ranges; an IP outside these is treated as a
# candidate real origin and flagged. (Heuristic, not authoritative ASN lookup.)
is_cf_ip() {
  case "$1" in
    104.1[6-9].*|104.2[0-9].*|104.3[0-1].*) return 0 ;;       # 104.16.0.0/12
    172.6[4-9].*|172.7[0-1].*)              return 0 ;;       # 172.64.0.0/13
    131.0.7[2-5].*)                         return 0 ;;       # 131.0.72.0/22
    188.114.9[6-9].*)                       return 0 ;;       # 188.114.96.0/20
    162.158.*|162.159.*|173.245.*|141.101.*|108.162.*) return 0 ;;
    103.21.244.*|103.22.20[0-7].*|103.31.4.*|190.93.*|197.234.24*|198.41.12[8-9].*|198.41.1[3-9]*) return 0 ;;
    2606:4700:*|2803:f800:*|2405:b500:*|2405:8100:*|2a06:98c1:*) return 0 ;;
    *) return 1 ;;
  esac
}

# ====================== record helper + delta logic ==========================
# record <type> <indicator> <source> <asn> <tier> <operator>
#   tier1+operator=A -> NEW_TIER1.txt (per-run GitHub Issue)
#   tier1+operator=B -> state/pending_opb.txt (accumulates for weekly digest)
#   anything else     -> findings.csv only, no alert
# record <type> <indicator> <source> <asn> <tier> <operator> [matched_url] [scan_uuid]
# The last two are evidence pointers — populated for urlscan-sourced domain
# findings, blank for cert/ip findings (no single "matched URL" applies).
# Kept for a future analyst to re-open the exact scan that proved a finding,
# without re-deriving it via live re-querying (see docs/operation-dossier.md's
# 2026-09-25 incident note on why that re-derivation is expensive).
record() {
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "$1" "$2" "$3" "$4" "$TS" "${5:-2}" "${6:--}" "${7:-}" "${8:-}" >> "$FIND"
  echo "[$TS] NEW $1  $2  [$3${4:+ / $4}] tier=${5:-2} op=${6:--}" >> "$LOG"
  if [ "${5:-2}" = "1" ]; then
    if [ "${6:--}" = "A" ]; then
      echo "$1  $2  [$3${4:+ / $4}]" >> "$NEW1"
    elif [ "${6:--}" = "B" ]; then
      echo "[$TS] $1  $2  [$3${4:+ / $4}]" >> "$PENDOPB"
    fi
  fi
}
record_quiet() { # like record() but NEVER alerts — for tier-2/low-confidence candidates.
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "$1" "$2" "$3" "$4" "$TS" "${5:-2}" "${6:--}" "${7:-}" "${8:-}" >> "$FIND"
  echo "[$TS] candidate $1  $2  [$3] tier=${5:-2} op=${6:--}" >> "$LOG"
}

# ============================ 1. CT LOGS =====================================
# certspotter rate-limits hard when keyless (HTTP 429, 1h cooldown). With a token
# (CERTSPOTTER_TOKEN secret) it authenticates via Bearer and gets full limits.
CS_AUTH=(); [ -n "${CERTSPOTTER_TOKEN:-}" ] && CS_AUTH=(-H "Authorization: Bearer $CERTSPOTTER_TOKEN")
# Shuffle apex order: certspotter free-tier rate-limits after ~10 domain searches,
# so a STABLE order would always cover the same first apexes and never the tail.
for apex in $(printf '%s\n' "${APEXES[@]:-}" | grep -v '^$' | shuf); do
  [ -z "$apex" ] && continue
  fetch_h 30 2 "certspotter" "https://api.certspotter.com/v1/issuances?domain=$apex&include_subdomains=true&expand=dns_names" "${CS_AUTH[@]}" \
    | node "$PARSE" certspotter | grep -v '^$' | while IFS= read -r h; do is_denied "$h" || echo "$h"; done >> "$CERTS_APEX"
  crtsh_get "https://crt.sh/?q=$apex&output=json" | node "$PARSE" crtsh | grep -v '^$' | while IFS= read -r h; do is_denied "$h" || echo "$h"; done >> "$CERTS_APEX"
done
for pat in "${PATTERNS[@]:-}"; do
  [ -z "$pat" ] && continue
  crtsh_get "https://crt.sh/?q=%25${pat}%25&output=json" | node "$PARSE" crtsh | grep -v '^$' | while IFS= read -r h; do is_denied "$h" || echo "$h"; done >> "$CERTS_TOK"
done
sort -u "$CERTS_APEX" -o "$CERTS_APEX"
# Drop cPanel/DNS/mail boilerplate subdomains (auto-created on every cPanel/Exchange
# host; never phishing landings) so CT enumeration adds no noise. Conservative list —
# ambiguous web prefixes (login/link/www/...) are kept.
grep -viE '^(cpanel|whm|cpcalendars|cpcontacts|webdisk|autodiscover|autoconfig|_dmarc|_domainkey|ns[0-9]*|mx[0-9]*|smtp|pop|imap|ftp)\.' "$CERTS_APEX" > "$TMP/ca_clean" || true
mv "$TMP/ca_clean" "$CERTS_APEX"
# token candidates: drop any already covered as an apex subdomain
sort -u "$CERTS_TOK" | comm -23 - "$CERTS_APEX" > "$TMP/ct_tok2" && mv "$TMP/ct_tok2" "$CERTS_TOK"

# ============================ 2. URLSCAN FINGERPRINTS ========================
# Content-hash search (primary) — hash collision is not a real-world concern,
# so a hit here is near-certain kit identity. Recency-filtered to 30d: these
# hashes go stale as the operators rebuild the bundle (hash-chaining below is
# what keeps fingerprints.txt current).
KITAPEX="$TMP/kitapex"; : > "$KITAPEX"   # apex<TAB>operator (self-promotion candidates)
# "<priority><TAB><scan_uuid>" of this run's ACCEPTED kit hits only, for hash-
# chaining. Priority 1 = URL+ASN hit (the only way a fully REBUILT kit, whose
# chunk hashes are all new, can be seen at all), 2 = hash hit (already a known
# build, but its page may carry other not-yet-known chunks). Raw search results
# must never feed this: the broad "/a/" query returns mostly unrelated sites.
FRESH_HITS="$TMP/fresh_hits"; : > "$FRESH_HITS"
while IFS=$'\t' read -r hash label added lasthit status; do
  hash="${hash%%#*}"; hash="$(printf '%s' "$hash" | tr -d '[:space:]')"
  [ -z "$hash" ] && continue
  resp="$(us_search "hash:\"$hash\"")"
  printf '%s' "$resp" | node "$PARSE" urlscan-kit 30 hash | while IFS=$'\t' read -r apex dom ip asn url uuid; do
    is_denied "$apex" && continue
    printf '%s\t%s\n' "$apex" "A" >> "$KITAPEX"
    printf '%s\t%s\t%s\t1\tA\thash:%s\t%s\t%s\n' "$dom" "$ip" "$asn" "${label:-$hash}" "$url" "$uuid" >> "$USCAN"
    [ -n "$uuid" ] && printf '2\t%s\n' "$uuid" >> "$FRESH_HITS"
    printf '%s\n' "$hash" >> "$TMP/fp_hits"
  done
  sleep 1
done < "$FPRINTS"
# Secondary fingerprint: the `us=<channel>` per-victim URL param. urlscan's
# search tokenizes on punctuation (verified live: it cannot distinguish
# "?us=gm" from "/us/gm-..."), so the ACTUAL precision gate is the client-side
# regex + AS13335 check inside parse.js's urlscan-kit "url" mode, not this
# query string.
resp="$(us_search 'page.url:"us=gm" OR page.url:"us=dlm" OR page.url:"us=sml" OR page.url:"us=ym" OR page.url:"us=cg" OR page.url:"/a/"')"
printf '%s' "$resp" | node "$PARSE" urlscan-kit 30 url | while IFS=$'\t' read -r apex dom ip asn url uuid; do
  is_denied "$apex" && continue
  printf '%s\t%s\n' "$apex" "A" >> "$KITAPEX"
  printf '%s\t%s\t%s\t1\tA\turlscan-kit(us=)\t%s\t%s\n' "$dom" "$ip" "$asn" "$url" "$uuid" >> "$USCAN"
  [ -n "$uuid" ] && printf '1\t%s\n' "$uuid" >> "$FRESH_HITS"
done

# --- fingerprint freshness + staleness alarm ---------------------------------
# A rebuilt kit changes every chunk hash, and urlscan search only looks back
# 30 days, so "no fingerprint hits" is ambiguous: quiet operators, or a build we
# can't see. Record the last hit per hash; if NO fingerprint has hit for
# FP_STALE_DAYS, raise FP_STALE.txt (-> health Issue) and seed hash-chaining
# with the newest scans of still-active kit hosts so the new build gets learned.
FP_STALE_DAYS="${FP_STALE_DAYS:-7}"
TODAY="$(date -u +%F)"
touch "$TMP/fp_hits"
# FILENAME, not NR==FNR: fp_hits is usually EMPTY, and NR==FNR would then
# swallow every fingerprints.txt line as "hits" and wipe the file.
awk -F'\t' -v OFS='\t' -v today="$TODAY" -v hitsf="$TMP/fp_hits" 'FILENAME==hitsf{hit[$1]=1; next}
  /^#/ || NF<5 {print; next}
  ($1 in hit) {$4=today} {print}' "$TMP/fp_hits" "$FPRINTS" > "$TMP/fp_new"
# never replace the roster with a truncated copy
if [ "$(grep -vc '^#' "$TMP/fp_new")" -ge "$(grep -vc '^#' "$FPRINTS")" ]; then cat "$TMP/fp_new" > "$FPRINTS"; fi
NEWEST_HIT="$(grep -v '^#' "$FPRINTS" | awk -F'\t' 'NF>=5{print $4}' | sort | tail -1)"
FPSTALE="$MON/FP_STALE.txt"; : > "$FPSTALE"
if [ -n "$NEWEST_HIT" ]; then
  age_days=$(( ( $(date -u +%s) - $(date -u -d "$NEWEST_HIT" +%s 2>/dev/null || date -u +%s) ) / 86400 ))
  if [ "$age_days" -ge "$FP_STALE_DAYS" ]; then
    echo "[$TS] HEALTH-NOTE fingerprints stale: newest kit-hash hit $NEWEST_HIT (${age_days}d) — kit probably rebuilt; seeding hash-chaining from active kit hosts" >> "$LOG"
    printf 'No kit content-hash fingerprint has matched since %s (%s days). The kit was probably rebuilt.\n' "$NEWEST_HIT" "$age_days" > "$FPSTALE"
    # newest-first active Operator-A hosts that are confirmed kit (not CT-only subdomains)
    awk -F'\t' '$3=="A" && $8=="active" && ($4=="kit-fingerprint" || $4=="watchlist"){print $5"\t"$1}' "$TRACKED" 2>/dev/null \
      | sort -r | cut -f2 | while IFS= read -r h; do is_denied "$h" || echo "$h"; done | head -n 3 | while IFS= read -r h; do
        uuid="$(us_search "page.domain:\"$h\"" | node "$PARSE" urlscan-kit 14 hash | head -n 1 | cut -f6)"
        [ -n "$uuid" ] && printf '3\t%s\n' "$uuid" >> "$FRESH_HITS" && printf -- '- seeded chaining from %s (scan %s)\n' "$h" "$uuid" >> "$FPSTALE"
        sleep 1
      done
  fi
fi

# Context queries: confirm/track CURATED apexes + origins (page.ip surfaces new
# domains landing on a KNOWN, human-reviewed origin — never an auto-promoted
# one, that mechanism is removed). These do NOT auto-promote — they feed the
# normal delta + DNS + scan, tier/operator inherited from the watchlist entry.
for apex in "${APEXES[@]:-}"; do
  [ -z "$apex" ] && continue
  is_denied "$apex" && continue
  us_search "page.domain:\"$apex\"" | node "$PARSE" urlscan | while IFS=$'\t' read -r dom ip asn url uuid; do
    [ -z "$dom" ] && continue
    is_denied "$dom" && continue
    printf '%s\t%s\t%s\t%s\t%s\tapex-context:%s\t%s\t%s\n' "$dom" "$ip" "$asn" "${TIER[$apex]:-1}" "${OPER[$apex]:-A}" "$apex" "$url" "$uuid" >> "$USCAN"
  done
  sleep 1
done
for ip in "${ORIGINS[@]:-}"; do
  [ -z "$ip" ] && continue
  is_denied "$ip" && continue
  resp="$(us_search "page.ip:\"$ip\"")"
  out="$(printf '%s' "$resp" | node "$PARSE" urlscan-ip "$ip" 30 15)"
  if printf '%s' "$out" | grep -q '^CIRCUIT_BREAK'; then
    # A CURATED watchlist origin no longer looks dedicated — warn for human
    # review, but do NOT auto-denylist it (that file is human-curated for
    # everything except auto-discovered candidates — see urlscan-ip breaker
    # note below for those).
    echo "[$TS] WARN curated origin $ip now looks shared ($out) — review watchlist.txt" >> "$LOG"
    continue
  fi
  printf '%s\n' "$out" | grep -v '^$' | while IFS=$'\t' read -r dom murl uuid; do
    is_denied "$dom" && continue
    printf '%s\t\t\t%s\t%s\torigin-context:%s\t%s\t%s\n' "$dom" "${TIER[$ip]:-1}" "${OPER[$ip]:-B}" "$ip" "$murl" "$uuid" >> "$USCAN"
  done
  sleep 1
done
sort -u "$USCAN" -o "$USCAN"
cut -f1 "$USCAN" | grep -v '^$' | strip_victim_subs | sort -u > "$TMP/uscan_doms"

# ================= 3. TRACKED HOSTS: build today's candidate set ============
# NOT the full history — only curated watchlist entries, this run's CT
# subdomains, and this run's kit-fingerprint hits. This is what stops one bad
# indicator from being re-resolved forever (the root cause of the 2026-09
# incident): a host earns its way into tracked_hosts.tsv, and falls out of
# the active resolve set (decay, below) once it stops corroborating.
add_cand() { # host tier operator source
  [ -z "${1:-}" ] && return
  is_denied "$1" && return
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$CANDF"
}
for a in "${APEXES[@]:-}";  do [ -n "$a" ] && add_cand "$a" "${TIER[$a]:-1}" "${OPER[$a]:-A}" "watchlist"; done
for a in "${DNSONLY[@]:-}"; do [ -n "$a" ] && add_cand "$a" "${TIER[$a]:-1}" "${OPER[$a]:-A}" "watchlist"; done
while IFS= read -r h; do [ -n "$h" ] && add_cand "$h" 1 A "ct-subdomain"; done < "$CERTS_APEX"
while IFS= read -r h; do [ -n "$h" ] && add_cand "$h" 1 A "kit-fingerprint"; done < "$TMP/uscan_doms"
# Dedup by HOST ONLY (column 1), not the whole line: a curated apex's own CT
# cert and its own urlscan apex-context hit both legitimately re-add the apex
# itself (a CT query for an apex returns certs covering the apex, and a
# page.domain context query matches scans of the apex itself), each with a
# DIFFERENT source column — a whole-line sort -u would keep all of them as
# separate rows for the same host, which corrupts tracked_hosts.tsv's
# per-host decay state (fail_streak/status must be one row per host).
sort -t $'\t' -k1,1 -u "$CANDF" -o "$CANDF"

# Merge into tracked_hosts.tsv: keep every existing row as-is, add new hosts as
# "active", and REACTIVATE a retired host that shows up again as a fresh
# candidate (new corroborating evidence).
# NOTE: deliberately NOT the classic `NR==FNR { ... } { ... }` two-file awk
# idiom — that trick breaks silently when the FIRST file is empty (NR never
# gets ahead of FNR, so the second file's lines get misidentified as
# belonging to the first), which is exactly tracked_hosts.tsv's state on the
# very first run of this mechanism. Reading it via getline in BEGIN instead
# and processing CANDF as the sole main input sidesteps that pitfall entirely.
awk -F'\t' -v ts="$TS" -v trackedfile="$TRACKED" '
  BEGIN {
    while ((getline line < trackedfile) > 0) {
      split(line, f, "\t")
      h = f[1]; if (h == "") continue
      tier[h]=f[2]; oper[h]=f[3]; src[h]=f[4]; first[h]=f[5]; lastok[h]=f[6]; fails[h]=f[7]; status[h]=f[8]
      order[++n]=h; seen[h]=1
    }
    close(trackedfile)
  }
  { ctier[$1]=$2; coper[$1]=$3; csrc[$1]=$4; cand[$1]=1 }
  END {
    for (i=1;i<=n;i++) {
      h=order[i]
      if ((h in cand) && status[h]=="retired") { status[h]="active"; fails[h]=0 }
      print h"\t"tier[h]"\t"oper[h]"\t"src[h]"\t"first[h]"\t"lastok[h]"\t"fails[h]"\t"status[h]
    }
    for (h in cand) if (!(h in seen)) print h"\t"ctier[h]"\t"coper[h]"\t"csrc[h]"\t"ts"\t\t0\tactive"
  }
' "$CANDF" > "$TMP/tracked_step1"
mv "$TMP/tracked_step1" "$TRACKED"

# ============================ 4. DNS =========================================
# Resolve only ACTIVE tracked hosts every run, plus DEAD hosts on a 1-in-4-runs
# periodic recheck (roughly daily at the 6h cron cadence). RETIRED hosts are
# never resolved again unless they reappear as a fresh candidate above.
HOSTS="$TMP/hosts"
awk -F'\t' '$8=="active" || ($8=="dead" && ($7+0)%4==0) {print $1}' "$TRACKED" | grep -v '^$' | strip_victim_subs | sort -u > "$HOSTS"

while IFS= read -r h; do
  [ -z "$h" ] && continue
  for t in A AAAA; do
    {
      fetch_doh "dns-cf"     "https://1.1.1.1/dns-query?name=${h}&type=${t}" | node "$PARSE" doh
      fetch_doh "dns-google" "https://dns.google/resolve?name=${h}&type=${t}" | node "$PARSE" doh
    } | sort -u | while IFS= read -r ip; do
      [ -z "$ip" ] && continue
      is_denied "$ip" && continue
      is_bogon_ip "$ip" && continue
      printf '%s\t%s\n' "$h" "$ip" >> "$DNSPAIRS"
    done
  done
done < "$HOSTS"
sort -u "$DNSPAIRS" -o "$DNSPAIRS"

# ---- FIRST RUN: seed the baseline silently (no alerts), then exit -----------
if [ ! -f "$INIT" ]; then
  sort -u "$CERTS_APEX" "$CERTS_TOK" > "$SEEN_CERT"
  cat "$TMP/uscan_doms" > "$SEEN_DOM"
  cut -f2 "$DNSPAIRS" | sort -u > "$SEEN_DNS"
  : > "$NEW1"
  echo "[$TS] baseline seeded — certs:$(wc -l < "$SEEN_CERT") domains:$(wc -l < "$SEEN_DOM") ips:$(wc -l < "$SEEN_DNS") tracked:$(wc -l < "$TRACKED")" >> "$LOG"
  touch "$INIT"
  exit 0
fi

# ---- DELTAS: new certs — apex subdomains (tier1) then token candidates (tier2) ---
comm -13 "$SEEN_CERT" "$CERTS_APEX" | grep -v '^$' | while IFS= read -r name; do
  record "cert" "$name" "ct-log (apex subdomain)" "" 1 A
done
comm -13 "$SEEN_CERT" "$CERTS_TOK" | grep -v '^$' | while IFS= read -r name; do
  record_quiet "cert" "$name" "ct-log (token candidate — review)" "" 2 A
done

# ---- DELTAS: new domains (urlscan) — tier/operator carried from USCAN ------
comm -13 "$SEEN_DOM" "$TMP/uscan_doms" | grep -v '^$' | while IFS= read -r d; do
  row="$(awk -F'\t' -v d="$d" '$1==d{print; exit}' "$USCAN")"
  ip="$(printf '%s' "$row"   | cut -f2)"; asn="$(printf '%s' "$row" | cut -f3)"
  tier="$(printf '%s' "$row" | cut -f4)"; op="$(printf '%s' "$row" | cut -f5)"
  src="$(printf '%s' "$row"  | cut -f6)"
  murl="$(printf '%s' "$row" | cut -f7)"; uuid="$(printf '%s' "$row" | cut -f8)"
  record "domain" "$d" "urlscan${ip:+ @$ip} (${src:-?})" "$asn" "${tier:-2}" "${op:--}" "$murl" "$uuid"
done

# ---- DELTAS: new IPs (DNS on tracked hosts) — never auto-watched ------------
# For an OPERATOR-A host an IP change is never alert-worthy: the kit is 100%
# Cloudflare-fronted, so a new CF edge IP is shared-CDN churn, and a NON-CF IP
# means the domain has LEFT the operators' control (dropped / parked /
# re-pointed). Verified live 2026-09-25: szrcgj.com left Cloudflare for an AWS
# parking pool — the same pool the 2026-09 noise loop grew out of. Both are
# recorded as tier-2 (findings.csv, no Issue); a non-CF IP additionally goes to
# discovered.csv for human review. Real Operator-A alerts come from new CT
# subdomains, new kit-fingerprint domains, and revival-on-Cloudflare instead.
# Other operators keep their host's own tier.
# (No commas in the source/asn text: findings.csv is unquoted CSV.)
cut -f2 "$DNSPAIRS" | sort -u > "$TMP/ips_now"
comm -13 "$SEEN_DNS" "$TMP/ips_now" | grep -v '^$' | while IFS= read -r ip; do
  host="$(awk -F'\t' -v ip="$ip" '$2==ip{print $1; exit}' "$DNSPAIRS")"
  htier="${TIER[$host]:-1}"; hop="${OPER[$host]:-A}"
  [ "$hop" = "A" ] && htier=2
  if is_cf_ip "$ip"; then
    rec=record; [ "$htier" = "2" ] && rec=record_quiet
    "$rec" "ip" "$ip" "dns (${host})" "Cloudflare-edge" "$htier" "$hop"
  else
    rec=record; [ "$htier" = "2" ] && rec=record_quiet
    "$rec" "ip" "$ip" "dns (${host})" "NON-CF — host left Cloudflare (manual review)" "$htier" "$hop"
    printf 'origin,%s,candidate,non-CF on %s (manual review only - auto-promotion removed 2026-09-25),%s\n' "$ip" "$host" "$TS" >> "$DISCO"
  fi
done

# ====================== F4: source-health accounting =========================
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
[ $cr_down -eq 1 ] && echo "[$TS] HEALTH-NOTE crtsh degraded ($CR) — CT token/new-apex discovery skipped this run" >> "$LOG"

DOWNF="$STATE/health_down.txt"; touch "$DOWNF"
NOWDOWN="$TMP/nowdown"; : > "$NOWDOWN"
[ $cs_down  -eq 1 ] && echo "certspotter" >> "$NOWDOWN"
[ $us_down  -eq 1 ] && echo "urlscan"     >> "$NOWDOWN"
[ $dns_down -eq 1 ] && echo "dns"         >> "$NOWDOWN"
sort -u "$NOWDOWN" -o "$NOWDOWN"
comm -13 "$DOWNF" "$NOWDOWN" | grep -v '^$' | while IFS= read -r d; do
  echo "source-health  $d DOWN — this run is BLIND to $d; 'no new indicators' is not trustworthy until it recovers" >> "$NEW1"
  echo "[$TS] HEALTH-ALERT $d went DOWN" >> "$LOG"
done
comm -23 "$DOWNF" "$NOWDOWN" | grep -v '^$' | while IFS= read -r d; do
  echo "[$TS] HEALTH-RECOVERED $d" >> "$LOG"
done
cp "$NOWDOWN" "$DOWNF"

# ================= SELF-EVOLVE: apex auto-promotion ONLY =====================
# Origin auto-promotion is REMOVED (see header). Only a kit-fingerprint-
# confirmed apex (content-hash or strict URL+ASN match) grows the watch —
# these are high-confidence by construction, unlike the old origin-IP path.
cur_apex="$TMP/cur_apex"; printf '%s\n' "${APEXES[@]:-}" | grep -v '^$' | sort -u > "$cur_apex"
sort -u "$KITAPEX" 2>/dev/null | grep -v '^$' | cut -f1 | sort -u | comm -23 - "$cur_apex" | while IFS= read -r a; do
  is_denied "$a" && continue
  # cur_apex already includes every prior AUTO_APEX entry (loaded into APEXES
  # above), so comm -23 alone is sufficient dedup — no separate AUTO_APEX check needed.
  op="$(awk -F'\t' -v a="$a" '$1==a{print $2; exit}' "$KITAPEX")"
  printf '%s\t%s\n' "$a" "${op:-A}" >> "$AUTO_APEX"
  printf 'apex,%s,promoted,kit-fingerprint confirmed,%s\n' "$a" "$TS" >> "$DISCO"
  echo "[$TS] AUTO-PROMOTE apex $a (kit-fingerprint, op=${op:-A}) -> now CT/DNS/scan-watched" >> "$LOG"
done
sort -u "$AUTO_APEX" -o "$AUTO_APEX"

# ================= HASH CHAINING (URLSCAN_KEY required) ======================
# Keeps fingerprints.txt current as the kit gets rebuilt: fetch this run's
# freshest confirmed hits' full result, extract their JS chunk hashes, and
# auto-add a new hash only if it co-occurs with >=2 already-known kit apexes
# (otherwise log it as a review candidate — never trust a single co-occurrence).
if [ -n "${URLSCAN_KEY:-}" ] && [ -s "$FRESH_HITS" ]; then
  KNOWN_HASHES="$TMP/known_hashes"; cut -f1 "$FPRINTS" | grep -v '^#' | grep -v '^$' >> "$KNOWN_HASHES" 2>/dev/null || : > "$KNOWN_HASHES"
  # Known kit infrastructure = reviewed indicators + watchlist apexes + tracked hosts.
  KNOWN_DOMS="$TMP/known_doms"
  { awk -F, 'NR>1 && $1=="domain"{print $2}' "$ROOT/docs/indicators.csv" 2>/dev/null
    sed 's/#.*//' "$WATCH" | awk '$2=="apex"{print $1}'
    cut -f1 "$TRACKED"; cut -f1 "$AUTO_APEX"; } | tr '[:upper:]' '[:lower:]' | grep -v '^$' | sort -u > "$KNOWN_DOMS"
  sort -t "$(printf '\t')" -k1,1n "$FRESH_HITS" | cut -f2 | awk '!seen[$0]++' | head -n 3 | while IFS= read -r uuid; do
    [ -z "$uuid" ] && continue
    hashes="$(us_result "$uuid" | node "$PARSE" urlscan-hashes | sort -u)"
    printf '%s\n' "$hashes" | grep -v '^$' | while IFS= read -r h; do
      grep -qxF "$h" "$KNOWN_HASHES" 2>/dev/null && continue
      # Accept only chunks that co-occur with >=2 ALREADY-KNOWN kit domains and are
      # not ubiquitous (generic Next.js/Cloudflare chunks hit thousands of sites).
      # Validated 2026-10-02 on the rebuilt kit: 13/13 kit chunks accepted, 12/12
      # generic ones rejected (docs/operation-dossier.md §15).
      IFS=$'\t' read -r total cnt <<< "$(us_search "hash:\"$h\"" | node "$PARSE" urlscan-known "$KNOWN_DOMS")"
      if [ "${cnt:-0}" -ge 2 ] && [ "${total:-0}" -lt 1000 ]; then
        printf '%s\tchained\t%s\t%s\tchained\n' "$h" "${TS%%T*}" "${TS%%T*}" >> "$FPRINTS"
        echo "[$TS] HASH-CHAIN new fingerprint $h co-occurs with $cnt known kit domains ($total scans) -> added to fingerprints.txt" >> "$LOG"
        # Archive the actual source, same convention as kit-source/raw_bodies/ —
        # a hash in fingerprints.txt is only as useful to a future analyst as
        # the code sample it represents; urlscan's own retention is not forever.
        RAWDIR="$ROOT/kit-source/raw_bodies"
        if [ -n "${URLSCAN_KEY:-}" ] && [ -d "$RAWDIR" ] && [ ! -s "$RAWDIR/$h.js" ]; then
          body="$(us_response "$h")"
          if [ -n "$body" ]; then
            printf '%s' "$body" > "$RAWDIR/$h.js"
            sum="$(sha256sum "$RAWDIR/$h.js" | awk '{print $1}')"
            printf '%s  %s.js\n' "$sum" "$h" >> "$RAWDIR/SHA256SUMS.txt"
            echo "[$TS] HASH-CHAIN archived source body for $h -> kit-source/raw_bodies/$h.js" >> "$LOG"
          fi
        fi
      elif [ "${cnt:-0}" -ge 1 ] && [ "${total:-0}" -lt 1000 ]; then
        printf 'hash,%s,candidate,co-occurs with %s known kit domain(s) in %s scans - needs manual review,%s\n' "$h" "${cnt:-0}" "${total:-0}" "$TS" >> "$DISCO"
      fi
      sleep 1
    done
  done
fi

# ====================== SAVE: public urlscans of live scam pages =============
# Preserve timestamped evidence (page + screenshot) for every LIVE, ACTIVE
# tracked host. Requires URLSCAN_KEY; visibility = public (citable evidence).
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
  rem=$(comm -23 "$TMP/live_hosts" <(sort -u "$SCANNED") | grep -c . || true)
  [ "${rem:-0}" -gt 0 ] && echo "[$TS] SCAN-BACKLOG $rem live host(s) queued for next run (cap $SCAN_MAX/run)" >> "$LOG"
fi

# ---- decay: mark fail/success streaks on tracked_hosts.tsv -----------------
awk -F'\t' -v ts="$TS" '
  BEGIN {
    while ((getline l < "'"$HOSTS"'") > 0) checked[l]=1
    while ((getline l < "'"$DNSPAIRS"'") > 0) { split(l,a,"\t"); resolved[a[1]]=1 }
  }
  {
    h=$1; tier=$2; oper=$3; src=$4; first=$5; lastok=$6; fails=$7+0; status=$8
    if (h in checked) {
      if (h in resolved) {
        was_dead = (status=="dead" || status=="retired")
        lastok=ts; fails=0; status="active"
        if (was_dead) print h > "'"$TMP"'/revived"
      } else {
        fails++
        if (status=="active" && fails>=8) status="dead"
        else if (status=="dead" && fails>=8+360) status="retired"
      }
    }
    print h"\t"tier"\t"oper"\t"src"\t"first"\t"lastok"\t"fails"\t"status
  }
' "$TRACKED" > "$TMP/tracked_step2"
mv "$TMP/tracked_step2" "$TRACKED"
if [ -s "$TMP/revived" ]; then
  while IFS= read -r h; do
    [ -z "$h" ] && continue
    ip="$(awk -F'\t' -v h="$h" '$1==h{print $2; exit}' "$DNSPAIRS")"
    htier="${TIER[$h]:-1}"; hop="${OPER[$h]:-A}"
    if is_cf_ip "$ip"; then
      record "revival" "$h" "dead/retired host reappeared ON CLOUDFLARE — possible operator reuse" "$ip" "$htier" "$hop"
    else
      echo "[$TS] REVIVED-NONCF $h -> $ip (dead host re-pointed to a non-CF IP; logged only, not alerted — this exact pattern caused the 2026-09-10 incident)" >> "$LOG"
    fi
  done < "$TMP/revived"
fi

# ---- advance dedup-memory state (NOT a re-resolve queue) --------------------
sort -u "$SEEN_CERT" "$CERTS_APEX" "$CERTS_TOK" -o "$SEEN_CERT"
sort -u "$SEEN_DOM" "$TMP/uscan_doms"           -o "$SEEN_DOM"
sort -u "$SEEN_DNS" "$TMP/ips_now"              -o "$SEEN_DNS"

if [ -s "$NEW1" ]; then
  echo "[$TS] $(wc -l < "$NEW1") new tier-1 Operator-A indicator(s) this run" >> "$LOG"
else
  echo "[$TS] no new tier-1 Operator-A indicators" >> "$LOG"
fi
[ -s "$PENDOPB" ] && echo "[$TS] $(wc -l < "$PENDOPB") Operator-B indicator(s) pending in the weekly digest" >> "$LOG"

# ---- orientation snapshot for the next analyst (human or agent) ------------
# Must run LAST — after every state file above has its final value for this
# run. Best-effort (node failing here must never fail the run it's summarizing).
node "$MON/snapshot.js" "$MON" > "$STATE/status.json.tmp" 2>>"$LOG" && mv "$STATE/status.json.tmp" "$STATE/status.json" || rm -f "$STATE/status.json.tmp"
