# Detection content

Drop-in rules for defenders. Everything here is built from literal strings in the recovered kit
bundle (`kit-source/decompressed/`) and from confirmed live captures — see
[`docs/kit-code-analysis.md`](../docs/kit-code-analysis.md) §13 for the endpoint reference.
TLP:CLEAR — share freely.

| File | Use it on | What it catches |
|---|---|---|
| [`sigma/proxy_marketplace_phaas_operator_a.yml`](sigma/proxy_marketplace_phaas_operator_a.yml) | Proxy / secure-web-gateway / CDN URL logs (convert with `sigma convert -t splunk`, `-t elasticsearch`, …) | A user opening a per-victim lure URL (high) or a follow-on stage — fake listing, fake bank login (medium). Keys on URL **structure**, so it survives the daily domain rotation. |
| [`yara/marketplace_phaas_operator_a.yar`](yara/marketplace_phaas_operator_a.yar) | Decompressed JS from web captures, sandbox/crawler output, urlscan Pro, VirusTotal Livehunt/Retrohunt | The kit's own client chunks (card-exfil WebSocket, `/viewer/` fake-bank template, dev WS fallback, Russian builder strings). |
| [`../feeds/`](../feeds/) | DNS blocklists, TIPs, SIEM lookups | Every reviewed kit/redirector domain (`domains.txt`, `adblock.txt`), what still resolves (`domains-live.txt`), Operator-B origin IPs, and a STIX 2.1 bundle. Regenerated every 6 h by the tracker. |

## Validation (2026-09-30)

- **YARA** — matches the 6 kit-specific chunks of the 73-chunk recovered bundle (the rest are
  generic React/Next.js runtime); **0 false positives** on 5,983 unrelated JavaScript files
  (Node.js and npm package sources). Raw captures under `kit-source/raw_bodies/` are
  brotli/gzip-compressed — decompress before scanning.
- **Sigma** — both rules convert cleanly with pySigma (Splunk backend). The patterns match the
  confirmed live URLs below and do **not** match the known look-alikes that fooled earlier versions
  of the tracker (e.g. `autonocion.com/us/gm-is-…`, generic `/viewer/pdf/…` and
  `/helpdesk/tickets/…` paths).

| Confirmed URL (urlscan) | Stage |
|---|---|
| `blocket-system.cam/a/l_yWAOEgAUtxOWlg?us=cg` (01a0ecf0) | entry |
| `olx.paycore24-express.sbs/a/Mi9XT0tHSjNwUjk0?us=gm` (019ec607) | entry |
| `/helpdesk/f4f6nZe3Q8/olx` (019ecbd3) | fake listing |
| `/m/<token>/c3RyaXBl` (019ecbd3) | card capture |
| `olx.paycore24-expressi.cfd/viewer/aXBrbw/Ml8w/j9ft1PyNzO` (019ee4df) | fake bank (PKO BP iPKO) |

## Hunting on urlscan.io

Keyless search API (`https://urlscan.io/api/v1/search/?q=…`):

```text
# kit JS content hashes (primary — survives domain rotation)
hash:fa7787e1805d9c1b4b07bb22aec0c1a22ac7b79b86dcd20ccd1dce2de2bd0552
hash:67736529ec2f5eab8105119d6393bf626fa38c289c83a719dc31748ad3bfbb9a
hash:08a004fa77ac598070256673c457bc4d9a4736e17589f17c0d98d61577e84838

# per-victim entry URLs — then keep only hits served from AS13335 (Cloudflare) whose path is
# /a/<12-24 chars>; urlscan tokenizes words, so "us=gm" alone also matches unrelated articles
page.url:"us=gm" OR page.url:"us=cg"

# fake-bank stage
page.url:viewer AND page.url:Ml8w
```

`node monitor/parse.js urlscan-kit 30 url < response.json` applies the strict path + ASN filter to a
saved search response.

## If a rule fires

The kit steals card data **and** the 3-D Secure/OTP code in real time. Treat a hit on the entry or
card-capture stage as a likely card compromise: contact the user, have the card blocked, and report
the domain (see [`docs/reporting-and-takedown.md`](../docs/reporting-and-takedown.md)).
