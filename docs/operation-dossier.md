# FULL OPERATION DOSSIER — Multi-Brand Marketplace Phishing PhaaS
**Documents the entire operation and ALL discoveries — not limited to Subito.** For researchers, CERTs, abuse desks, and threat-intelligence teams.

- **Compiled:** 2026-06-15 (UTC). **Investigation window:** 2026-06-14 → 2026-06-15.
- **Data freshness:** all OSINT in this dossier was collected **2026-06-14/15** unless a row carries its own date. Underlying urlscan captures span **2021 → 2026-06-15**; live infrastructure state verified **2026-06-15**. See the **Discovery Log (§15)** for what was found when.
- **Confidence key:** **[H]** directly observed this investigation · **[M]** correlation/inference · **[L]** weak inference · **[NF]** not found (left blank, never invented) · **[EXT]** external published research (cited).
- **Three things target these brands — keep separate:** **Operator A** = the analysed Next.js multi-brand PhaaS (Cloudflare-hidden origin, *publicly undocumented kit*); **Operator B** = an older PHP "Login area riservata" kit with **exposed real origins** on bulletproof hosting; **the wider ecosystem** = the named PhaaS franchises (Classiscam, Telekopye) this class belongs to (§8).

---

## 1. Executive summary
A seller on a classifieds marketplace is contacted by a fake "buyer," moved to WhatsApp, and sent a personalised link to a **fake "receive your payment" page**. The page is one instance of a **phishing-as-a-service (PhaaS)** kit — a professionally engineered **Next.js 16.2.7** (React 19.2.7) web app that impersonates **Subito (IT), OLX (PL), Kleinanzeigen (DE), Marktplaats (NL), OMNIVA (Baltics), InPost**, and (in-kit) Leboncoin, Western Union, DPD, Poshmark and Spanish marketplaces. It harvests **full card data + 3-D-Secure/OTP in real time** over WebSockets to a **live operator "helpdesk" chat**, wrapped in heavy anti-analysis (redirector gateways, IP/ASN reputation blocking, visitor cloaking, Cloudflare fronting, daily domain rotation). This class of operation is run as a **Telegram-distributed criminal franchise** (Classiscam/Telekopye-style), predominantly by **Russian-speaking / Eastern-European** crews, targeting Western/Central Europe. The analysed kit's origin is **Cloudflare-hidden → needs an abuse / legal-disclosure request (§12)**; a *separate* operator's kit (§3B) is hosted on **directly-actionable bulletproof IPs**.

---

## 2. How the scam works (kill chain) [H]
0. **Bait** — fake buyer on the marketplace → moves victim to **WhatsApp Business** (observed: `+39 350 860 6411`); "I already paid via courier — click to receive your money."
1. **Redirector** — link hits an aged **gateway domain** (e.g. `donshriversvideodrain.com/766d330`) with a custom `x-rate-limit-limit: 3` worker; client-side redirect to the kit.
2. **Cloaking gate** — fingerprints **residential IP + real browser + valid one-time token + country** (live `api.ip.sb/geoip`); non-victims/scanners get a benign decoy.
3. **Lure page** — pixel-perfect "the buyer already paid"; "Ricevi fondi" button; fake **Stripe** box; courier + card-brand logos; live "Chat supporto / Operatore 24/7".
4. **Live social engineering** — a human operator chats in real time (captured verbatim, §6).
5. **Card harvest (`/payment`)** — card number, CVV, expiry, full billing, login, password, phone, PIN.
6. **Bank tailoring** — card BIN → `binlist.net` / `data.handyapi.com` → matching fake bank/3-DS screen.
7. **Real-time OTP theft** — streamed to operator, who pushes a **real** charge/transfer and relays the OTP/3-DS code within its expiry → **defeats 2FA**.
8. **Cash-out** — fraudulent charges / mule / **crypto** laundering [EXT].

---

## 3. The kits discovered

