/**
 * scenarios.js — RECONSTRUCTED from minified Next.js 16.2.7 production bundle
 *
 * TECHNICAL REVERSE-ENGINEERING FOR SECURITY RESEARCH — SOURCE DOCUMENTATION, NOT EXECUTABLE.
 * Source chunk: kit-source/decompressed/327d4aa1e539...js.txt
 *
 * WHAT THIS IS
 * ------------
 * The scam "scenarios" (operator playbooks) that the page-builder can apply. The operator
 * picks a scenario in the panel's "Сценарий" (Scenario) and "Метод" (Method) drop-downs
 * (see templateSettingsPanel.js). Each scenario name appears IN RUSSIAN in the operator UI,
 * while the per-scenario victim-facing copy is an English i18n dictionary (`scenarioContent`
 * below, minified name `en`).
 *
 * THE TWO HEADLINE SCENARIOS
 * --------------------------
 *   Покупка (1.0)  = "Purchase 1.0"   -> internal method key "1_0"
 *   Выплата (2.0)  = "Payout 2.0"     -> internal method key "2_0"
 *
 * TOKEN-PREFIX ATTRIBUTION NOTE (from the wider kit investigation):
 *   The per-victim token prefix "2/" corresponds to the Выплата (Payout) 2.0 scenario,
 *   i.e. method key "2_0". The leading "2" in the token mirrors the "2.0" scenario version
 *   and the "2_0" content key. (The literal "2/" prefix is generated elsewhere in the kit;
 *   it is not present in these two chunks, but the mapping 2.0 == Выплата == "2_0" is fully
 *   confirmed here.)
 *
 * IMPORTANT QUIRK — SWAPPED VALUE/LABEL IN THE "Сценарий" DROPDOWN
 * ---------------------------------------------------------------
 * In the panel's "Сценарий" (Scenario) <select>, the option VALUES and visible LABELS are
 * crossed over in the source:
 *     <option value="purchase">Выплата (2.0)</option>   // value says purchase, label says Payout 2.0
 *     <option value="payout">Покупка (1.0)</option>      // value says payout,   label says Purchase 1.0
 * Meanwhile the SEPARATE "Метод" (Method) dropdown is consistent:
 *     <option value="2_0">2.0 (выплата)</option>         // Payout
 *     <option value="1_0">1.0 (покупка)</option>         // Purchase
 * And the default state ships preset:"purchase" together with method:"2_0".
 * So the human-meaningful scenario the operator selects is driven by the "Метод" key
 * ("2_0"/"1_0"), and the "purchase"/"payout" preset values are mislabeled in the UI.
 * This is preserved verbatim below — do not "fix" it; it is part of the evidence.
 */

/* -----------------------------------------------------------------------------------------
 * Operator-facing scenario list (RUSSIAN labels — authorship evidence)
 * These are the exact strings shown in the "Сценарий" dropdown.
 * --------------------------------------------------------------------------------------- */
export const SCENARIO_LABELS = [
  // value (as written in bundle) ; Russian label ; English translation
  { value: "purchase", label: "Выплата (2.0)",  en: "Payout (2.0)" },   // (label/value swapped — see note)
  { value: "payout",   label: "Покупка (1.0)",  en: "Purchase (1.0)" }, // (label/value swapped — see note)
  { value: "verify",   label: "Верификация",    en: "Verification" },
  { value: "delivery", label: "Доставка",       en: "Delivery" },
  { value: "custom",   label: "Своя тема",       en: "Custom theme" },
];

/* -----------------------------------------------------------------------------------------
 * Operator-facing METHOD list (RUSSIAN labels). This is the consistent, authoritative
 * scenario selector. The method key is what selects the victim-facing content dictionary.
 * --------------------------------------------------------------------------------------- */
export const METHOD_LABELS = [
  { value: "2_0",    label: "2.0 (выплата)", en: "2.0 (payout)" },   // -> Выплата / Payout 2.0 ; token prefix "2/"
  { value: "1_0",    label: "1.0 (покупка)", en: "1.0 (purchase)" }, // -> Покупка / Purchase 1.0
  { value: "verify", label: "Верификация",   en: "Verification" },
];

