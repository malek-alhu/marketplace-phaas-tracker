#!/usr/bin/env bash
# Shodan origin pivot for the target in .target. Reads key from .shodan_key (gitignored).
# Goal: find a non-Cloudflare host presenting the target's cert / hostname = candidate origin.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.shodan_key" ] || { echo "ERR: put your key in $HERE/.shodan_key"; exit 1; }
[ -f "$HERE/.target" ]     || { echo "ERR: missing .target"; exit 1; }
KEY="$(tr -d ' \t\r\n' < "$HERE/.shodan_key")"
T="$(tr -d ' \t\r\n' < "$HERE/.target")"
B="https://api.shodan.io"

echo "== plan / credits =="
curl -s --max-time 20 "$B/api-info?key=$KEY" \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log("  plan:",j.plan,"| query_credits:",j.query_credits,"| scan_credits:",j.scan_credits)}catch(e){console.log("  ",s.slice(0,160))}})'

parse_matches () { node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    let j;try{j=JSON.parse(s)}catch(e){console.log("  non-JSON/err:",s.slice(0,200));return}
    if(j.error){console.log("  error:",j.error);return}
    const m=j.matches||[];console.log("  total:",j.total,"shown:",m.length);
    m.forEach(x=>{
      const cf=String(x.asn)==="AS13335"||/cloudflare/i.test(x.org||"")||/cloudflare/i.test(x.isp||"");
      const cn=(x.ssl&&x.ssl.cert&&x.ssl.cert.subject&&x.ssl.cert.subject.CN)||"";
      console.log("   "+(x.ip_str||"?")+":"+(x.port||"?")+"  "+(x.asn||"?")+"  "+((x.org||x.isp||"").slice(0,28))
        +"  host="+((x.hostnames||[]).join(",")||"-")+"  certCN="+cn+(cf?"   [CLOUDFLARE]":"   <== NON-CF CANDIDATE"));
    });
  });'; }

for Q in "ssl.cert.subject.cn:$T" "ssl:\"$T\"" "hostname:$T" "ssl.cert.subject.cn:*.$T"; do
  echo; echo "== search: $Q =="
  curl -s --max-time 40 -G "$B/shodan/host/search" --data-urlencode "key=$KEY" --data-urlencode "query=$Q" | parse_matches
done

echo; echo "== Shodan-known DNS for $T =="
curl -s --max-time 30 "$B/dns/domain/$T?key=$KEY" \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);if(j.error){console.log("  error:",j.error);return}console.log("  subdomains:",(j.subdomains||[]).join(", ")||"-");(j.data||[]).filter(r=>["A","AAAA","CNAME"].includes(r.type)).slice(0,40).forEach(r=>console.log("   "+r.type+"  "+(r.subdomain||"@")+" -> "+r.value+(r.last_seen?"  ("+r.last_seen.slice(0,10)+")":"")))}catch(e){console.log("  ",s.slice(0,160))}})'
echo; echo "== done. NON-CF CANDIDATE lines = possible origin; validate with Host header. =="
