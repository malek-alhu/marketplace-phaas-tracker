#!/usr/bin/env bash
# Passive live capture + static endpoint extraction of phishing-kit hosts.
# Saves evidence + SHA-256 hashes. NO data submission, NO exploitation.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HERE/reports/raw/captures/$TS"
mkdir -p "$OUT"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=("https://verifica.cc/" "https://www.verifica.cc/" "https://subito.cam/" "https://subito.cam/a/Mi8zRFdpNjBQbmFS")

echo "capture dir: $OUT"
for u in "${TARGETS[@]}"; do
  slug="$(echo "$u" | sed -E 's#https?://##; s#[/?:].*##')_$(echo "$u" | md5sum | cut -c1-6)"
  hd="$OUT/$slug.headers.txt"; bd="$OUT/$slug.body.html"
  code="$(curl -sS -L --max-time 30 -A "$UA" -H 'Accept-Language: it-IT,it;q=0.9' -H 'Accept: text/html,application/xhtml+xml' -D "$hd" -o "$bd" -w '%{http_code}' "$u" 2>>"$OUT/errors.txt" || echo "ERR")"
  sz="$(wc -c < "$bd" 2>/dev/null || echo 0)"
  srv="$(grep -iE '^(server|x-vercel-id|x-powered-by|cf-ray|x-matched-path):' "$hd" 2>/dev/null | tr '\n' ' ')"
  ttl="$(grep -oiE '<title>[^<]*</title>' "$bd" 2>/dev/null | head -1)"
  echo "---- $u"
  echo "   HTTP $code | ${sz}B | $srv"
  echo "   title: $ttl"
  # endpoint signals in the HTML
  grep -oE '/_next/static/[A-Za-z0-9_/.-]+\.js' "$bd" 2>/dev/null | sort -u | head -8 | sed 's/^/   _next: /'
  grep -oiE 'src="[^"]+\.js"' "$bd" 2>/dev/null | sort -u | head -6 | sed 's/^/   script: /'
  grep -oiE 'https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+' "$bd" 2>/dev/null | sort -u | grep -viE 'w3\.org|schema\.org|googleapis|gstatic|fonts\.' | head -12 | sed 's/^/   url: /'
  grep -oiE 'api\.telegram\.org[^"'\'' ]*|wss?://[^"'\'' ]+|/api/[A-Za-z0-9_/-]+|fetch\(|sendMessage|chat_id|bot[0-9]{6,}:' "$bd" 2>/dev/null | sort -u | head -10 | sed 's/^/   EXFIL?: /'
done

echo; echo "== pulling _next JS chunks referenced and grepping for exfil endpoints =="
for bd in "$OUT"/*.body.html; do
  base="$(dirname "$bd")"; host="$(grep -oE 'https?://[^/]+' "$bd" | head -1)"
  for p in $(grep -oE '/_next/static/[A-Za-z0-9_/.-]+\.js' "$bd" 2>/dev/null | sort -u | head -12); do
    fn="$base/chunk_$(echo "$p" | md5sum | cut -c1-8).js"
    curl -sS --max-time 25 -A "$UA" "${host}${p}" -o "$fn" 2>/dev/null
  done
done
if ls "$OUT"/chunk_*.js >/dev/null 2>&1; then
  echo "-- exfil/endpoint strings across JS chunks --"
  grep -ohiE 'api\.telegram\.org/bot[0-9]+:[A-Za-z0-9_-]+|/sendMessage|chat_id["'\'' :=]+[0-9-]+|wss?://[A-Za-z0-9._:/?-]+|https?://[A-Za-z0-9._-]+/(api|submit|send|gate|panel|collect|log)[A-Za-z0-9._/-]*|fetch\(["'\''`][^"'\''`]+|axios\.[a-z]+\(["'\''`][^"'\''`]+' "$OUT"/chunk_*.js 2>/dev/null | sort -u | head -40
else
  echo "  (no _next JS chunks retrieved — host served interstitial/decoy, not the kit)"
fi

echo; echo "== SHA-256 evidence manifest =="
( cd "$OUT" && for f in *; do [ -f "$f" ] && echo "$(openssl dgst -sha256 "$f" | awk '{print $2}')  $f"; done ) | tee "$OUT/SHA256SUMS.txt"
echo; echo "saved -> $OUT"