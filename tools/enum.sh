#!/usr/bin/env bash
set -u
R=1.1.1.1
T=verifieer.cc
rec(){ nslookup -type="$2" "$1" "$R" 2>&1; }
addrs(){ nslookup -type=A "$1" "$R" 2>/dev/null | awk 'f&&/^Address/{print $2} /^Name:/{f=1}' | grep -vE ':'; }

echo "############ CURRENT STATE (resolver $R) ############"
echo "== apex $T records =="
for ty in NS SOA A AAAA MX TXT CAA; do
  echo "-- $ty --"; rec "$T" "$ty" | grep -iE "$ty|Address|server|mail|text|can't find|Non-exist" | grep -vE "^Server:|^Address:  $R" | head -6
done

echo; echo "== wildcard test (3 random labels) =="
for r in zzqq-no-exist-1 wpdvx7 random404test; do
  out="$(nslookup -type=A "$r.$T" "$R" 2>&1)"
  if echo "$out" | grep -qi "Non-existent"; then echo "  $r.$T -> NXDOMAIN"; else echo "  $r.$T -> $(echo "$out"|awk 'f&&/^Address/{print $2} /^Name:/{f=1}'|tr '\n' ' ')"; fi
done

echo; echo "== subdomain enumeration (public resolver) =="
WL="subito www mail mx smtp webmail imap pop ns1 ns2 api app m mobile login signin secure account accounts auth pay pays payment payments pagamento pagamenti checkout cassa verify verifica conferma confirm cdn static assets img images media files panel admin administrator dashboard portal manage it en de fr es shop store negozio order ordine ordini spedizione shipping tracking track dev develop staging stage test testing demo vpn ftp sftp gateway link links go click clicks r redirect a b c d e x y wallet bank carta card subito-it subitoit secure-subito my user users client clients portale area sso id verifica-it"
found=0
for s in $WL; do
  a="$(addrs "$s.$T" | tr '\n' ' ')"
  if [ -n "$a" ]; then echo "  $s.$T -> $a"; found=$((found+1)); fi
done
echo "  resolving subdomains found: $found"

echo; echo "############ CERT / INFRA TIMELINE (certspotter) ############"
curl -s --max-time 40 "https://api.certspotter.com/v1/issuances?domain=$T&include_subdomains=true&expand=dns_names&expand=issuer" \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let a;try{a=JSON.parse(s)}catch(e){console.log("non-JSON:",s.slice(0,150));return}if(!Array.isArray(a)){console.log(JSON.stringify(a).slice(0,150));return}a.sort((x,y)=>(x.not_before||"").localeCompare(y.not_before||"")).forEach(c=>{const iss=(c.issuer&&(c.issuer.name||c.issuer))||"";console.log("  "+(c.not_before||"?").slice(0,10)+" -> "+(c.not_after||"?").slice(0,10)+"  ["+String(iss).replace(/.*O=/,"").slice(0,28)+"]  "+(c.dns_names||[]).join(", "))})})'