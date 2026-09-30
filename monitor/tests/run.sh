#!/usr/bin/env bash
# =============================================================================
# monitor/tests/run.sh — offline regression tests for the tracker.
#   bash monitor/tests/run.sh      (exit 0 = all pass; no network needed)
#
# Each test pins a bug actually hit on 2026-09-25 (see docs/operation-dossier.md
# §13/§15), using fixtures trimmed from REAL urlscan responses captured that day:
#   - autonocion.com false positive: urlscan tokenizes "/us/gm-..." as "us=gm"
#   - shared-IP flood: AWS Global Accelerator 13.223.25.84 (912 scans, no hosts)
#   - curated origin must still pass (and never emit task.url hosts)
#   - empty-tracked-file awk bug, duplicate-host rows, comma-in-CSV corruption:
#     caught as STATE INVARIANTS on the committed files below.
# The CI workflow runs this before the tracker; a failure fails the run loudly.
# =============================================================================
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MON="$(cd "$HERE/.." && pwd)"
FX="$HERE/fixtures"
P="node $MON/parse.js"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  ok   $1"; }
bad() { fail=$((fail+1)); echo "  FAIL $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== parse.js: kit fingerprint precision =="
out="$($P urlscan-kit 99999 url < "$FX/us_query.json")"
check "us= query rejects autonocion.com (word-tokenizer false positive)" '! printf "%s" "$out" | grep -q autonocion'
check "us= query accepts the 3 real /a/<token> kit hits"               '[ "$(printf "%s\n" "$out" | grep -c .)" -eq 3 ]'
check "kit rows carry 6 cols (apex,dom,ip,asn,matched_url,scan_uuid)"   '[ -z "$(printf "%s\n" "$out" | awk -F"\t" "NF!=6")" ]'
check "kit rows carry a real matched_url + scan_uuid"                    '[ -z "$(printf "%s\n" "$out" | awk -F"\t" "\$5!~/^https?:/ || \$6==\"\"")" ]'

out="$($P urlscan-kit 99999 hash < "$FX/hash_query.json")"
check "hash query accepts (content hash = kit identity)"                 '[ "$(printf "%s\n" "$out" | grep -c .)" -ge 1 ]'
out="$($P urlscan-kit 30 hash < "$FX/hash_query.json")"
check "hash query drops stale (>30d) hits"                               '[ -z "$out" ]'

echo "== parse.js: origin-IP context (the 2026-09 flood vector) =="
out="$($P urlscan-ip 13.223.25.84 99999 15 < "$FX/shared_ip.json")"
check "shared AWS IP trips the circuit breaker"                          'printf "%s" "$out" | grep -q "^CIRCUIT_BREAK"'
check "shared AWS IP emits no domains"                                   '[ "$(printf "%s\n" "$out" | grep -vc "^CIRCUIT_BREAK")" -eq 0 ]'
out="$($P urlscan-ip 193.148.56.18 99999 15 < "$FX/curated_ip.json")"
check "low-tenant curated origin passes (no breaker)"                    '! printf "%s" "$out" | grep -q CIRCUIT_BREAK && [ -n "$out" ]'
check "origin rows are page.domain only, 3 cols (dom,url,uuid)"          '[ -z "$(printf "%s\n" "$out" | awk -F"\t" "NF!=3")" ]'

echo "== parse.js: CSV safety =="
out="$(printf '%s' '{"results":[{"task":{"time":"2099-01-01T00:00:00Z","uuid":"u1","url":"https://x.test/a/AAAAAAAAAAAAAAAA?us=gm&q=a,b"},"page":{"url":"https://x.test/a/AAAAAAAAAAAAAAAA?us=gm&q=a,b","domain":"x.test","apexDomain":"x.test","ip":"1.2.3.4","asn":"AS13335"}}]}' | $P urlscan-kit 99999 url)"
check "commas inside matched_url are %2C-encoded (no CSV column shift)"  'printf "%s" "$out" | grep -q "q=a%2Cb" && ! printf "%s" "$out" | cut -f5 | grep -q ","'

echo "== check.sh: hash-chaining learns only from confirmed kit hits =="
CS="$MON/check.sh"
check "FRESH_HITS never fed from raw search results"                     '! grep -q "slice(0,2)" "$CS"'
check "FRESH_HITS only written inside the two urlscan-kit loops (2 writers)" '[ "$(grep -c ">> \"\$FRESH_HITS\"" "$CS")" -eq 2 ]'
order="$(printf '2\thashhit\n1\turlhit\n2\thashhit\n1\turlhit2\n' | sort -t "$(printf '\t')" -k1,1n | cut -f2 | awk '!seen[$0]++' | head -n 3 | paste -sd,)"
check "chaining picks URL+ASN hits first, deduped (rebuilt kit visible first)" '[ "$order" = "urlhit,urlhit2,hashhit" ]'
check "check.sh uses that exact priority pipeline"                        'grep -qF "sort -t \"\$(printf '"'"'\\t'"'"')\" -k1,1n \"\$FRESH_HITS\" | cut -f2 | awk '"'"'!seen[\$0]++'"'"' | head -n 3" "$CS"'

echo "== state invariants (committed files) =="
F="$MON/findings.csv"; TH="$MON/state/tracked_hosts.tsv"; W="$MON/watchlist.txt"; D="$MON/denylist.txt"
check "findings.csv: every row has exactly 9 columns"                    '[ -z "$(awk -F, "NF!=9" "$F")" ]'
check "findings.csv: header is the 9-column schema"                      '[ "$(head -1 "$F")" = "type,indicator,source,asn,first_seen,tier,operator,matched_url,scan_uuid" ]'
check "findings.csv: tier is 1 or 2"                                     '[ -z "$(tail -n +2 "$F" | awk -F, "\$6!=\"1\" && \$6!=\"2\"")" ]'
if [ -s "$TH" ]; then
  check "tracked_hosts.tsv: one row per host (no duplicates)"            '[ -z "$(cut -f1 "$TH" | sort | uniq -d)" ]'
  check "tracked_hosts.tsv: 8 fields, first_seen + valid status on every row" \
        '[ -z "$(awk -F"\t" "NF!=8 || \$5==\"\" || (\$8!=\"active\" && \$8!=\"dead\" && \$8!=\"retired\")" "$TH")" ]'
fi
check "watchlist.txt: every entry is <entry> <kind> <tier> <operator>" \
      '[ -z "$(sed "s/#.*//" "$W" | awk "NF && (NF!=4 || \$2!~/^(apex|token|origin|dnsonly)\$/ || \$3!~/^[12]\$/ || \$4!~/^(A|B|-)\$/)")" ]'
denied="$(sed 's/#.*//' "$D" | tr -d ' \t' | grep -v '^$' | grep -v '\.$')"
check "no denylisted entry is in watchlist.txt or tracked_hosts.tsv" \
      '[ -z "$(printf "%s\n" "$denied" | grep -xFf - <( (sed "s/#.*//" "$W" | awk "{print \$1}"; cut -f1 "$TH" 2>/dev/null) | grep -v "^$") )" ]'
check "snapshot.js emits valid JSON"                                     'node "$MON/snapshot.js" "$MON" | node -e "JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"))"'

echo "== export-feeds.js: public feeds never harm victims =="
FT="$(mktemp -d)"; mkdir -p "$FT/docs" "$FT/monitor/state"
cp "$MON/../docs/indicators.csv" "$FT/docs/"; cp "$F" "$W" "$D" "$FT/monitor/"; cp "$TH" "$FT/monitor/state/" 2>/dev/null
node "$MON/export-feeds.js" "$FT" >/dev/null 2>&1
feed="$(grep -hv '^#' "$FT/feeds/domains.txt" 2>/dev/null)"
victims="$(sed 's/#.*//' "$W" | awk '$2=="dnsonly"{print $1}')"
check "docs/indicators.csv: every row has 8 CSV fields (quotes respected)" 'node -e "
  for (const l of require(\"fs\").readFileSync(process.argv[1],\"utf8\").split(\"\n\").filter(Boolean)) {
    let n=1,q=false; for (const c of l) { if (c===\"\\\"\") q=!q; else if (c===\",\"&&!q) n++; }
    if (n!==8) process.exit(1); }" "$MON/../docs/indicators.csv"'
check "export-feeds.js writes a non-empty domain feed"                   '[ -n "$feed" ]'
check "no hacked-legit (dnsonly) site or its subdomains in the feed"     '[ -z "$(printf "%s\n" "$feed" | grep -E "(^|\.)($(printf "%s\n" "$victims" | sed "s/\./\\\\./g" | paste -sd"|"))\$")" ]'
check "no denylisted entry in any feed"                                  '[ -z "$(printf "%s\n" "$denied" | grep -xFf - <(grep -hv "^[#!]" "$FT"/feeds/*.txt | sed "s/^||//; s/\^\$//"))" ]'
check "stix2-bundle.json parses and only holds 2.1 objects"              'node -e "const b=JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\"));if(b.type!==\"bundle\"||b.objects.some(o=>o.type!==\"bundle\"&&o.spec_version!==\"2.1\"))process.exit(1)" "$FT/feeds/stix2-bundle.json"'
rm -rf "$FT"

echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
