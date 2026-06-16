#!/usr/bin/env bash
# Passive origin-IP recon. Reads apex from .target (this script never echoes the file's
# raw path content except as part of normal recon output). Zero traffic to the target.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.target" ] || { echo "ERR: create $HERE/.target with the apex domain (one line)"; exit 1; }
TARGET="$(tr -d ' \t\r\n' < "$HERE/.target")"
[ -n "$TARGET" ] || { echo "ERR: .target is empty"; exit 1; }
echo "== sanity: sha256(target) prefix = $(printf '%s' "$TARGET" | openssl dgst -sha256 | awk '{print substr($2,1,12)}')"
echo "== TARGET = $TARGET"

echo; echo "== [1] crt.sh certificate transparency (subdomains + cert identity) =="
CRT="$(curl -s --max-time 40 "https://crt.sh/?q=%25.$TARGET&output=json")"
if [ -n "$CRT" ]; then
  printf '%s' "$CRT" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let a=[];try{a=JSON.parse(s)}catch(e){console.log("  (crt.sh returned non-JSON / rate-limited)");process.exit(0)}
      const names=new Set();
      for(const r of a){String(r.name_value||"").split(/\n/).forEach(n=>names.add(n.trim().toLowerCase()))}
      const list=[...names].filter(Boolean).sort();
      console.log("  unique hostnames in CT logs: "+list.length);
      list.forEach(n=>console.log("    "+n));
    });'
else
  echo "  (no response from crt.sh)"
fi

echo; echo "== [2] DNS resolution of apex + common siblings (find non-CDN origins) =="
SUBS="@ www dev staging stage test direct origin direct-connect cpanel webmail mail mx api admin app ftp vpn smtp dashboard portal"
for s in $SUBS; do
  if [ "$s" = "@" ]; then host="$TARGET"; else host="$s.$TARGET"; fi
  ips="$(nslookup "$host" 2>/dev/null | awk '/^Address: /{print $2}' | grep -vE ':' | tr '\n' ' ')"
  [ -n "$ips" ] && echo "  $host -> $ips"
done

echo; echo "== [3] RDAP/ASN of every resolved IP (flag CDN vs hosting origin) =="
IPS="$( { echo "$TARGET"; for s in $SUBS; do [ "$s" = "@" ] || echo "$s.$TARGET"; done; } \
        | while read -r h; do nslookup "$h" 2>/dev/null | awk '/^Address: /{print $2}'; done \
        | grep -vE ':' | sort -u )"
for ip in $IPS; do
  org="$(curl -s --max-time 15 "https://rdap.org/ip/$ip" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const n=(j.name||"")+" | "+((j.entities&&j.entities[0]&&j.entities[0].handle)||"")+" | AS-from:"+(j.startAddress||"");console.log(n)}catch(e){console.log("?")}})')"
  flag=""; echo "$org" | grep -iqE 'cloudflare|akamai|fastly|cloudfront|amazon|google|microsoft|azure|incapsula|sucuri|stackpath|bunny|cdn' && flag="  <-- CDN/cloud (skip)"
  echo "  $ip : $org$flag"
done
echo; echo "== done. Non-CDN IPs above are origin candidates; validate with Host header via residential proxy. =="
