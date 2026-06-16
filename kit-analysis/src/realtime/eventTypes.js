/**
 * eventTypes.js
 * -----------------------------------------------------------------------------
 * Technical reconstruction for security research — source documentation, READ-ONLY, NOT EXECUTABLE.
 *
 * Source chunks:
 *   - kit-source/decompressed/170e4bae9438...txt  (EventTypes enum, module 1074)
 *   - kit-source/decompressed/5addca557de7...txt  (which stages emit which events)
 *   - kit-source/decompressed/d0efa970927f...txt  (payment-modal event)
 *
 * SUBSYSTEM: Realtime transport -- funnel telemetry vocabulary.
 *
 * EventTypes is the COMPLETE enum of `event_type` values carried by the
 * {type:"ad:event"} telemetry frame (see helpdeskChat.js section 4). Each value
 * marks a stage in the phishing funnel; the operator watches these arrive in
 * real time and steers the victim accordingly. The captured victim data rides
 * in the sibling `event_data` field.
 *
 * The ENUM KEY -> WIRE STRING mapping below is VERBATIM from the bundle.
 * -----------------------------------------------------------------------------
 */

const EventTypes = {
  // --- entry / page-open stages ---
  OpenTrafficLinkEvent: "open_traffic_link", // victim clicked the inbound lure link
  OpenPhishingEvent: "open_phishing",        // phishing page itself opened
  OpenLoginPageEvent: "open_login_page",     // marketplace "login" page shown
  OpenLKPageEvent: "open_lk_page",           // "ЛК"/Личный Кабинет = personal account page shown
  OpenPaymentEvent: "open_payment",          // payment step opened

  // --- victim data-capture stages (event_data carries the stolen values) ---
  EnterContactFormEvent: "enter_contact_form",
  EnterEmailInputEvent: "enter_email_input",
  EnterFullNameEvent: "enter_full_name",
  EnterPhoneNumberBankPreloaderEvent: "enter_phone_number_bank_preloader",
  EnterLoginDataEvent: "enter_login_data",   // marketplace login credentials
  EnterLKDataEvent: "enter_lk_data",         // personal-account credentials/data
  EnterPaymentModalEvent: "enter_payment_modal",          // generic payment-modal interaction
  EnterPaymentCardDetailsEvent: "enter_payment_card_details", // card number/expiry/CVV
  EnterPaymentBlikDetailsEvent: "enter_payment_blik_details", // BLIK (Polish bank) code
  EnterVerifyDataEvent: "enter_verify_data", // OTP / 3-D Secure / bank verification code
};

/**
 * FUNNEL ORDER
 * -----------------------------------------------------------------------------
 * The intended progression of a victim through the kit (as implied by stage
 * names + which UI component emits each event in chunk 5addca). RECONSTRUCTED-
 * APPROX ordering -- the kit does not store an explicit ordered list; this is
 * the reading of the funnel for the investigator.
 *
 *   1. OpenTrafficLink        -> victim clicks the lure link
 *   2. OpenPhishing           -> phishing page loads
 *   3. EnterContactForm       -> contact form shown / filled, capturing:
 *        - EnterEmail
 *        - EnterFullName
 *        - EnterPhoneNumberBankPreloader   (phone + "bank preloader" stall screen)
 *   4. OpenLoginPage          -> fake marketplace login
 *   5. EnterLoginData         -> login credentials captured
 *   6. OpenLKPage             -> fake personal-account ("ЛК") page
 *   7. EnterLKData            -> personal-account data captured
 *   8. OpenPayment            -> payment step
 *   9. EnterPaymentCardDetails / EnterPaymentBlikDetails  (card OR BLIK captured)
 *  10. EnterVerifyData        -> OTP / 3-DS / bank verification code captured
 *
 *  (EnterPaymentModalEvent is the umbrella event fired for payment-modal
 *   interactions; it carries dialog_type + service_method in event_data.)
 */
const FUNNEL_ORDER = [
  EventTypes.OpenTrafficLinkEvent,
  EventTypes.OpenPhishingEvent,
  EventTypes.EnterContactFormEvent,
  EventTypes.EnterEmailInputEvent,
  EventTypes.EnterFullNameEvent,
  EventTypes.EnterPhoneNumberBankPreloaderEvent,
  EventTypes.OpenLoginPageEvent,
  EventTypes.EnterLoginDataEvent,
  EventTypes.OpenLKPageEvent,
  EventTypes.EnterLKDataEvent,
  EventTypes.OpenPaymentEvent,
  EventTypes.EnterPaymentCardDetailsEvent,
  EventTypes.EnterPaymentBlikDetailsEvent,
  EventTypes.EnterVerifyDataEvent,
];

export { EventTypes, FUNNEL_ORDER };
