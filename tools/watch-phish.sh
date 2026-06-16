#!/usr/bin/env bash
# Tripwire for the Subito/OLX/OMNIVA Next.js phishing kit.
# Each cycle: (1) urlscan search for NEW kit URLs (us=gm signature), (2) certspotter
# new-cert check on known apexes, (3) DNS re-resolve watchlist via 1.1.1.1 (flag non-CF).
# Logs to reports/raw/monitor.log. Passive only.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$HERE/reports/raw/monitor.log"
ST="$HERE/reports/raw/monitor_state"; mkdir -p "$ST"
INTERVAL="${1:-900}"   # seconds
WATCH="subito.verifieer.cc verifieer.cc subito.cam verifa.cc verifica.cc olx.paycore24-express.sbs"
APEXES="verifieer.cc verifa.cc verif.cc subito.cam"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'
log(){ echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }
is_cf(){ # 0 if IP is in a known Cloudflare CIDR
  local ip="$1" o1 o2 o3
  o1="${ip%%.*}"; ip="${ip#*.}"; o2="${ip%%.*}"; ip="${ip#*.}"; o3="${ip%%.*}"
  [[ "$o1" =~ ^[0-9]+$ && "$o3" =~ ^[0-9]+$ ]] || return 1
  case "$o1.$o2" in
    104.1[6-9]|104.2[0-9]|104.3[01]|172.6[4-9]|172.7[01]|162.158|162.159) return 0;;
    173.245) [ "$o3" -ge 48 ] && [ "$o3" -le 63 ] && return 0;;
    188.114) [ "$o3" -ge 96 ] && [ "$o3" -le 99 ] && return 0;;
    141.101) [ "$o3" -ge 64 ] && [ "$o3" -le 127 ] && return 0;;
    108.162) [ "$o3" -ge 192 ] && return 0;;
    190.93)  [ "$o3" -ge 240 ] && return 0;;
    198.41)  [ "$o3" -ge 128 ] && return 0;;
    131.0)   [ "$o3" -ge 72 ] && [ "$o3" -le 75 ] && return 0;;
    103.21)  [ "$o3" -ge 244 ] && return 0;;
    103.22)  [ "$o3" -ge 200 ] && [ "$o3" -le 203 ] && return 0;;
    103.31)  [ "$o3" -ge 4 ] && [ "$o3" -le 7 ] && return 0;;
  esac
  return 1
}

log "=== monitor START (interval ${INTERVAL}s) pid=$$ ==="
while true; do
  # 1) NEW kit DOMAINS via urlscan (keyless search) — dedup by domain, not full line
  curl -s --max-time 30 "https://urlscan.io/api/v1/search/?q=page.url%3A%22us%3Dgm%22&size=100" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);(j.results||[]).forEach(r=>{const p=r.page||{};const dom=(p.domain||"").trim();const url=(p.url||"").trim();if(dom&&/^https?:/.test(url))console.log([dom,p.ip||"",p.asn||"",url.slice(0,90)].join("\t"))})}catch(e){}})' \
    > "$ST/uscan.raw" 2>/dev/null
  awk -F'\t' 'NF>=1 && $1!=""{print $1}' "$ST/uscan.raw" | sort -u > "$ST/uscan.dom.new"
  touch "$ST/uscan.dom.seen"
  comm -13 "$ST/uscan.dom.seen" "$ST/uscan.dom.new" | while read -r d; do
    [ -z "$d" ] && continue
    line="$(grep -F -m1 "$(printf '%s\t' "$d")" "$ST/uscan.raw")"
    log "NEW KIT DOMAIN  $line"
  done
  sort -u "$ST/uscan.dom.new" "$ST/uscan.dom.seen" -o "$ST/uscan.dom.seen"

  # 2) new certs on known apexes
  for ap in $APEXES; do
    n="$(curl -s --max-time 25 "https://api.certspotter.com/v1/issuances?domain=$ap&include_subdomains=true&expand=dns_names" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);console.log(Array.isArray(a)?a.length:0)}catch(e){console.log("?")}})')"
    prev="$(cat "$ST/cert_$ap" 2>/dev/null || echo 0)"
    if [ "$n" != "?" ] && [ "$n" -gt "${prev:-0}" ] 2>/dev/null; then log "NEW CERT on $ap  (count $prev -> $n)"; fi
    [ "$n" != "?" ] && echo "$n" > "$ST/cert_$ap"
  done

  # 3) DNS transitions (1.1.1.1) — flag NXDOMAIN->live and non-Cloudflare IPs
  for h in $WATCH; do
    ip="$(nslookup -type=A "$h" 1.1.1.1 2>/dev/null | awk 'f&&/^Address/{print $2} /^Name:/{f=1}' | grep -vE ':' | head -1)"
    prev="$(cat "$ST/dns_$h" 2>/dev/null || echo '-')"
    cur="${ip:-NX}"
    if [ "$cur" != "$prev" ]; then
      flag=""
      if [ "$cur" != "NX" ] && ! is_cf "$cur"; then
        org="$(curl -sL --max-time 12 "https://rdap.org/ip/$cur" | tr 'A-Z' 'a-z')"
        if ! echo "$org" | grep -qE 'cloudflare|13335'; then
          who="$(echo "$org" | grep -oE '"name":"[^"]+"' | head -1 | sed 's/.*://; s/"//g')"
          flag="  <== NON-CLOUDFLARE (${who:-unknown}) — possible origin / different host!"
        fi
      fi
      log "DNS CHANGE  $h : $prev -> $cur$flag"
      echo "$cur" > "$ST/dns_$h"
    fi
  done
  sleep "$INTERVAL"
done