# Reporting & Takedown — Marketplace Phishing Operation

> **Master reference:** `docs/operation-dossier.md` (full operation writeup + all IOCs). This file is the **action list**.

**Prepared:** 2026-06-14 · **Case:** Subito.it impersonation phishing — WhatsApp `+39 350 860 6411`, domain `subito.verifieer.cc`
**Integrity:** every line marked HIGH = directly observed this session; MEDIUM = correlation/inference; NOT_FOUND = deliberately blank, never guessed. Discarded false leads are listed in §7 so they do not enter any report.

---

## 1. Summary
The reported scam is one node of an **active, multi-brand phishing-as-a-service operation**. A single Next.js 16.2.7 kit (URL signature `/a/<base64 "Mi/…">?us=gm`, Cloudflare-fronted, visitor-cloaked) is used to impersonate **Subito.it (IT), OLX.PL (PL), and OMNIVA (Baltics)**, on disposable domains rotated roughly daily. Delivery is via WhatsApp Business; the lure is a fake "receive your payment / courier" Subito listing that harvests card + 3-D-Secure data.

## 2. Primary evidence (the reported incident) — HIGH
| Item | Value |
|---|---|
| Lure URL (live 2026-06-06) | `https://subito.verifieer.cc/a/Mi8zRFdpNjBQbmFS?us=gm` — title "Seggiolino per bicicletta \| SUBITO.IT", HTTP 200 |
| urlscan record | `019e9db1-0700-7785-942e-c66131c97c9e` (2026-06-06), served Cloudflare `172.67.191.224` AS13335 |
| Apex domain | `verifieer.cc` — registered **2026-02-03**, registrar **Global Domain Group LLC** (IANA 3956), NS `amy/quincy.ns.cloudflare.com` |
| TLS | wildcard `*.verifieer.cc`, Google Trust Services + Let's Encrypt; latest issuance **2026-06-11** |
| App stack | **Next.js 16.2.7** (React 19.2.7, App Router, Turbopack) — exact, read from bundle |
| Phone | WhatsApp Business **+39 350 860 6411** (no public footprint — fresh single-use line) |
| Current status | `subito.verifieer.cc` NXDOMAIN since ~06-12 (operator pulls DNS between sends) |

## 3. Broader operation — sibling infrastructure
**Token scheme (HIGH, reproducible):** `/a/<base64>` decodes to `2/<~10-char base62 victim key>` (no PII embedded; server-side lookup). Examples: `Mi8zRFdpNjBQbmFS`→`2/3DWi60PnaR`, `Mi9XT0tHSjNwUjk0`→`2/WOKGJ3pR94`.

**Same-kit hosts (urlscan-confirmed, HIGH):** `subito.cam` (LIVE, CF, Cloudflare-flagged "Suspected Phishing"), `subito.pagamento.cc`, `subito-ricevere-il-pagamento.click`, and a large OLX cluster `olx.paycore24-express.sbs/.cfd`, `paycore-private.cyou`, `paycore-send/-deal/-cdd.*`, `sendcore.*`, `paysend-paczka.*`, plus OMNIVA front `ordr-747289.com`. Payment-stage siblings: `billing-skrill.cyou`, `processing-skrill.icu`, `inteligentnatransakcja24.cyou`.

**Operator Cloudflare-account fingerprints (HIGH):** OLX cluster → NS `ashton/rose.ns.cloudflare.com`; `subito.cam` → `diana/jake.ns.cloudflare.com`; `verifieer.cc` → `amy/quincy`. (Distinct CF accounts, identical kit.)

**Adjacent older PHP "Login area riservata - Subito.it" kit (MEDIUM same ecosystem) — leaks REAL origins:** AS210558 1337 Services GmbH (`91.206.169.122`, `2.58.56.70/.111`, `45.141.215.196`, `185.241.208.197`, `login-subito.it`); AS34224 nginx (`31.13.195.94` = `supportodati.com`).

