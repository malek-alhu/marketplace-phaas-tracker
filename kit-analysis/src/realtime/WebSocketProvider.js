/**
 * WebSocketProvider.js
 * -----------------------------------------------------------------------------
 * TECHNICAL RECONSTRUCTION.
 * Reverse-engineered from a minified Next.js 16.2.7 production bundle of a
 * marketplace phishing kit. This file is READ-ONLY documentation of behaviour.
 * NOT EXECUTABLE. Nothing here should ever be executed.
 *
 * Source chunks:
 *   - kit-source/decompressed/a3b309f4fb71...txt  (helpdesk WS provider, class `g`)
 *   - kit-source/decompressed/170e4bae9438...txt  (stripe/sync + /api/ws/sync provider)
 *
 * SUBSYSTEM: Realtime transport. This is the reconnecting WebSocket client that
 * the phishing kit uses to (a) run the victim<->operator "helpdesk" chat,
 * (b) stream a live Stripe payment-sync channel, and (c) push victim telemetry.
 *
 * There are TWO nearly-identical minified provider classes in the bundle:
 *   1. The "helpdesk" provider (chunk a3b309f4, minified class `g`) -- richer:
 *      it understands server `connected`/`disconnect` control frames, an
 *      `outboundQueue` with TTL, and a `disconnectData.reason` kill-switch.
 *   2. The "stripe/sync" provider (chunk 170e4bae) -- simpler: adds a
 *      pause()/resume() gate + `pausedMessagesQueue`, but has NO disconnectData
 *      / control-frame handling.
 *
 * This file reconstructs (1) in full and documents the (2) deltas inline.
 * Minified single-letter names have been renamed to readable identifiers.
 * -----------------------------------------------------------------------------
 */

// Status state machine. Verbatim string literals from the bundle (setStatus).
// "idle" | "connecting" | "open" | "closing" | "closed" | "error"
const WS_STATUS = {
  IDLE: "idle",
  CONNECTING: "connecting",
  OPEN: "open",
  CLOSING: "closing",
  CLOSED: "closed",
  ERROR: "error",
};

/**
 * Reasons (sent by the C2 server inside a `disconnect` control frame) that are
 * treated as a permanent kill-switch: the client sets manualClose=true and will
 * NOT attempt to reconnect. IOC: these literal strings appear in the protocol.
 */
const CRITICAL_DISCONNECT_REASONS = ["auth_error", "session_expired"];

class ReconnectingWebSocketProvider {
  constructor() {
    this.socket = null;
    this.status = WS_STATUS.IDLE;

    // Default endpoint = helpdesk channel. getWsBaseUrl() is reconstructed in
    // channels.js. Literal path preserved: `${getWsBaseUrl()}/ws/helpdesk`.
    // (The stripe variant defaults this to `${getWsBaseUrl()}/api/ws/stripe/sync`.)
    this.url = `${getWsBaseUrl()}/ws/helpdesk`;
    this.protocols = undefined;

    // Backoff schedule in ms. NOTE the class field default is [1000,3000,5000],
    // but the helpdesk facade (`_.init`) overrides it to [1000,5000,30000].
    this.backoffMs = [1000, 3000, 5000];
    this.nextBackoffIndex = 0;

    // When true, handleCloseOrError() will NOT reconnect.
    this.manualClose = false;
    this.reconnectTimeoutId = null;

    this.messageListeners = [];
    this.statusListeners = [];

    // persistentQueue: messages flagged persistent (send(msg, true)). They are
    // RE-SENT on every (re)connection via flushPersistentQueue.
    this.persistentQueue = [];

    // outboundQueue: best-effort messages buffered while not OPEN. Each entry
    // is {message, queuedAt}; entries older than outboundTtlMs are dropped on
    // flush. (This queue exists only in the helpdesk provider.)
    this.outboundQueue = [];
    this.outboundTtlMs = 15000; // 15e3

    this.params = undefined;       // query params appended to the URL
    this.disconnectData = null;    // last server `disconnect` payload, see below
  }

  /**
   * init(options): configure and immediately connect().
   * options = { url?, protocols?, backoffMs?, params? }
   * - If `url` is given and does NOT already start with "ws", it is coerced via
   *   normalizeToWs (http->ws, https->wss).
   * - If `params` is given, they are serialized with URLSearchParams and
   *   appended as the query string. For helpdesk: params = { ad_id }.
   *   For stripe/sync: params = { ad_id, service_method }.
   */
  init(options) {
    if (options?.url) {
      this.url = options.url.startsWith("ws")
        ? options.url
        : this.normalizeToWs(options.url);
    }
    if (options?.protocols) this.protocols = options.protocols;
    if (options?.backoffMs && options.backoffMs.length > 0) {
      this.backoffMs = options.backoffMs;
    }
    if (options?.params) this.params = options.params;

    if (this.params) {
      this.url = `${this.url}?${new URLSearchParams(this.params).toString()}`;
    }

    this.manualClose = false;
    this.connect();
  }

