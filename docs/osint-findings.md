# OSINT Findings — Subito.it Impersonation Phishing

**Target:** WhatsApp Business number `+39 350 860 6411` and phishing domain `subito.verifieer.cc`
**Capture time (UTC):** 2026-06-12T20:22:31Z
**Tooling:** Windows CLI (`curl`, `nslookup`, `openssl`) + keyless public APIs (RDAP, urlscan.io) + web search
**Raw evidence:** all verbatim responses in `./evidence/`; machine-readable findings in `./evidence/scammer_analysis.json`

> **Evidence integrity:** Every value marked HIGH was copied directly from live tool output captured this session. Nothing is inferred where it says HIGH. Where a service required a paid/key-gated API not available in this environment (NumVerify, VirusTotal, AbuseIPDB, SecurityTrails, Truecaller, HIBP), the field is left **explicitly blank (NOT_QUERIED)** with the exact command to complete it — **no value was invented.** This matters: research intended for abuse desks, CERTs, and other defenders must contain only verifiable facts.

---

## Executive summary

`verifieer.cc` is a **confirmed live phishing operation impersonating Subito.it.** On 2026-06-06 urlscan.io captured `https://subito.verifieer.cc/a/...` serving an Italian fake listing titled **"Seggiolino per bicicletta | SUBITO.IT"** (HTTP 200). The apex domain was **registered 2026-02-03** through registrar **Global Domain Group LLC**, parked, then **weaponised in early June 2026** (TLS cert issued 2026-06-01) — an aged-domain tactic. All web infrastructure hides behind **Cloudflare (AS13335)**, so the true origin server is not visible via DNS and must be obtained via abuse / legal-disclosure channels.

The phone number's WhatsApp registration and the phishing subdomain's stand-up both fall in **early May–June 2026**, a coherent single-campaign timeline. The number does **not yet appear** in public Italian scam databases — expected for a ~1-month-old throwaway WhatsApp Business line, and **not** evidence of innocence.

---

## 1. Phone number — `+39 350 860 6411`

| Field | Finding | Confidence |
|---|---|---|
| Country | Italy (`+39`) | HIGH |
| Range type | Italian mobile range (3xx; `350` is an allocated mobile prefix) | MEDIUM |
| **Carrier / line type** | **NOT QUERIED** — NumVerify/HLR require an API key not available here | — |
| Breach-DB presence | **NOT QUERIED** — HIBP phone API is paid/key-gated | — |
| Truecaller | **NOT QUERIED** — no legal free API; scraping violates ToS | — |
| Public scam-DB web search | No report ties this exact number to a scam as of capture | MEDIUM |

