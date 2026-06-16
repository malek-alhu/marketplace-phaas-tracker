# Marketplace-PhaaS Infrastructure Tracker

> Open research on a multi-brand **marketplace phishing-as-a-service (PhaaS)** operation —
> a full technical teardown of the kit **plus a keyless, self-updating tracker** of its
> live infrastructure (certificates, domains, IPs). Built for researchers, CERTs, and abuse desks.

[![infra-monitor](https://img.shields.io/badge/infra--monitor-keyless%20cron-blue)](.github/workflows/infra-monitor.yml)
[![method](https://img.shields.io/badge/method-passive%20OSINT%20%2B%20static%20analysis-green)](#methodology)
[![scope](https://img.shields.io/badge/scope-research%20only-lightgrey)](SECURITY.md)

---

## What this is

A seller on a classifieds marketplace is contacted by a fake "buyer," moved to a
messaging app, and sent a personalised link to a **fake "receive your payment" page**.
That page is one instance of a professionally engineered, **rented phishing kit** that
impersonates dozens of marketplace, courier, and payment brands across Europe and beyond,
and steals **full card data + 3-D-Secure/OTP in real time** through a live operator
"helpdesk" chat.

This repository documents that **phenomenon** — the kit, its delivery chain, its
command-and-control, and the wider Telegram-distributed PhaaS ecosystem it belongs to —
and then **keeps watching the infrastructure**, because the operators rotate domains
roughly daily. Everything here is built from **passive OSINT and static analysis of code
the kit served publicly**; no operator system was probed or accessed.

Why it matters: this class of operation (Classiscam / Telekopye-style) has stolen tens of
millions of euros across dozens of countries. The specific kit analysed here is
**not publicly documented** — its signatures return zero hits in the usual threat feeds —
so the IOCs and fingerprints below are new, reusable detection material for defenders.

## Key findings

- **Kit:** a production **Next.js 16.2.7 / React 19.2.7** app (Turbopack build, Emotion CSS,
  ~70 code-split chunks) — a versioned, multi-language **page builder**, not a one-off page.
- **Brand reach:** a **~120-brand skin library** (marketplaces + couriers + payment/bank),
  with per-country **Stripe routing hard-coded for 34 countries** — a global card-theft footprint.
- **Real-time theft:** card + 3-D-Secure/OTP are streamed over self-hosted WebSockets
  (`/api/ws/stripe/sync`) to a **live operator "helpdesk" console** (`/ws/helpdesk`) — a human
  relays the OTP within its expiry window, defeating 2FA. ("Stripe" here is trust-branding and
  an internal label; no real Stripe SDK/keys are present — the raw PAN is captured in cleartext.)
- **Evasion:** aged redirector domains (`x-rate-limit:3` worker) → visitor cloaking
  (residential-IP + real-browser + one-time-token + country gate) → **Cloudflare-fronted origin**
  → daily domain rotation + wildcard certs (no CT subdomain leak).
- **Authorship:** **Russian-speaking**, established at code level — 253 Cyrillic strings include a
  Russian WYSIWYG builder admin panel and operator fraud scripts; scam scenarios are versioned
  (`Покупка 1.0` / `Выплата 2.0`, the `2/` token prefix = "payout 2.0").
- **Two operators on one brand:** **Operator A** = this Cloudflare-hidden Next.js kit;
  **Operator B** = a separate older PHP kit whose **real origin IPs are exposed** on bulletproof
  hosting (1337 Services GmbH, **AS210558**) — the fastest de-anonymisation lead.
- **Live & active:** the tracker caught a fresh domain (`olx.express-paycore24.cyou`) mid-research;
  the cluster rotates domains ~daily.

Full write-ups: **[`docs/operation-dossier.md`](docs/operation-dossier.md)** (master),
**[`docs/kit-code-analysis.md`](docs/kit-code-analysis.md)** (code teardown).

## What we monitor & how

[`monitor/check.sh`](monitor/check.sh) is a **single-pass, keyless** infrastructure tracker.
On each run it captures three signal types for the patterns in
[`monitor/watchlist.txt`](monitor/watchlist.txt) and reports only what is **new** since last run:

| Signal | Source (keyless) | What it catches |
|---|---|---|
| **CT logs** | certspotter + crt.sh | new certificates / subdomains of watched apexes; candidate new cluster apexes (token matches) |
| **urlscan** | urlscan.io search API | new live kit domains via the kit's URL/path fingerprints, plus the IP/ASN each was served from |
| **DNS** | DoH via 1.1.1.1 + 8.8.8.8 | new A/AAAA records for in-scope hosts, with **non-Cloudflare origins flagged** (the highest-value lead) |

New indicators are appended to **[`monitor/findings.csv`](monitor/findings.csv)**
(`type,indicator,source,asn,first_seen`) and **`monitor/monitor.log`**; dedup state lives in
`monitor/state/`. To keep signal high, DNS is resolved only for confirmed in-scope hosts, and
broad CT token matches (which collide with unrelated legitimate domains) are logged to
`findings.csv` as lower-confidence *candidates* for manual review — they are never auto-resolved
and never open an Issue. Only high-confidence signals (new subdomains of watched apexes,
kit-fingerprint urlscan domains, and new in-scope IPs / non-Cloudflare origins) raise an alert.

**Watch it live.** The [`infra-monitor`](.github/workflows/infra-monitor.yml) GitHub Action runs
every 6 hours (and on demand), commits the updated log/state/findings back to the repo, and
**opens a GitHub Issue** whenever a new indicator appears. The live view of the operation is
therefore just this repo: the **commit history**, the **Issues**, and the **Actions** tab — no
keys or servers required. Edit `watchlist.txt` to widen or refocus coverage.

```bash
# run it yourself (keyless; needs bash, curl, node):
bash monitor/check.sh        # first run seeds a silent baseline; later runs report deltas
```

## Repository structure

```
.
├── README.md            — this file
├── SECURITY.md          — research-only ethics + handling of the kit source
├── docs/                — reframed reports + the indicator set
│   ├── operation-dossier.md      — master write-up (scam, kit, infra, IOCs, ecosystem)
│   ├── kit-code-analysis.md      — reverse-engineering teardown of the client bundle
│   ├── osint-findings.md         — the original passive-OSINT findings
│   ├── reporting-and-takedown.md — who to notify and what to request
│   └── indicators.csv            — machine-readable IOC set
├── screenshots/         — rendered captures of the live fake pages
├── evidence/            — raw OSINT (RDAP/CT/TLS/DNS/urlscan/captures + SHA-256 manifests)
├── kit-analysis/        — readable, annotated reconstruction of the kit's architecture
├── kit-source/          — the kit's own client JS (decompressed + raw bodies) — see SECURITY.md
├── monitor/             — the keyless infrastructure tracker (check.sh, watchlist, findings, state)
├── tools/               — re-runnable analysis scripts (keyless; read keys from local files)
└── .github/workflows/   — the infra-monitor cron
```

## How to dig in

- **Researchers / threat-intel:** start with [`docs/operation-dossier.md`](docs/operation-dossier.md),
  then [`docs/kit-code-analysis.md`](docs/kit-code-analysis.md) and the readable
  [`kit-analysis/`](kit-analysis/) reconstruction. Pivot from
  [`docs/indicators.csv`](docs/indicators.csv).
- **CERTs / abuse desks:** [`docs/reporting-and-takedown.md`](docs/reporting-and-takedown.md) lists
  the registrars, hosts, and CDN contacts and what to request from each; `indicators.csv` is ready to
  ingest.
- **Detection engineers:** the kit fingerprints in `monitor/check.sh` and the endpoint/token tables
  in `docs/kit-code-analysis.md` are drop-in signatures (e.g. `/a/<base64 "2/…">?us=<gm|dlm|sml|ym>`,
  `wss://<host>/ws/helpdesk`, `wss://<host>/api/ws/stripe/sync`, the `/static/cg.png` builder mark).

## Indicators

The full, machine-readable indicator set is **[`docs/indicators.csv`](docs/indicators.csv)**
(domains, URLs, IPs, endpoints, WebSocket channels, third-party calls, and nameserver fingerprints,
each with operator/brand/ASN/first-seen and a passive-analysis priority). Live additions land in
**[`monitor/findings.csv`](monitor/findings.csv)**.

Note on confidence: Cloudflare edge IPs are shared CDN addresses, **not** the operator's origin —
they are tagged as such. The actionable IP leads are the **Operator-B real origins** (AS210558 et al.)
in `indicators.csv`.

## Methodology

Passive OSINT + static analysis only:
RDAP/WHOIS → CT logs (crt.sh, certspotter) → passive DNS → internet-wide scanner + certificate pivots
→ HTTP-framework fingerprinting → urlscan stored response bodies + screenshots → brotli/gzip
decompression → static analysis of the kit's client JavaScript → multi-source ecosystem research.
DNS is always resolved via public resolvers (1.1.1.1 / 8.8.8.8). Confidence is marked throughout the
reports (**[H]** observed · **[M]** inferred · **[L]** weak · **[NF]** not found, left blank ·
**[EXT]** external published research). Nothing was invented to fill a gap.

## Ethics & disclaimer

This is **defensive security research**. All data was obtained passively from public sources and from
code the kit served openly; **no operator infrastructure was accessed, attacked, or probed**. The
material is published to help defenders detect, report, and take down this infrastructure. See
**[SECURITY.md](SECURITY.md)** for the full statement and for how the (real, malicious) kit source in
`kit-source/` is handled — and **read it before cloning or redistributing**.

## Contributing

Spotted a related domain, certificate, or origin? Add the apex or a distinctive name fragment to
[`monitor/watchlist.txt`](monitor/watchlist.txt) and open a PR or Issue with the indicator and how you
found it (keep it to passive sources — no active probing of operator systems). Corrections to the
analysis are very welcome; cite the artifact.