### 3A. Operator A — the Next.js multi-brand PhaaS (the analysed kit) [H]
- **Stack:** **Next.js 16.2.7** (App Router, Turbopack production build), **React 19.2.7**, Emotion CSS, ~70 code-split JS chunks; backend on same Cloudflare-fronted host; real-time WebSockets. (Exact version read literally from the bundle: `next@16.2.7`.)
- **Per-victim routing:** `/a/<token>` where `base64(token)="2/<base62>"` → `/helpdesk/<token>/<brand>` loads that victim's item/price/fake-buyer/address/order-ID.
- **Exfil / C2 (self-hosted):** `getWsBaseUrl()=wss://<hostname>`, `getApiBaseUrl()=https://<hostname>`; env `WS_BASE_URL`/`API_BASE_URL` (dev fallback `ws://localhost:5002`). Channels: `wss://<host>/api/ws/stripe/sync?ad_id=<id>&service_method=<…>` (card data) · `wss://<host>/ws/helpdesk` (operator console) · `wss://<host>/api/ws/sync` (state). **No separate C2 host** → origin = Cloudflare-fronted kit domain → needs a Cloudflare abuse / legal-disclosure request.
- **Harvested fields:** `card_number`, `card_cvv`, `expiry`, `billingName/AddressLine1/City/State/ZipCode`, `login`, `password`, `phone`, `pin`.
- **Evasion:** redirector + `x-rate-limit:3`; ASN/IP-reputation 403; visitor cloaking decoy; `api.ip.sb` geo-check; one-time tokens; daily domain rotation (DNS pulled between sends); Cloudflare fronting; wildcard certs (no CT subdomain leak).
- **Public documentation status: [NF / EXT].** The exact signatures (`/ws/helpdesk`, `/api/ws/stripe/sync`, `/a/<base64>?us=gm`) return **zero hits** in D3Lab, CERT-AGID, Group-IB, urlscan, or researcher feeds — **this kit is not publicly named.** Closest *named analog*: **Perception Point (Jul 2024)** documented a kit with a **live operator-chat widget + Stripe spoof + real-time card theft** (Etsy/Reverb/Behance templates) — same *technique family*, not provably the same kit [EXT].

