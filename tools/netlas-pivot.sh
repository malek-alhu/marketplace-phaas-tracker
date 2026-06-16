#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
KEY="$(tr -d ' \t\r\n' < "$HERE/.netlas_key")"
T="$(tr -d ' \t\r\n' < "$HERE/.target")"
B="https://app.netlas.io/api"
H=(-H "X-API-Key: $KEY")

dump(){ # generic: print count + per-item ip/asn/org/certCN/names/hosts + flag non-CF
node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let j;try{j=JSON.parse(s)}catch(e){console.log("  RAW:",s.slice(0,300));return}
  const items=j.items||[];
  console.log("  items:",items.length);
  items.forEach(o=>{
    const d=o.data||o;
    const ips=[...new Set((JSON.stringify(o).match(/(?:\d{1,3}\.){3}\d{1,3}/g)||[]))];
    const cert=d.certificate||{};
    const cn=(cert.subject&&(cert.subject.common_name||cert.subject.CN))||cert.subject_common_name||"";
    const names=(cert.names||cert.subject_alt_name||[]).join?cert.names||cert.subject_alt_name:[];
    const asn=(d.whois&&(d.whois.asn||(d.whois.net&&d.whois.net.asn)))||d.asn||"";
    const org=(d.whois&&(d.whois.org||(d.whois.net&&d.whois.net.description)))||"";
    const hosts=d.domain||d.host||d.names||[];
    const blob=JSON.stringify(o).toLowerCase();
    const cf=/cloudflare|as13335|"13335"/.test(blob)||ips.some(x=>/^104\.(1[6-9]|2[0-9]|3[01])\.|^172\.6[4-9]\.|^172\.7[01]\./.test(x));
    console.log("   ip(s):"+ips.join(",")+"  port:"+(d.port||"")+"  asn:"+asn+"  org:"+String(org).slice(0,24)
      +"  certCN:"+cn+"  names:"+(Array.isArray(names)?names.join("|"):"")+"  hosts:"+(Array.isArray(hosts)?hosts.join("|"):hosts)
      +(cf?"   [CF]":"   <== NON-CF CANDIDATE"));
  });
};'; }

echo "###### NETLAS end-to-end pivot for $T ######"
echo; echo "== A) certificates index: full-text $T =="
curl -s --max-time 40 -G "${H[@]}" "$B/certificates/" --data-urlencode "q=$T" | dump
echo; echo "== B) responses (host scans): certificate names = $T =="
curl -s --max-time 40 -G "${H[@]}" "$B/responses/" --data-urlencode "q=certificate.subject_alt_name:$T" | dump
echo; echo "== C) responses (host scans): full-text $T =="
curl -s --max-time 40 -G "${H[@]}" "$B/responses/" --data-urlencode "q=$T" | dump
echo; echo "== D) responses: http body/hostname contains $T (origin via app content) =="
curl -s --max-time 40 -G "${H[@]}" "$B/responses/" --data-urlencode "q=host:$T" | dump
echo; echo "== E) domains index: domain:$T =="
curl -s --max-time 40 -G "${H[@]}" "$B/domains/" --data-urlencode "q=domain:$T" | dump
echo; echo "== coins left =="
curl -s --max-time 15 "${H[@]}" "$B/users/current/" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log("  coins:",j.plan&&j.plan.coins)}catch(e){}})'