  /**
   * normalizeToWs: scheme-coerce an http(s) URL into a ws(s) URL.
   * Verbatim logic from the bundle.
   */
  normalizeToWs(url) {
    if (url.startsWith("http://")) return url.replace("http://", "ws://");
    if (url.startsWith("https://")) return url.replace("https://", "wss://");
    if (url.startsWith("ws")) return url;
    return `ws://${url}`;
  }

  /** setStatus: only fires listeners when the status actually changes. */
  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) listener(this.status);
  }

  connect() {
    this.setStatus(WS_STATUS.CONNECTING);
    // The bundle logs the target URL to console -- useful IOC for an analyst
    // watching the victim's browser devtools.
    console.log(`[WebSocketProvider] Connecting to ${this.url}`);

    try {
      this.socket = this.protocols
        ? new WebSocket(this.url, this.protocols)
        : new WebSocket(this.url);
    } catch (e) {
      this.handleCloseOrError();
      return;
    }

    this.socket.onopen = () => {
      console.log("[WebSocketProvider] Connection opened");
      this.setStatus(WS_STATUS.OPEN);
      this.nextBackoffIndex = 0;     // reset backoff on a successful connect
      this.disconnectData = null;
      if (this.reconnectTimeoutId !== null) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      // Replay buffered traffic.
      this.flushPersistentQueue();
      this.flushOutboundQueue();
    };

    this.socket.onmessage = (event) => {
      let frame = null;
      try {
        frame = JSON.parse(event.data);
      } catch (e) {
        // non-JSON frame: ignored
      }
      if (!frame || typeof frame.type !== "string") return;

      // --- Server control frames ---
      if (frame.type === "connected") {
        // Handshake ack: reset backoff, clear any pending disconnect reason.
        this.nextBackoffIndex = 0;
        this.disconnectData = null;
        return;
      }

      if (frame.type === "disconnect") {
        // Server is asking us to disconnect. Payload shape:
        //   { reason, message, reconnectAfter }
        const data = frame.data;
        this.disconnectData = data;

        if (data.reason && CRITICAL_DISCONNECT_REASONS.includes(data.reason)) {
          // Permanent kill-switch -> do not reconnect.
          this.manualClose = true;
          this.setStatus(WS_STATUS.CLOSED);
          console.warn(
            "WebSocket disconnected with critical reason, not reconnecting:",
            data.reason
          );
        } else {
          // Transient -> mark error; reconnect logic will honour reconnectAfter.
          this.setStatus(WS_STATUS.ERROR);
        }
        this.socket?.close();
        return;
      }

      // --- Application frames --- forwarded to all message listeners.
      // (Listeners are wired by helpdeskChat.js's EventBus dispatcher.)
      for (const listener of this.messageListeners) listener(frame);
    };

    this.socket.onerror = () => this.handleCloseOrError();

    this.socket.onclose = (event) => {
      console.log(
        `[WebSocketProvider] WebSocket closed: code=${event.code}, ` +
          `reason=${event.reason}, wasClean=${event.wasClean}`
      );
      this.handleCloseOrError();
    };
  }

  /**
   * handleCloseOrError: central reconnect decision point. Called from
   * onerror, onclose, and the catch in connect().
   */
  handleCloseOrError() {
    if (this.manualClose) {
      console.log("[WebSocketProvider] Manual close, not reconnecting");
      this.setStatus(WS_STATUS.CLOSED);
      return;
    }

    // Honour a critical disconnect reason even if it arrived just before close.
    if (
      this.disconnectData &&
      this.disconnectData.reason &&
      CRITICAL_DISCONNECT_REASONS.includes(this.disconnectData.reason)
    ) {
      this.manualClose = true;
      this.setStatus(WS_STATUS.CLOSED);
      console.warn(
        "[WebSocketProvider] WebSocket closed with critical reason, not reconnecting:",
        this.disconnectData.reason
      );
      return;
    }

    this.setStatus(WS_STATUS.ERROR);

    const delay = this.computeNextDelay();
    console.log(`[WebSocketProvider] Will reconnect after ${delay}ms`);

    if (this.reconnectTimeoutId === null) {
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        if (!this.manualClose) {
          console.log("[WebSocketProvider] Attempting to reconnect...");
          this.connect();
        }
      }, delay);
    }
  }

  /**
   * computeNextDelay: returns the next reconnect delay in ms.
   * - If the server's last `disconnect` frame carried `reconnectAfter`, that
   *   value WINS (server-directed backoff).
   * - Otherwise walk the backoffMs[] schedule, clamping at the last index and
   *   advancing the index by one each call (so it "ramps up" then holds).
   *
   * The stripe/sync provider variant has NO reconnectAfter branch; it only
   * walks the backoffMs schedule.
   */
  computeNextDelay() {
    if (this.disconnectData?.reconnectAfter) {
      return this.disconnectData.reconnectAfter;
    }
    const idx = Math.min(this.nextBackoffIndex, this.backoffMs.length - 1);
    const delay = this.backoffMs[idx];
    if (this.nextBackoffIndex < this.backoffMs.length - 1) {
      this.nextBackoffIndex += 1;
    }
    return delay;
  }

  /** Re-send every persistent message (only when OPEN). Stops on first failure. */
  flushPersistentQueue() {
    if (!(this.socket && this.status === WS_STATUS.OPEN)) return;
    for (const message of this.persistentQueue) {
      try {
        this.socket.send(JSON.stringify(message));
      } catch (e) {
        break;
      }
    }
  }

  /**
   * Flush the best-effort outbound queue, dropping anything older than
   * outboundTtlMs. Failed sends are re-queued.
   */
  flushOutboundQueue() {
    if (!this.socket || this.status !== WS_STATUS.OPEN) return;
    const now = Date.now();
    const pending = this.outboundQueue;
    this.outboundQueue = [];
    for (const entry of pending) {
      if (now - entry.queuedAt > this.outboundTtlMs) continue; // expired -> drop
      try {
        this.socket.send(JSON.stringify(entry.message));
      } catch (e) {
        this.outboundQueue.push(entry); // re-queue on failure
      }
    }
  }

  onMessage(listener) {
    this.messageListeners.push(listener);
  }
  offMessage(listener) {
    this.messageListeners = this.messageListeners.filter((l) => l !== listener);
  }
  onStatus(listener) {
    this.statusListeners.push(listener);
  }
  offStatus(listener) {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /**
   * send(message, persistent=false):
   * - If persistent, the message is appended to persistentQueue (replayed on
   *   every reconnect).
   * - If OPEN, send immediately.
   * - Otherwise (and only if NOT persistent), buffer into outboundQueue with a
   *   timestamp for TTL handling.
   */
  send(message, persistent = false) {
    if (persistent) this.persistentQueue.push(message);
    if (this.socket && this.status === WS_STATUS.OPEN) {
      try {
        this.socket.send(JSON.stringify(message));
        return;
      } catch (e) {
        // fall through to queue
      }
    }
    if (!persistent) {
      this.outboundQueue.push({ message, queuedAt: Date.now() });
    }
  }

  /** Operator/manual close: prevents any further reconnect. */
  close() {
    this.manualClose = true;
    this.setStatus(WS_STATUS.CLOSING);
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }
    this.setStatus(WS_STATUS.CLOSED);
  }

  getStatus() {
    return this.status;
  }
}