**Notes.** Carrier **cannot** be inferred from the `350` prefix because of Italian mobile number portability — only a live HLR lookup is authoritative. To complete the carrier field with a free NumVerify key:
```powershell
Invoke-RestMethod "http://apilayer.net/api/validate?access_key=YOUR_KEY&number=393508606411&country_code=IT"
```
**Manual reputation checks worth doing:** [stopscam.it](https://stopscam.it/segnalazione/lista-segnalazioni/), [whuis.com](https://www.whuis.com), [numfinder.com](https://numfinder.com/it/features/who-called-me), and Telegram community scam channels (require a Telegram account — not CLI-queryable).

## 2. WhatsApp Business account

- **Registration check: NOT QUERIED.** There is no lawful API to confirm WhatsApp registration of an arbitrary number; unofficial "is-on-whatsapp" endpoints abuse the protocol and were not used. *Lawful alternative:* open a normal WhatsApp chat to the number from a handset and screenshot the **Business** badge as victim evidence.
- **Social-engineering indicator (MEDIUM):** use of WhatsApp **Business** rather than a personal account is a recognised trust-boost tactic — the business label lends false legitimacy. Combined with a ~1-month-old number, it fits the throwaway-infrastructure pattern.
- **Temporal correlation (MEDIUM):** WhatsApp "registered last month" (~May 2026) aligns with the `subito.verifieer.cc` subdomain age (~30 days at the 2026-06-06 urlscan capture → ~early May) and the TLS cert issued 2026-06-01. Consistent single campaign.

## 3. Cross-reference (scam databases & web)

- Exact number / domain searches returned **no direct hit** tying `+393508606411` to a named scam report yet (MEDIUM confidence; aggregators lag fresh numbers).
- Context corroborating the *Subito phishing pattern*: Subito's own [Phishing advisory](https://assistenza.subito.it/hc/it/articles/360001165525-Phishing), a [FibraClick forum thread on Subito.it phishing](https://forum.fibra.click/d/66219-tentativo-phishing-su-subitoit), and a sibling typo-domain `verifa.cc` already [flagged as high-risk by Scam Detector](https://www.scam-detector.com/validator/verifa-cc-review/) — suggesting a **family of `verif**.cc` Subito-phishing domains**.

## 4. Domain correlation — `verifieer.cc` (RDAP, HIGH confidence)

| Field | Value |
|---|---|
| Registry handle | `207826166_DOMAIN_CC-VRSN` |
| **Registered** | **2026-02-03T14:22:25Z** |
| Expires | 2027-02-03T14:22:25Z |
| Status | clientTransferProhibited |
| **Registrar** | **Global Domain Group LLC** (IANA 3956) |
| Registrar abuse | `abuse@globaldomaingroup.com` · +1 805-394-3992 |
| Nameservers | `amy.ns.cloudflare.com`, `quincy.ns.cloudflare.com` |
| DNSSEC | unsigned |
| Registrant | not disclosed (privacy + Cloudflare) |

**urlscan.io evidence:**
- **Live phishing** — 2026-06-06T16:08:13Z, `https://subito.verifieer.cc/a/Mi8zRFdpNjBQbmFS?us=gm`, title **"Seggiolino per bicicletta | SUBITO.IT"**, lang `it`, **HTTP 200**. Result: `https://urlscan.io/api/v1/result/019e9db1-0700-7785-942e-c66131c97c9e/` · screenshot: `https://urlscan.io/screenshots/019e9db1-0700-7785-942e-c66131c97c9e.png`
- **Earliest** — 2026-02-03 (registration day), apex tagged `possiblethreat` by a community submitter.

**TLS:** DV cert, subject `verifieer.cc`, issuer **Google Trust Services (WE1)**, valid **2026-06-01 → 2026-08-30** — matches the early-June weaponisation window.

- **VirusTotal / SecurityTrails: NOT QUERIED** (API keys required). To complete:
  ```powershell
  Invoke-RestMethod -Headers @{'x-apikey'='YOUR_KEY'} 'https://www.virustotal.com/api/v3/domains/verifieer.cc'
  ```

## 5. IP & hosting (HIGH confidence)

- **`verifieer.cc` and `subito.verifieer.cc` resolve to the same set:** IPv4 `172.67.191.224`, `104.21.20.73`; IPv6 `2606:4700:3032::ac43:bfe0`, `2606:4700:3031::6815:1449`.
- **IP WHOIS (RDAP/ARIN):** `CLOUDFLARENET`, **AS13335**, Cloudflare Inc., San Francisco. These are **Cloudflare anycast edge IPs — not the origin server.**
- **HTTP fingerprint:** `Server: cloudflare`, app framework **Next.js**, root path returns **404** (phishing served only on deep `/a/<token>` links — targeted, not broadly crawlable).
- **True origin: HIDDEN** behind Cloudflare; obtainable only via the Cloudflare abuse process or a legal-disclosure request.
- **AbuseIPDB: NOT QUERIED** (key required) — and of low value here anyway, since shared Cloudflare edge IPs score for Cloudflare in aggregate, not this actor.
- **Abuse reporting contacts:**
  - Cloudflare (proxy/CDN): **https://www.cloudflare.com/abuse** · `abuse@cloudflare.com`
  - Registrar (domain takedown): **`abuse@globaldomaingroup.com`** · +1 805-394-3992

---

## Recommended next steps — reporting & escalation

1. **Preserve evidence** (this folder is a good start): keep `./evidence/`, plus any captures of the operator chat (Business badge, number, message, link) and the original listing/message.
2. **Report to the relevant national channel** — the national cybercrime unit or consumer-protection / anti-fraud portal for the targeted country (in Italy, the national cybercrime portal at commissariatodips.it; elsewhere, the national CERT or equivalent cybercrime reporting site). Include: the phishing URL `https://subito.verifieer.cc/...`, the operator-contact number `+39 350 860 6411`, the RDAP/urlscan evidence, and timestamps.
3. **Report the infrastructure in parallel** (speeds takedown, creates a paper trail):
   - **Cloudflare:** https://www.cloudflare.com/abuse (category: phishing) — cite `subito.verifieer.cc`.
   - **Registrar Global Domain Group:** `abuse@globaldomaingroup.com`.
   - **Subito.it security:** via their [Phishing page](https://assistenza.subito.it/hc/it/articles/360001165525-Phishing) (brand-abuse takedown).
   - **Google Safe Browsing:** https://safebrowsing.google.com/safebrowsing/report_phish/
4. **Bank/payment block:** if any payment or card data was entered, contact your bank immediately and request a block/recall; report card compromise.
5. **Optional enrichment** (needs free API keys you register): NumVerify (carrier), VirusTotal & urlscan-API key (reputation), SecurityTrails (passive-DNS to find sibling `verif*.cc` domains and possibly the origin IP).

---

## What could NOT be obtained (and why)

| Item | Reason |
|---|---|
| Carrier / line type | NumVerify/HLR need an API key |
| Breach-DB presence | HIBP phone API is paid |
| Truecaller name | no legal free API |
| WhatsApp registration confirmation | no lawful API |
| VirusTotal / SecurityTrails | API keys required |
| AbuseIPDB score | API key required (+ low value on shared CF IPs) |
| True origin server IP / hosting provider | masked by Cloudflare; needs abuse / legal-disclosure channel |

*These are gaps, not findings. They were left blank deliberately rather than filled with guesses, because fabricated data would undermine a credible report.*