- **Server routes (victim-facing, live-confirmed 2026-06-15 via scan 019ecbd3):** `/a/<token>` (entry) → `/helpdesk/<decoded-token>/<brand>` (personalised listing, e.g. `/helpdesk/f4f6nZe3Q8/olx`) → **`/m/<token>/<base64-service>`** = card-capture module (captured as `/m/<token>/c3RyaXBl`, where `c3RyaXBl`="stripe") · `/cdn/<hash>` (assets) · `/static/helpdesk/audio/*.mp3` (operator-chat notification sounds) · `/geoip` (cloak check via `api.ip.sb`) · WS `/api/ws/stripe/sync`, `/api/ws/sync`, `/ws/helpdesk`. Root `/` = 404 (not crawlable). [H]
- **Operator console / panel:** the authenticated other end of `wss://<host>/ws/helpdesk` — **its login/admin URL is NOT exposed in the victim client code** and runs on separate Cloudflare-hidden infrastructure. (The bundle's many "panel" strings are CSS page-builder classes, not an admin panel — do not overstate.) **For defenders / abuse desks:** a Cloudflare abuse / legal-process request can obtain the `/ws/helpdesk` backend host + account. [H]

### 3B. Operator B — PHP "Login area riservata - Subito.it" kit (EXPOSED origins) [H]
A *different* operator/codebase (PHP, Apache/nginx) targeting Subito with credential+card harvest. **69 distinct hosts 2021→2026** (`evidence/subito_phishing_history.txt`). Unlike Operator A it is **not** fully Cloudflare-hidden — it answers on real IPs (§5.7), primarily on **1337 Services GmbH (AS210558)** bulletproof hosting → **directly actionable** without a Cloudflare subpoena.

---

## 4. Infrastructure overview
- **Operator A:** everything behind **Cloudflare AS13335** (origin hidden); domains rotate ~daily; registrars **Global Domain Group** (kit apex) + **Gname.com** (redirectors); Cloudflare NS; wildcard TLS (Google Trust Services + Let's Encrypt).
- **Delivery layer:** aged "gateway" domains (Gname.com) with the `x-rate-limit:3` worker.
- **Operator B:** **real hosting** — **AS210558 (1337 Services GmbH, "rdp.sh", Hamburg DE)** + **AS34224** and others (§5.7, §10).

---

## 5. INDICATORS OF COMPROMISE (IOCs) — full operation

### 5.1 Operator-A kit hosts (all AS13335 Cloudflare; IPs are CF edge, NOT origin) [H]
| Host | Brand | CF edge IP(s) | First seen | Scan UUID |
|---|---|---|---|---|
| `subito.verifieer.cc` | Subito | 172.67.191.224, 104.21.20.73 | 2026-06-06 | 019e9db1-0700-7785-942e-c66131c97c9e |
| `subito.cam` | Subito | 188.114.96.3/.97.3 | 2026-06-04 | 019e909c-3bfd-755c-9f48-77df174e12e0 |
| `subito.pagamento.cc` | Subito | 188.114.97.3 | 2026-02-09 | 019c42ae-0b96-76da-98dd-75d421eae184 |
| `subito-ricevere-il-pagamento.click` | Subito | 104.21.80.164 | 2026-02-23 | 019c8c90-9e18-7438-aa00-5a4157e9ca42 |
| `olx.paycore24-express.sbs` | OLX | 172.67.150.57, 104.21.11.194 | 2026-06-14 | 019ec607-fa0d-72f9-9a7f-b86b298c4565 |
| `olx.paycore24-express.cfd` | OLX | 172.67.223.34, 2a06:98c1:3120::3 | 2026-06-13 | — |
| **`olx.express-paycore24.cyou`** *(caught live by monitor; NS ashton/rose)* | OLX | 104.21.54.53, 172.67.223.218 | **2026-06-15 10:37Z** | token `/a/Mi9mNGY2blplM1E4`=`2/f4f6nZe3Q8`; scan **019ecbd3** (rendered live 15:08Z) |
| `olx.paycore-private.cyou` | OLX | 188.114.96.3/.97.3 | 2026-06-13 | — |
| `olx.paycore-send.xyz/.shop/.sbs` | OLX | 172.67.211.8, 2606:4700:3035::6815:3557 | 2026-06-11 | — |
| `olx.paysend-paczka.shop/.xyz` | OLX | 188.114.96.3/.97.3 | 2026-06-10 | — |
| `olx.paycore-deal.xyz/.shop` | OLX | 104.21.85.142, 172.67.206.167 | 2026-06-09 | — |
| `olx.sendcore.sbs/.cyou/.bond` | OLX | 172.67.150.97, 104.21.66.43, 104.21.63.213 | 2026-06-06 | — |
| `olx.corepay.sbs` | OLX | 172.67.215.226 | 2026-06-04 | — |
| `olx.paycore-cdd.cfd/.sbs` | OLX | 188.114.97.3, 172.67.175.5 | 2026-06-01 | — |
| `olx.billing-skrill.cyou`, `olx.processing-skrill.icu` | OLX (pay stage) | 188.114.97.3 | 2026-03/04 | — |
| `olx.pl-696967.sbs` | OLX | 104.21.8.163 | 2026-06 | — |
| `ordr-747289.com` | OMNIVA | 172.67.144.163 | 2026-01-23 | — |
| `verifieer.cc` (apex) | — | 172.67.191.224, 104.21.20.73; IPv6 2606:4700:3032::ac43:bfe0, 2606:4700:3031::6815:1449 | reg 2026-02-03 | — |
| `srvc-de836549.info`, `9853192.biz` | Kleinanzeigen | (CF) | 2026-06 | — |
| `id5963835.live` | Marktplaats | (CF) | 2026-06 | — |

### 5.2 Redirector / gateway domains [H]
| Domain | Registrar | Reg / re-weaponised | Nameservers | CF edge IP | Note |
|---|---|---|---|---|---|
| `donshriversvideodrain.com` | Gname.com (1923) | 2008 / 2026-06-01 | celeste/rob.ns.cloudflare.com | 104.21.8.154, 172.67.188.140 | Subito lure |
| `zhkjcx.org` | Gname.com (1923) | 2012 / 2026-06-12 | hank/lovisa.ns.cloudflare.com | 172.67.134.175, 104.21.25.211 | OLX lure |
| `dacajncritter.com` | Gname.com (1923) | — | andronicus/virginia.ns.cloudflare.com | (CF) | `/order/<8>` |
| `91tangeche.com` | Gname.com (1923) | — | share-dns.com/.net | — | **client hold** |
| `welcomeshopping.best` | NameSilo (1479) | — | autumn/gordon.ns.cloudflare.com | (CF) | — |
| `pdfprotectfree.com` | NameSilo (1479) | — | site4now / cloudgpp | — | InPost, Marktplaats |

Gateway signature: short opaque path + Cloudflare FRA edge + header **`x-rate-limit-limit: 3`** + client-side redirect.

### 5.3 Cloudflare NS-account fingerprints (subpoena anchors) [H]
`amy/quincy` (verifieer.cc) · `ashton/rose` (OLX cluster) · `diana/jake` (subito.cam) · `celeste/rob` (donshriversvideodrain.com) · `hank/lovisa` (zhkjcx.org) · `andronicus/virginia` (dacajncritter.com) · `autumn/gordon` (welcomeshopping.best) · `gina/rodrigo` (verifa.cc)

### 5.4 URL / endpoint / token patterns [H]
`https://<host>/a/<base64>?us=<gm|dlm|sml|ym>` · token `base64⁻¹="2/<base62>"` (e.g. `Mi8zRFdpNjBQbmFS`→`2/3DWi60PnaR`) · `/helpdesk/<token>/<brand>` · `/payment` · `/cdn/<32-hex>` · WS `wss://<host>/api/ws/stripe/sync`, `/ws/helpdesk`, `/api/ws/sync` · env `WS_BASE_URL`, `API_BASE_URL`, fallback `ws://localhost:5002`.

### 5.5 Third-party services the kit calls [H]
`api.ip.sb/geoip` (geo/cloak) · `lookup.binlist.net` + `data.handyapi.com/bin/` (BIN→bank) · `nominatim.openstreetmap.org` (geocode) · `cdn.jsdelivr.net` (currency) · `v2.simpalsid.com/graphql` (Simpals/OLX auth relay).

### 5.6 Subject identifiers [H]
WhatsApp Business **`+39 350 860 6411`** (no public scam-DB footprint — fresh line) · wildcard `*.verifieer.cc` (Google Trust Services WE1 + Let's Encrypt; issuances 2026-04-03/04, 06-01, 06-11) · registrar abuse: `abuse@globaldomaingroup.com` (+1 805-394-3992), `complaint@gname.com`.

### 5.7 Operator-B real origin IPs (directly actionable) [H]
| ASN | Provider | Origin IPs | Example hosts |
|---|---|---|---|
| **AS210558** | **1337 Services GmbH / rdp.sh (Hamburg DE)** | 91.206.169.122 · 2.58.56.70/.111/.153/.189 · 45.138.16.165/.203 · 45.141.215.196 · 185.241.208.197/.228 · 194.26.192.78/.95/.98/.126/.205 | login-subito.it, controlli-subito.it, verificatisubito.it, supportosubito.it, consegna-subito.info, conferma-subito.me |
| **AS34224** | hosting | 31.13.195.94 · 87.120.254.37/.171 · 212.73.134.129 | supportodati.com, conferma-subito.com, datispedizione.com, datiordine.com |
| AS142036 | — | 89.117.1.140 | subito-dati.com |
| AS9009 | — | 38.180.194.236 · 194.102.39.119 | subito.confermadati.info, support11.xyz |
| AS22612 | — | 199.192.31.14 · 66.29.141.228 | it-subito.it, loginsubito.online |
| AS210779 | — | 176.105.253.99 | supporto.subito.it-cliente.site |
| AS47583 / AS50613 | — | 185.166.188.245 / 82.221.129.16, 82.221.105.39 | confermaindirizzo.*, areapagasicuro-tuttosbito.it |

---

## 6. Visual evidence — screenshots (`screenshots/`) [H]
> **Publicly verifiable re-scans (submitted public on urlscan.io):** `subito.cam` →
> https://urlscan.io/result/019ed04a-9141-777f-bbfc-8a647c160bae/ ·
> `olx.express-paycore24.cfd` → https://urlscan.io/result/019ed04a-9fbf-748a-8226-9cbb121ea75c/ .
> The original captures below (UUIDs `019e9db1`/`019ec607`/… ) were private to the submitting urlscan
> account; visibility cannot be changed post-submission and the other hosts are now NXDOMAIN, so the
> verbatim results + PNGs are preserved here in `evidence/` and `screenshots/`.

| File (scan UUID) | Captured | What it shows |
|---|---|---|
| `019e9db1-….png` | **2026-06-06** | Fake Subito "Seggiolino per bicicletta" €15, fake buyer "Francesca Danesi / Teramo", Stripe box, "Ricevi fondi", **live operator chat** instructing card entry. |
| `019c8c90-….png` | 2026-02-23 | Fake Subito "t-shirt cappelli" €18, buyer "Alessia Marinelli / Trieste" — **captured operator↔victim conversation** ("…il servizio di consegna la contatterà…" / victim: "ma non funziona con la email?"). |
| `019c42ae-….png` | 2026-02-09 | Fake Subito "Kolo sportiwne" — **Polish product title leaking onto an Italian page** (proves shared multi-brand engine/data). |
| `019e909c-….png` | 2026-06-04 | `subito.cam` now serving **Cloudflare "Suspected Phishing"** block. |
| `019ec607-….png` | **2026-06-14** | OLX.PL twin — fake listing "Sukienka damska… 55 zł", buyer "Arkadiusz Twardy / Czeladź", "Potwierdź sprzedaż". Source of the recovered kit JS. |
| `019ecbd3-….png` | **2026-06-15 15:08Z** | **Live monitor-catch capture** — `olx.express-paycore24.cyou`, OLX "Jordan t-shirt roz. M" 49 zł, **same reused fake buyer "Arkadiusz Twardy / Czeladź"** (identity reused across victims). |

---

## 7. Scale / victimology [H]
- urlscan ≠ victims (captured fraction only; all numbers are **floors**).
- **Operator-A confirmed June-2026 campaign** (`/a/Mi…?us=…`): 127 scans, **47 distinct victim tokens**, 19 domains, **all OLX (Poland)**, 2026-06-01→14.
- **Broader kit family:** ~2,900 scans / ~500 distinct tokens / ~440 domains, dominated by **Kleinanzeigen (DE) + OLX (PL)**.
- **Subito (Operator A):** ~4 pages ever. Italy is a minor target.
- **Operator B (Subito PHP):** 69 distinct hosts 2021→2026.

---

## 8. The PhaaS ECOSYSTEM — where these are sold & operated [EXT]
This operation belongs to the **marketplace courier-payment PhaaS** category, dominated by two documented franchises:

**Classiscam** (Group-IB) — automated **scam-as-a-service via Telegram bots**: a worker sends the bot a bait-listing link and it generates the full phishing kit. **1,366 Classiscam Telegram groups since 2019**; **US$64.5M stolen H1-2020→H1-2023**; **251 brands across 79 countries**; **5,000+ scammers**; emulates **63 banks in 14 countries** for 3-DS interception. Geography of *victims*: Germany 26.5%, Poland 21.9%, Spain 19.8%, **Italy 13%**. [Group-IB, 31 Aug 2023; "Classiscam in Europe"]

**Telekopye** (ESET) — a **Telegram bot** that builds phishing pages from templates for many scammers at once. Jargon: victims = **"Mammoths,"** scammers = **"Neanderthals."** Five-tier hierarchy; workers keep **65–75%**, admins cash out via **BTC exchange bots**; **≥ €5M since 2021**; "dozens of groups, thousands of members." Code/samples Russian-language, uploaded from **Russia/Ukraine/Uzbekistan**. [ESET WeLiveSecurity, Aug 2023 & Oct 2024]

**How sold / priced** (Telegram PhaaS market, Kaspersky/Securelist, 5 Apr 2023): basic phishing pages **~$10**, page archives **~$50**, **3-D-Secure-capable pages up to $300**; OTP-interception bots **$130/week–$500/month**. Sold/run entirely through **Telegram bots + channels**, "modular, subscription-based, supported through Telegram communities."

**Who & from where:** predominantly **Russian-speaking / Eastern-European** crews; Classiscam emerged in **Russia (2019)**, with large groups operating from **Bulgaria, Czechia, France, Poland, Romania** and the post-Soviet space — **operating from** the East, **targeting** Western/Central Europe.

**Takedown / enforcement actions:** **Telekopye** — Czech & Ukrainian authorities' operations **"RIP" and "VICTORY," late 2023**, arrested "tens of cybercriminals" (groups had ≥€5M since 2021). **No public takedown of Classiscam** [EXT]. *(Do not conflate with the separate Eurojust/Europol Czech-Ukrainian **vishing** bust, 16 Nov 2023, 10 arrested, ≥€8M — different crime.)*

**Where this leaves Operator A:** its TTPs are squarely **Classiscam/Telekopye-class** (multi-brand marketplace, courier-payment, live operator "helpdesk," card→3-DS interception, Telegram-style franchise) **[M]**, but its **specific kit is publicly undocumented [NF]** and its exfil uses **WebSockets + a self-hosted helpdesk panel** rather than the Telegram-bot exfil typical of Classiscam/Telekopye — a **more advanced, custom build** [H]. Treat the ecosystem mapping as *context*, not as a named-actor attribution.

---

## 9. Attribution
- **Targeting [H]:** confirmed live = IT (Subito), PL (OLX), DE (Kleinanzeigen), NL (Marktplaats), Baltics (OMNIVA). The kit bundle additionally **hard-codes legitimate-brand login/redirect URLs for a much wider portfolio (≥12 countries)** — strong evidence of the full target set: Allegro (PL), Bazar.bg (BG), Blocket + Bytbil (SE), iMarked/Finn (NO), Anibis + Tutti (CH), Laendleanzeiger (AT), TradeMe (NZ); postal/courier **Correos (ES), Posta Moldovei `posta.md` (MD), Balíkovna (CZ), SelfAWB/Posta Română (RO)**; payment **Vipps MobilePay (NO/DK)**. Full `/ro/…` Romanian localisation present → **Romania a primary target**. Plus in-kit Leboncoin/Western Union/DPD/Poshmark/Spanish templates. The payment module hard-codes **per-country Stripe routing for 34 countries** (`stripe/<cc>`: AT, AU, BE, BG, BR, CA, CH, CZ, DE, DK, EE, ES, FI, FR, GB, HK, HR, HU, IS, IT, LT, LV, MD, NL, NO, NZ, PL, PT, RO, SE, SG, SK, US) — i.e. a global card-theft footprint. Full kit teardown: **`docs/kit-code-analysis.md`**. Source reconstruction (`reconstructed_project/`) revealed a **~120-brand skin library** — marketplaces (incl. Vinted, Wallapop, Depop, Carousell, OfferUp, TradeMe, Anibis/Tutti/Ricardo CH, FINN, Blocket, DBA, Aukro, 999.md, Booking, IKEA), couriers (DHL, DPD, UPS, InPost, Omniva, Correos, CTT, PostNL, bpost, FAN Courier, Packeta), and payment/bank (Stripe, **TWINT, Vipps, Western Union, Tikkie**, generic banks/cards) — and a default builder-brand fingerprint **"Continental Group" / `/static/cg.png`** (hunt signature).
- **Authorship — Russian-speaking [H, code-level]:** the kit embeds **253 Cyrillic strings** — a Russian WYSIWYG page-builder admin panel (`Панель настроек шаблона`="Template settings panel", `Загрузить лого`="Upload logo"…) + Russian operator fraud scripts (`Кредитные карты не принимаются. Используйте дебетовую карту.`="use a debit card"; `Карта отклонена`="card declined"; `логин/пароль банка`="bank login/password"). Plus `LK`=`личный кабинет`. **Direct code evidence of Russian-speaking developers/operators** — firmly the **Classiscam/Telekopye** ecosystem (upgrades the earlier inference). Victim lures are localized per country (Bulgarian seen for Bazar.bg). The scam is **versioned**: `Покупка 1.0`/`Выплата 2.0` — the per-victim token prefix `2/` = the **"Выплата (payout) 2.0"** scenario.
- **Named individual [NF]:** none recovered; authorship is now Russian-speaking [H], not just ecosystem inference.
- **Closest named analog [EXT]:** Perception Point's Jul-2024 live-chat + Stripe-spoof kit (same technique family).

---

## 10. Hosting & registrar intelligence [EXT]
- **1337 Services GmbH — AS210558** (Operator-B host): bulletproof/abuse-tolerant provider branded **"rdp.sh" / "1337.cc,"** **Ludwig-Erhard-Str. 18, 20459 Hamburg, Germany**, abuse `abuse@as210558.net`, allocated **2021-10-28**, ~5,632 IPv4. Announces **2.58.56.0/24, 45.138.16.0/24, 194.26.192.0/24, 91.206.169.0/24** (185.241.208.0/24 widely cited but unverified this pass). **Tracked malicious ASN** by abuse.ch URLhaus & ThreatFox; CleanTalk spam blacklists; phish.report takedown contact "services-1337-gmbh." *(Not FlokiNET; not the same as "Dolphin 1337 Limited" AS215208.)* [ipinfo.io AS210558, 22 Jan 2026; abuse.ch]
- **Gname.com Pte. Ltd. — IANA 1923** (Operator-A redirectors): **NetBeacon (Mar 2025)** — registered **9% of all unique phishing domains (3,087)** on ~2% market share (~4.5× over-indexed), the **2nd-worst registrar** that month. Abuse: `complaint@gname.com` / gname.com/abuse. [NetBeacon, 2025]
- **Global Domain Group LLC — IANA 3956** (verifieer.cc): `abuse@globaldomaingroup.com`, +1 805-394-3992.

---

## 11. Evidence inventory (chain-of-custody) [H]
- **Screenshots:** `screenshots/` (5 PNGs — §6).
- **Recovered kit source:** `kit-source/raw_bodies/` (72 raw) + `kit-source/decompressed/` (decompressed) + `SHA256SUMS.txt`.
- **Full scan records:** `evidence/urlscan_result_019e9db1_subito.json`, `…_019ec607_olx.json`.
- **Subito phishing history (both operators, 69 hosts):** `evidence/subito_phishing_history.txt`.
- **Original incident OSINT:** `docs/osint-findings.md`, `evidence/scammer_analysis.json`, `evidence/` (RDAP/TLS/DNS/headers).
- **Fresh scans 2026-06-15:** `evidence/fresh_scans.txt`.
- **Companion docs:** `docs/reporting-and-takedown.md`.
- **Live infrastructure tracker:** `monitor/check.sh` → `monitor/monitor.log` + `monitor/findings.csv` (keyless, runs on a GitHub Actions cron). Historical first-pass log: `evidence/monitor.log`.

---

## 12. Recommended actions (defenders / CERTs / abuse desks)
1. **National cybercrime / consumer-protection report** — file via the targeted country's national channel (in Italy, commissariatodips.it); attach §1–6 + chat screenshots.
2. **Cloudflare abuse / legal-disclosure request** — origin IP + account registration/payment behind NS pairs `amy/quincy`, `ashton/rose`, `diana/jake`, `celeste/rob`, `hank/lovisa`, and the backend serving `wss://…/api/ws/stripe/sync` + `/ws/helpdesk` on `paycore24-express.sbs`/`verifieer.cc`.
3. **Operator-B host (faster win)** — preservation/disclosure to **1337 Services GmbH (`abuse@as210558.net`, AS210558)** + **AS34224** for the real IPs in §5.7.
4. **Registrars** — `abuse@globaldomaingroup.com`; **`complaint@gname.com`** (redirector cluster, + ICANN RDDS form icann.org/wicf); NameSilo.
5. **CERT-AGID** + **D3Lab** — share the `/a/?us=` + `2/`-token + `/ws/helpdesk` signatures (note: kit is publicly undocumented — this is new IOC intel for them).
6. **Messaging / carrier provider** — preservation/disclosure for the operator-contact number `+39 350 860 6411`.
7. **Cross-border** — loop in **CERT Polska / Orange CERT (PL)**, **BSI/Verbraucherzentrale (DE)**, **NCSC-CH** given the OLX/Kleinanzeigen/Marktplaats volume; reference **Group-IB (Classiscam)** and **ESET (Telekopye)** for franchise context.
8. **Kill the shared kit backend** — `paycore24-express.sbs`, `paycore-deal.*`, `sendcore.*`, `corepay.*`, `verifieer.cc`. **Bank/payment** — block/recall if card data entered; report URLs to Google Safe Browsing + PhishTank.

---

## 13. Corrections / false leads (keep OUT of any report) [H]
- **Exfil is the WebSocket helpdesk, not Telegram** (earlier Telegram hypothesis corrected). **"Mammoth" = victims**, not an operation name. **Telekopye arrests = late 2023.** The **Group-IB Nov-2025 "Italy kit" impersonates Aruba (hosting), not a marketplace** — do not conflate. The 2026 Darcula/"Magic Cat" courier kit runs on **Tencent AS132203**, different infra.
- No registrant identity / carrier / operator name recovered — all **[NF]**, none invented.
- **`humancompostco.com` / `193.148.56.18` (ALINDA LLC, AS209946) — NOT confirmed kit infrastructure.** This was added to `monitor/watchlist.txt` on 2026-06-18 on weak circumstantial grounds (an "operator-flagged" nameserver + "not an aged domain," never an actual kit-fingerprint match), and no section of this dossier ever tied it to either operator. Re-verified live 2026-09-25: `humancompostco.com` serves a hacked-WordPress spam-injection page (no `/a/<token>` kit path, no marketplace/courier branding) and its co-tenant `amoreliie.com` is an unrelated typosquat of a German lingerie retailer — neither shows any marketplace-PhaaS signature. Demoted to a tier-2, non-alerting candidate in the watchlist pending a real kit-fingerprint hit on this IP. Do **not** cite this as an Operator-A or Operator-B lead.

---

## 14. Methodology (reproducible) [H]
RDAP/WHOIS → CT logs (crt.sh, certspotter) → passive DNS (OTX, hackertarget) → internet-wide scanners + cert pivot (Shodan, Netlas) → HTTP-header framework fingerprinting → **urlscan API** (stored bodies `/responses/<sha256>/` + screenshots) → brotli/gzip decompress → static analysis of the kit's client JavaScript → multi-source ecosystem research. **DNS always via public resolvers (1.1.1.1/8.8.8.8).** Tooling: `recon-origin.sh`, `enum.sh`, `shodan-pivot.sh`, `netlas-pivot.sh`, `capture-live.sh`, `watch-phish.sh`, `urlscan_extract.js`, `decomp.js`.

---

## 15. Discovery log (data freshness)
| Date (UTC) | Discovery |
|---|---|
| 2021–2025 | Historical urlscan captures of Subito phishing (both operators) — Operator-B PHP cluster active since 2021. |
| 2026-02-03 | `verifieer.cc` registered (Operator A). |
| 2026-02-09 / 02-23 | First Operator-A Subito kit captures (`subito.pagamento.cc`, `subito-ricevere-il-pagamento.click`). |
| 2026-06-06 | Reference incident captured (`subito.verifieer.cc`, urlscan 019e9db1). |
| 2026-06-11 | Operator-A wildcard cert reissued (still active 3 days before going dark). |
| 2026-06-12 | Initial incident report compiled (`scammer_report.md`). |
| **2026-06-14** | Origin recon (confirmed Cloudflare-only, origin not exposed), multi-brand cluster mapped, framework fingerprinted, monitor designed. |
| 2026-06-15 10:37Z | **Live tripwire hit:** monitor caught a new domain `olx.express-paycore24.cyou` (NS ashton/rose — same OLX Cloudflare account) → confirms the account is active *today*. |
| **2026-06-15** | urlscan key obtained → **kit source recovered & decompressed**; WS exfil (`/ws/helpdesk`, `/api/ws/stripe/sync`) confirmed; redirectors + Gname + `x-rate-limit:3` profiled; screenshots pulled; **scale counted** (47–500 tokens); **ecosystem research** (Classiscam/Telekopye, 1337 Services, Gname); live state re-verified (subito.cam + redirectors = Cloudflare 403); monitor armed. |
| 2026-09-10 → 09-24 | **Tracker incident:** automatic non-Cloudflare-origin promotion (added post-launch) turned into a self-reinforcing noise loop — dead Operator-A apexes re-resolved to shared cloud IPs (normal rotation churn), which got auto-promoted as "dedicated origins," each pulling in ~100 unrelated tenant domains per run. `findings.csv` grew from single digits/day to 288 rows in one run. Traced live: **0 of the 40 auto-promoted origins were real operator infrastructure.** |
| **2026-09-25** | **Tracker rewrite.** Automatic origin promotion removed entirely (manual review only via `discovered.csv`); the two dead `page.url` kit fingerprints (`/api/ws/stripe/sync`, `/static/cg.png` — `page.url` can never match a WebSocket path or asset reference) replaced with **content-hash search** (`monitor/fingerprints.txt`), which live-recovered **99 previously-untracked Operator-A apexes** from the June–July 2026 campaign (now in `docs/indicators.csv`) versus 2 recovered by the old fingerprints; `monitor/denylist.txt` + host decay (`state/tracked_hosts.tsv`) added; two-tier (Operator A per-run alert / Operator B weekly digest) scope introduced; ~532 noise rows from the incident window deleted from `findings.csv`. Also corrected the `humancompostco.com`/`193.148.56.18` misattribution (§13) and verified 13 of 15 dossier §5.7 AS210558 IPs as still-live, dominantly Subito-branded Operator-B origins (2 excluded as shared/mixed hosting) — now in `monitor/watchlist.txt`. |

---

## 16. Glossary
**PhaaS** rented phishing kit · **Origin** real server behind a CDN · **Cloudflare/CDN** reverse proxy hiding the origin · **ASN** owner-ID of an IP block · **Bulletproof host** abuse-tolerant provider · **CT logs** public TLS-cert record · **Cloaking** decoy served to non-victims · **BIN** card prefix → issuing bank · **WebSocket (wss)** persistent real-time channel · **3-D-Secure/OTP** bank one-time code · **IOC** indicator of compromise · **Classiscam/Telekopye** named Telegram-bot marketplace-PhaaS franchises · **Mammoth/Neanderthal** (Telekopye slang) victim/scammer.

## 17. References
**Our evidence:** urlscan scans 019e9db1, 019ec607, 019c8c90, 019c42ae, 019e909c (retrieved 2026-06-15). **External:** Group-IB "Classiscam $64.5M" (31 Aug 2023) & "Classiscam in Europe"; Group-IB "Multi-Stage Phishing Kit Targeting Italy" (13 Nov 2025); ESET WeLiveSecurity "Telekopye" (Aug 2023) & "…hotel booking scams" (Oct 2024) + VB2024 paper; Kaspersky/Securelist "Telegram phishing services" (5 Apr 2023); Perception Point via Cybernews "live chat support phishing" (Jul 2024); NetBeacon "phishing concentrated in two registrars" (2025); ipinfo.io AS210558 (22 Jan 2026); abuse.ch URLhaus/ThreatFox AS210558; CERT Polska / Orange CERT (OLX/InPost/DPD phishing); NCSC-CH weekly review wk14 2025; InPost OLX-fraud advisory; Eurojust vishing-gang takedown (16 Nov 2023); CERT-AGID phishing tracker; D3Lab.
