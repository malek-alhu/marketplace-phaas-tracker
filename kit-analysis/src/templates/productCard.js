/**
 * productCard.js — RECONSTRUCTED (technical analysis for security research)
 * =============================================================================
 * Product price/currency rendering + the two external lookups the kit uses to
 * make the fake listing look real and to silently de-anonymise the victim:
 *   - jsDelivr currency-api  : convert the listing price into EUR / USD
 *   - Nominatim (OpenStreetMap) reverse geocode : turn the victim's GPS coords
 *     into a street address (prefilled into the fake delivery form)
 *
 * Reconstructed from:
 *   - kit-source/decompressed/3d6f43bdae97... (ac-text price markers in Subito card)
 *   - kit-source/decompressed/39539e7245...   (formattedPrice mapping, FAN Courier)
 *   - kit-source/decompressed/5addca557de7... (convertPrice — jsDelivr currency-api)
 *   - kit-source/decompressed/60f0e6140d4a... (reverseGeocode — Nominatim)
 *   - kit-source/decompressed/13b9247a9766... (generic price formatter, DE locale)
 *
 * Literal fetch URLs / strings preserved verbatim. DO NOT DEPLOY / DO NOT CALL.
 */

import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import NextImage from "next/image";

/* =============================================================================
 * 1. Price / currency rendering.
 *
 *    The price comes from the server-injected ad as `product_price_formatted`
 *    (a pre-formatted number string) and the currency symbol from
 *    `ad.country.currency.symbol`.
 *
 *    The kit's own scraper/autofill engine targets these via the custom
 *    `ac-text` attribute markers ("ac" = autocomplete/autofill):
 *       ac-text="product-price-formatted"
 *       ac-text="product-currency"
 *       ac-text="delivery-full-name"
 *       ac-text="delivery-address"
 *    i.e. these spans are filled in / read back by the kit, not just displayed.
 * ========================================================================== */

/**
 * ProductPrice — the price block used in the fake ad-info column (Subito skin).
 * Verbatim structure from chunk 3d6f43bdae97.
 */
export function ProductPrice({ priceFormatted, currencySymbol, showShipping, t }) {
  return (
    <p className="index-module_price__N7M2x AdInfo_price__flXgp index-module_large__SUacX">
      <span ac-text="product-price-formatted">{priceFormatted}</span>
      <span ac-text="product-currency">{currencySymbol}</span>
      {showShipping && (
        <span className="caption book small index-module_badge__CJKW4 index-module_detail__zn-Ga shipping-badge index-module_badge__LFSGS index-module_themed__RzZ7w index-module_inverted__kiFh2">
          <svg width="16" height="12" className="index-module_truck__nqyOS index-module_detail-truck__-rhuC" aria-hidden="true">
            <path d="M5.5 7c.817 0 1.543.392 2 .999H9V2H7a1 1 0 01-.993-.883..." /* truck */ />
          </svg>
          {t("shipping_available")}
        </span>
      )}
    </p>
  );
}

/**
 * formatPrice — verbatim generic formatter (chunk 13b9247a, fn `v`).
 * Returns `"<symbol> <value>"`, value forced to 2 decimals. Note: in the
 * German-locale module the "free" fallback string is "Kostenlos" (preserved).
 */
export function formatPrice(value, currencySymbol, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "number") value = value.toFixed(2);
  return `${currencySymbol} ${value}`;
}

/**
 * buildFormattedPrice — the FAN Courier / Subito convention seen inline:
 *   `${ad.product_price_formatted} ${ad.country.currency?.symbol}`
 * (symbol AFTER the amount). Used for the big "Colectează plata" amount and the
 * "Prețul produsului" row. Verbatim from chunk 39539e7245.
 */
export function buildFormattedPrice(ad) {
  return `${ad.product_price_formatted} ${ad.country.currency?.symbol}`;
}

