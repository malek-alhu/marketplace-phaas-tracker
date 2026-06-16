# Module: Brand templates / victim-facing fake-listing page

**Technical reverse-engineering for security research. Nothing here is
executable as-is and must not be deployed. Asset paths and foreign-language
strings are preserved verbatim with translations.**

This module documents the **victim-facing fake "you sold an item — collect your
money" page** of a marketplace/courier phishing kit (minified Next.js 16.2.7,
Turbopack chunks). It covers three reconstructed files:

| File | What it is |
|------|------------|
| `helpdeskPage.js` | The `/helpdesk/<adId>/<brand>` personalised fake-listing page. Two concrete renderers recovered: **FAN Courier** (RO) and **Subito.it** (IT). |
| `brandSkins.js`   | How a brand "skin" is selected from the server-injected `service` descriptor, the full brand→asset-prefix table, and the `SubitoModeConfig` sub-skin map. |
| `productCard.js`  | Price/currency rendering (`ac-text` markers, jsDelivr currency-api conversion) and the Nominatim reverse-geocode used to silently de-anonymise the victim. |

Source chunks (under `kit-source/decompressed/`):
`39539e7245…` (FAN Courier page), `3d6f43bdae97…` (Subito page).
Cross-chunk evidence: `cd57840077ea…` (`SubitoModeConfig`), `cc48fd4353…` /
`f839ecd9…` (`service` descriptor), `5addca557de7…` (`convertPrice` +
the bulk of `/static/<brand>/` asset prefixes), `60f0e6140d4a…` (`reverseGeocode`),
`13b9247a9766…` (generic price formatter).

---

## How the scam works (the funnel)

The victim is a **real seller** on a real marketplace. They get contacted by a
fake "buyer" and pushed to a link that opens this page on an attacker-controlled
host, skinned to look like the marketplace + a courier "secure payment / payout"
flow. The page shows:

- the seller's **own** product photo, title and price (scraped → looks genuine),
- a **fabricated buyer** name + delivery address + order id,
- a 4-step "progress" strip ending in *"receive the money"*,
- a **Stripe / "secure payment" trust box** (Mastercard/Visa/PayPal logos,
  buyer-protection shield, lock icon) and courier logos,
- a big CTA — *"Primește banii"* / *"receive funds"* — whose `href` is
  `makeLink("stripe")`, the link to the **card / payout-details harvest** step.

There is no buyer and no payout. The CTA harvests the seller's card / banking
details. The page also tries to reverse-geocode the victim's GPS to prefill a
real street address into the fake form.

---

## Templating architecture

1. **Server injects a per-victim `service` descriptor** (JSON) into the page:
   `name`, `code`, `country_code`, a `variables` bag
   (`logo`, `subdomain`, `mode`, `show_delivery`, `delivery_price`, …),
   `methods` (`"2_0"`, `"rental"`, `"verify"`), plus a `country` block with
   `currency`, locales and `names` (incl. Cyrillic, e.g. `"ru":"Польша"` = "Poland").
   Verbatim OLX/PL example is in `brandSkins.js` §1.

2. **One Next.js page/webpack chunk per impersonated brand**, each
   **hard-coding its own asset prefix** `/static/<brand>/…` (and sometimes an
   `/app/<brand>/…` route prefix). The matching chunk is rendered by
   `service.code` / `service.name`. There is **no single central brand switch** —
   selection is code-splitting + the injected descriptor. `subdomain` (e.g.
   `"olx."`) is the attacker-panel key that maps an incoming victim link to a brand.

3. **Within a brand, an optional sub-skin** is chosen from a config map. The
   recovered example is Subito's `SubitoModeConfig`, indexed by
   `ad.variables.mode` with a `.default` fallback:
   `motori` (blue), `market` (yellow), `immobili` (purple), `lavoro` (green),
   `default` (corporate). Each entry = `{theme, logo, logoClass, helpdeskTheme}`.

4. **Shared data model `orderData`** drives both renderers (built from `ad`):
   `paymentLink = makeLink("stripe")`, `orderNumber` (fabricated `ORD-####-###`),
   `buyerName = ad.fields.buyer_name`, `productName = ad.name`,
   `productImage = ad.images[0].url`, `formattedPrice = "<price> <symbol>"`,
   `deliveryAddress = ad.fields.delivery_address`, `countryName`, `currency`.

5. **Autofill markers (`ac-text`)** — `product-price-formatted`,
   `product-currency`, `delivery-full-name`, `delivery-address` — are how the
   kit's own engine reads/writes these spans (not just display).
   (Note a preserved bug: the Subito delivery-price span reuses
   `ac-text="delivery-full-name"`.)

6. **External calls** (`productCard.js`):
   - **jsDelivr currency-api**:
     `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/<to>.json`
     → converts listing price to EUR/USD.
   - **Nominatim / OpenStreetMap reverse geocode**:
     `https://nominatim.openstreetmap.org/reverse?format=json&lat=<lat>&lon=<lon>&addressdetails=1`
     → GPS → street address, fired silently after geolocation permission is
     `"granted"` (gated by `hide_ask_address_in_ebay`).