/* -----------------------------------------------------------------------------------------
 * VICTIM-FACING SCENARIO CONTENT (minified name `en`)
 * English i18n strings injected into the fake marketplace page per method key.
 * These are the actual social-engineering scripts shown to victims.
 *
 * "2_0" (Выплата / Payout 2.0):
 *   Frames the victim as a SELLER whose buyer "reserved payment"; pressures them to
 *   "Accept Payment" and ship/confirm — the classic fake-escrow payout lure.
 * "1_0" (Покупка / Purchase 1.0):
 *   Frames the victim as a SELLER whose sale is "complete"; pressures them to "Get Payout"
 *   and enter payout/banking details to "claim" non-existent earnings.
 * --------------------------------------------------------------------------------------- */
export const scenarioContent = {
  // ===== Выплата / Payout 2.0 ===== (selected by method "2_0"; token prefix "2/")
  "2_0": {
    "notification.title": "Payment Reserved",
    "notification.description": "The buyer has reserved payment. Review the details and accept.",
    "section.title": "Order Details",
    "section.subtitle": "Review and accept the payment",
    "section.badge": "Payment Reserved",
    "product.heading": "Product",
    "product.subheading": "Order information",
    "product.image-placeholder": "No image",
    "product.field.shipping-address": "Shipping address",
    "product.field.estimated-date": "Estimated delivery",
    "product.field.shipping-terms": "Shipping terms apply",
    "product.field.delivery-price": "Delivery price",
    "product.faq.how-it-works.q": "How does it work?",
    "product.faq.how-it-works.a":
      "After you accept the payment, ship the item to the buyer. Once delivery is confirmed, you will receive the funds.",
    "product.faq.payout-timing.q": "When will I receive the payment?",
    "product.faq.payout-timing.a":
      "Payment is transferred after the buyer confirms receipt of the item.",
    "recipient.heading": "Buyer",
    "recipient.subheading": "Buyer information",
    "recipient.field.first-name": "First name",
    "recipient.field.last-name": "Last name",
    "recipient.field.address": "Delivery address",
    "recipient.disclaimer.prefix": "By clicking",
    "recipient.disclaimer.action": "Accept Payment",
    "recipient.disclaimer.suffix": "you agree to ship the item to the specified address.",
    "recipient.note": "You must ship within 5-7 business days after accepting.",
    "cta.label": "Accept Payment",
    "cta.floating.label": "Accept",
    "cta.floating.description": "Accept the payment and ship the item",
    "progress.step.creation": "Creation",
    "progress.step.payment": "Payment",
    "progress.step.payout": "Payout",
    "progress.step.delivery": "Delivery",
  },

  // ===== Покупка / Purchase 1.0 ===== (selected by method "1_0")
  "1_0": {
    "notification.title": "Payout Ready",
    "notification.description": "Your sale is complete. Claim your payout now.",
    "section.title": "Payout Details",
    "section.subtitle": "Review and claim your earnings",
    "section.badge": "Ready for Payout",
    "product.heading": "Sold Item",
    "product.subheading": "Transaction details",
    "product.image-placeholder": "No image",
    "product.field.shipping-address": "Shipped to",
    "product.field.estimated-date": "Delivered on",
    "product.field.shipping-terms": "",
    "product.field.delivery-price": "Delivery price",
    "product.faq.how-it-works.q": "How do I receive my money?",
    "product.faq.how-it-works.a":
      "Click the button below to claim your payout. Funds will be transferred to your registered payment method.",
    "product.faq.payout-timing.q": "How long does the transfer take?",
    "product.faq.payout-timing.a":
      "Payouts are processed within 1-3 business days depending on your payment method.",
    "recipient.heading": "Seller",
    "recipient.subheading": "Your information",
    "recipient.field.first-name": "First name",
    "recipient.field.last-name": "Last name",
    "recipient.field.address": "Payout address",
    "recipient.disclaimer.prefix": "By clicking",
    "recipient.disclaimer.action": "Get Payout",
    // RECONSTRUCTED-APPROX: suffix continues past the captured slice in the bundle
    "recipient.disclaimer.suffix":
      "you confirm the transaction and r…", // truncated in source slice
    // ...additional 1_0 keys (cta.*, progress.step.*, etc.) follow the same shape as 2_0
  },

  // A "verify" method key also exists (scenario "Верификация" / Verification); its content
  // lives in the same dictionary but was outside the captured window. // RECONSTRUCTED-APPROX
};