/* =============================================================================
 * 2. Currency conversion via jsDelivr currency-api (@fawazahmed0/currency-api).
 *    VERBATIM URL + logic from chunk 5addca557de7 (module 416779), export
 *    "convertPrice".
 *
 *    Used to show the victim's listing price in EUR and USD (trust/normalisation)
 *    e.g.:  convertPrice(parseFloat(ad.product_price_formatted ?? "0"),
 *                        ad.country.currency.symbol ?? "MDL", "EUR")
 *           convertPrice(..., "USD")   /  convertPrice(amount, "BGN", "EUR")
 * ========================================================================== */

/**
 * convertPrice(amount, fromCode, toCode) -> Promise<number | undefined>
 * Fetches the daily rate table for `toCode` and divides. Returns undefined on
 * any error / non-positive rate / non-finite result (verbatim behaviour).
 */
export async function convertPrice(amount, fromCode, toCode) {
  try {
    const res = await fetch(
      // VERBATIM endpoint:
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${toCode.toLowerCase()}.json`,
      { cache: "default" }
    );
    const data = await res.json();
    const rate = data?.[toCode.toLowerCase()]?.[fromCode.toLowerCase()];
    if (!rate || rate <= 0) return;
    const converted = amount / rate;
    if (!Number.isFinite(converted)) return;
    return converted;
  } catch (e) {
    return;
  }
}

/* =============================================================================
 * 3. Reverse geocode via Nominatim (OpenStreetMap).
 *    VERBATIM URLs from chunk 60f0e6140d4a.
 *
 *    PRIVACY-INVASIVE: gated behind navigator.geolocation with a "granted"
 *    permission check tied to `hide_ask_address_in_ebay`; on grant it auto-fires
 *    (~500ms timeout) to silently turn the victim's GPS lat/lon into a street
 *    address that is then prefilled into the fake delivery form. // from raw chunk
 * ========================================================================== */

/**
 * reverseGeocode(lat, lon) -> Promise<{ displayName, fullData }>
 * Verbatim from chunk 60f0e6140d4a (fn `F`).
 */
export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      // VERBATIM endpoint:
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
    );
    if (!res.ok) throw new Error("Failed to fetch address");
    const data = await res.json();
    return { displayName: data.display_name || "", fullData: data };
  } catch (e) {
    throw e;
  }
}

// Verbatim human-facing OSM "confirm on map" link template (same chunk):
export const nominatimUiUrl = (lat, lon) =>
  `https://nominatim.openstreetmap.org/ui/reverse.html?lat=${lat}&lon=${lon}&zoom=18`;

/* =============================================================================
 * 4. ProductPreviewCard — the small image+title+price preview reused across
 *    skins (verbatim from the Subito AdInfo_preview block). Shows the victim's
 *    OWN product photo/title to make the "you have a sale" story convincing.
 * ========================================================================== */
export function ProductPreviewCard({ imageUrl, title, priceFormatted, currencySymbol }) {
  return (
    <div className="AdInfo_preview__box" style={{ display: "flex", alignItems: "center", gap: "12px", margin: "8px 0 4px 0" }}>
      <div className="AdInfo_preview__image"
           style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e6ecf1", position: "relative", background: "#f8fafc", flexShrink: 0 }}>
        {imageUrl && (
          <NextImage src={imageUrl} alt={title} width={200} height={200} quality={100} priority
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
      </div>
      <div className="AdInfo_preview__texts" style={{ minWidth: 0 }}>
        <div className="mb-1">
          <span className="text-sm truncate! text-wrap text-gray-500 md:max-w-[200px]! block!">{title}</span>
        </div>
        <ProductPrice priceFormatted={priceFormatted} currencySymbol={currencySymbol} />
      </div>
    </div>
  );
}

export default {
  ProductPrice,
  formatPrice,
  buildFormattedPrice,
  convertPrice,
  reverseGeocode,
  nominatimUiUrl,
  ProductPreviewCard,
};