### Live-chat widget mount

No third-party chat SDK (Tawk/Crisp/Intercom) literal was found in the assigned
chunks. The "live chat / support" presence is **brand-native chrome**:
- **FAN Courier**: a fixed bottom-right *"Discută cu ȘteFAN"* ("Chat with
  ȘteFAN") support bubble in the footer column (`/static/fancourier/media/icon-19.svg`,
  `right-[125px] bottom-[70px]`).
- **Subito**: the support/help flow funnels into the Stripe "secure payment"
  CTA rather than a chat SDK.
This is marked `// RECONSTRUCTED-APPROX` in `helpdeskPage.js` — a dedicated chat
SDK may be mounted by a different subsystem chunk not in this slice.

---

## Full brand-template list found

Couriers and payment brands appear as the trust/delivery "skin"; marketplaces are
the impersonated listing site. (Verbatim `/static/<brand>` and `/app/<brand>`
prefixes — see `brandSkins.js` §2.)

### Marketplaces / classifieds
OLX (PL, `/static/olx`), **Subito.it** (IT, `/static/subito`, sub-skins
motori/market/immobili/lavoro), **Anibis.ch** (`/app/anibis-ch-second-hand-verkaufen`),
Tutti.ch (`/app/tutti-ch-second-hand-verkaufen`), Ricardo.ch (`/app/ricardo-ch`),
**Gumtree** (`/app/gumtree`), Marktplaats (NL), 2dehands (BE-NL, `--nlbe`),
2ememain (BE-FR, `--frbe`), Markt.de, Blocket (SE), FINN.no, DBA.dk, GulogGratis
(DK), Tori.fi, Huuto.net, Wallapop (ES), Vinted, Depop, Carousell, OfferUp (US),
Trade Me (NZ), Airtasker (AU), Plick (SE), Tise, Yaga, Aukro, Bazar, Alio (BG),
Skelbiu (LT), iMarked, 999.md (MD), Tablón de Anuncios (ES), Tiptapp
(`/app/tiptapp`), Apple Store (`/app/apple-store`), Bokbörsen (SE), Booking, IKEA.

### Couriers / shipping
**FAN Courier** (RO, `/static/fancourier`, `/app/fan-courier-mobile`),
**bpost** (BE, `/static/bpost`, `bpost-locale`),
**Correos** (ES, `/static/correos`, `/app/correos-info`, `/app/C102638007`),
CTT (PT), Posta, Posti (FI), Posten, PostNL, Australia Post, NZ Post, DHL, DPD,
**UPS** (`/static/ups`, `ups-locale`), InPost (PL), Packeta, Zásilkovna (CZ),
Omniva (Baltics), Matkahuolto (FI), DAO (DK), Helthjem (NO), DB Schenker,
Pack & Send (AU).

### Payment / bank / wallet (trust assets in the harvest step)
Stripe, TWINT (CH), Vipps (NO), Western Union, Tikkie (NL, `/app/tikkie`),
generic `banks`, generic `cards`.

---

## Notable verbatim strings (with translations)

- **Romanian (FAN Courier)**: `"Colectează plata"` = "Collect the payment";
  `"Fondurile vor fi transferate pe cardul tău imediat."` = "The funds will be
  transferred to your card immediately."; `"Primește banii"` = "Receive the money";
  `"Detalii expediție"` = "Shipment details"; `"Numele cumpărătorului:"` = "Buyer's
  name:"; `"Adresa de livrare:"` = "Delivery address:"; `"Plata fondurilor"` =
  "Payment of the funds"; `"Discută cu ȘteFAN"` = "Chat with ȘteFAN".
- **Italian (Subito)**: button/labels are i18n keys (`receive_funds_button`,
  `payment_on_subito`, `buyer_protection`, `secure_payment`,
  `shipping_managed_by_subito`, `safety_notice_*`, `buy_safely`); footer
  `"© Subito.<cc> - P.IVA 05526340962"`. Banner uses theme `theme-redCorporate`.
- **German (generic formatter)**: `"Kostenlos"` = "Free" (delivery-price fallback).
- **Russian (country names)**: `"ru":"Польша"` = "Poland".

## Uncertainty notes (`// RECONSTRUCTED-APPROX`)
- `useButtonSubmit` / `makeLink` body is consumed-shape only; the real signed-URL
  builder lives in another subsystem chunk.
- The brand→template binding is webpack code-splitting; `selectBrandSkin` is an
  explicit model of that, not literal kit code.
- `kind` labels (marketplace/courier/payment/bank) are inferred.
- No `kleinanzeigen` literal asset prefix was present in these chunks (the German
  family seen is `markt`/`marktplaats`/`2dehands`); listed only because the task
  named it.
- Per-brand `Global` CSS blobs are truncated in the reconstructions (full text is
  in the raw chunks).