/* ---------------------------------------------------------------------------
 * STRIPE/SYNC PROVIDER VARIANT (chunk 170e4bae) -- DELTAS ONLY.
 * The class is otherwise identical to the above (same backoff/normalizeToWs/
 * reconnect logic) EXCEPT:
 *
 *   paused = false;
 *   pausedMessagesQueue = [];
 *
 *   // In onmessage, before dispatching to listeners:
 *   //   if (this.paused) { this.pausedMessagesQueue.push(frame); return; }
 *
 *   pause()        -> this.paused = true
 *   resume()       -> this.paused = false; drain pausedMessagesQueue to listeners
 *   isPaused()     -> this.paused
 *   clearPausedQueue() -> this.pausedMessagesQueue = []
 *
 *   // It has NO `connected`/`disconnect` control-frame handling and NO
 *   // disconnectData / reconnectAfter logic -- computeNextDelay only walks
 *   // backoffMs. Default url = `${getWsBaseUrl()}/api/ws/stripe/sync`.
 *
 * The matching facade (the `_`/`$.sync` singleton) exposes:
 *   init, getProvider, onStatus/offStatus, on/off, send, getStatus, close,
 *   pauseProvider(), resumeProvider(), isProviderPaused(), clearProviderQueue().
 * It is documented in channels.js.
 * ------------------------------------------------------------------------- */

// RECONSTRUCTED-APPROX export surface (the bundle uses Turbopack module wiring,
// not ES exports; these names are for the investigator's reading convenience).
export { ReconnectingWebSocketProvider, WS_STATUS, CRITICAL_DISCONNECT_REASONS };