## 4. Origin / hosting status
- Next.js kit origin is **behind Cloudflare AS13335 and not passively obtainable** (Shodan + Netlas cert pivots = 0; never exposed un-proxied). Requires Cloudflare disclosure via a legal-process request.
- **Decisive recoverable artifact:** urlscan scan **`019ec607…`** of `olx.paycore24-express.sbs` (2026-06-14 ~12:08) **rendered the real kit** (114 requests). Its result JSON lists the backend/exfil request targets — retrievable with a urlscan API key. **This is the highest-value technical next step.**

## 5. Abuse / takedown / reporting actions
1. **National cybercrime / consumer-protection report** — file with the targeted country's national cybercrime unit or anti-fraud portal (in Italy, commissariatodips.it). Attach §2 evidence + this package + the reporting party's chat evidence (Business badge, number, message, link).
2. **Cloudflare** (proxy/CDN + DNS for most hosts) — https://www.cloudflare.com/abuse (phishing). Cite `subito.cam`, `subito.verifieer.cc`, the redirectors, and the OLX cluster. **A formal abuse / legal-disclosure request** should ask Cloudflare for the **origin IP + account registration/payment** for the accounts behind NS pairs `diana/jake`, `ashton/rose`, `amy/quincy`, `celeste/rob`, `hank/lovisa` — specifically the backend serving the **WebSocket exfil endpoints `wss://<host>/api/ws/stripe/sync` (card data) and `wss://<host>/ws/helpdesk` (operator console)** on `paycore24-express.sbs` / `verifieer.cc`; that backend is the operator's true server.
3. **Registrars** — Global Domain Group LLC `abuse@globaldomaingroup.com` (verifieer.cc); NameSilo (verifa.cc); **`complaint@gname.com` — Gname.com Pte. Ltd. (IANA 1923)**, which registers the redirector cluster (`donshriversvideodrain.com`, `zhkjcx.org`, `dacajncritter.com`, `91tangeche.com` — last already on `client hold`). File one consolidated Gname complaint + ICANN RDDS-inaccuracy form (icann.org/wicf). Request lock + registrant disclosure via legal process.
3b. **Kit backend cluster** — the redirectors all funnel to one PhaaS cluster (`paycore24-express.sbs`, `paycore-deal.*`, `sendcore.*`, `corepay.*`, `verifieer.cc`). Report to the `.sbs/.xyz/.shop/.bond/.cc` TLD registries + NameSilo; killing these breaks every redirector at once.
3c. **Operator-B origin host (faster win — no Cloudflare subpoena needed)** — the separate PHP "Login area riservata - Subito.it" cluster answers on **real IPs**, mostly **1337 Services GmbH** (`abuse@as210558.net`, **AS210558**, bulletproof "rdp.sh", Hamburg DE) + **AS34224**. Send preservation/disclosure for `login-subito.it`, `supportodati.com`, `controlli-subito.it` etc. (full IP list in the master dossier).
4. **CERT-AGID** (https://cert-agid.gov.it) and **D3Lab** — provide the `/a/…?us=gm` + `2/`-token signature and the sibling list for correlation against their trackers (they likely hold more of the cluster).
5. **Messaging / carrier provider** — request preservation/disclosure for the operator-contact number `+39 350 860 6411` (via legal process to the carrier; WhatsApp Business profile preservation).
6. **urlscan** — kit source recovered from rendered scan `019ec607…` (exfil = self-hosted `wss://…/api/ws/stripe/sync` + `/ws/helpdesk`; see master dossier §3A). Report kit + redirector URLs to Google Safe Browsing + PhishTank.

## 6. Evidence manifest
- Prior raw evidence: `evidence/` (RDAP, urlscan summary, TLS, headers, DNS).
- Live captures (this session, SHA-256 in each dir's `SHA256SUMS.txt`): `evidence/captures/<UTC-timestamp>/`.
- Recon tooling (re-runnable): `recon-origin.sh`, `shodan-pivot.sh`, `netlas-pivot.sh`, `enum.sh`, `capture-live.sh`, `watch-phish.sh`.

## 7. Discarded / corrected (keep OUT of any report)
- No registrant identity, carrier, or operator name was recovered — all NOT_FOUND, none invented. Exfil is the WebSocket helpdesk panel, **not** Telegram (earlier hypothesis corrected).
