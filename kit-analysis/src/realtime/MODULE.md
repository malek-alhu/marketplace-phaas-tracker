# Realtime Transport + Helpdesk Chat + Victim Telemetry

Technical reconstruction for security research. Reverse-engineered from a
minified Next.js 16.2.7 production bundle of a marketplace phishing kit. These
notes and the sibling `.js` files are **read-only documentation** — nothing here
is meant to be executed.

## Source chunks (decompressed, minified)

| Chunk (sha256 prefix) | Role in this subsystem |
|---|---|
| `a3b309f4fb71…` | Helpdesk WS provider (rich variant), helpdesk chat widget, victim activity beacon, iframe↔parent postMessage protocol |
| `891034530c94…` | `getApiBaseUrl` / `getWsBaseUrl` / `isLocalhost` base-URL derivation (module 436329) |
| `5addca557de7…` | `stripe/sync` channel init; `ad:event` funnel-telemetry frame builders |
| `170e4bae9438…` | `stripe/sync` + `/api/ws/sync` provider variant (pause/resume); **EventTypes enum** (module 1074) |
| `d0efa970927f…` | Payment-modal `ad:event` emission |

## What the subsystem does

The kit runs a fake "customer support" helpdesk chat plus a live telemetry feed
so a human **operator** (the fraudster) can watch and steer each **victim** in
real time:

1. **Transport** — one reconnecting WebSocket client (`WebSocketProvider.js`)
   wrapped by a per-channel singleton facade. Auto-reconnect with capped backoff,
   server-directed backoff (`reconnectAfter`), and a `disconnect.reason`
   kill-switch (`auth_error` / `session_expired` → stop reconnecting).
2. **Helpdesk chat** (`helpdeskChat.js`) — victim↔operator messaging over
   `/ws/helpdesk`. Operator can push text, images, and **payment links**, and can
   **remotely open/close** the victim's chat window. Runs in an iframe and drives
   the host page via `postMessage`.
3. **Victim telemetry** — a 2s `activity` beacon (IP+geo via ipinfo, persistent
   browser fingerprint, user agent, last-active time) plus the **`ad:event`
   funnel feed** (`eventTypes.js`) that exfiltrates the victim's typed PII / login
   / card / BLIK / OTP data stage by stage.

## Data flow

```
victim browser (phishing page, hostname = victim-facing domain)
   │
   │  wss://<hostname>/ws/helpdesk?ad_id=<id>            (chat + activity beacon)
   │  wss://<hostname>/api/ws/stripe/sync?ad_id=<id>&service_method=<m>  (live card flow)
   │  wss://<hostname>/api/ws/sync                       (ad:event funnel telemetry)
   ▼
C2 / operator backend  ──►  human operator dashboard (live victim feed, push msgs)
```

- Base host is `window.location.hostname` → `wss://<hostname>` in production, so
  the sockets always point back at the phishing page's own origin. Dev fallback:
  `ws://localhost:5002` (`WS_BASE_URL` env override) / `http://localhost:5002`
  (`API_BASE_URL`).
- Inbound frames (`frame.type`) are routed through a small `EventBus`
  (type → Set<handler>) to the chat/store handlers.
- Funnel events flow client→server as `{type:"ad:event", data:{visor_id, ad_id,
  event_type, event_data}}`; the operator sees the victim advance and the stolen
  values arrive in `event_data`.

## Reconnect / backoff (WebSocketProvider)

- Status state machine: `idle → connecting → open → closing → closed`, plus
  `error` on failure.
- Backoff schedule (class default `[1000,3000,5000]`; helpdesk facade overrides
  to `[1000,5000,30000]`). Index ramps up then holds at the last value.
- `connected` frame resets backoff; `disconnect` frame may carry `reconnectAfter`
  (server-directed delay) and/or a critical `reason` that disables reconnect.
- Two queues: `persistentQueue` (replayed every reconnect) and `outboundQueue`
  (best-effort, 15s TTL). The stripe variant instead has `pause/resume` + a
  `pausedMessagesQueue`.

## Indicators of Compromise (IOCs)

### Endpoints (WebSocket)
- `wss://<host>/ws/helpdesk` — params `ad_id`
- `wss://<host>/api/ws/stripe/sync` — params `ad_id`, `service_method`
- `wss://<host>/api/ws/sync`
- Dev/fallback: `ws://localhost:5002`, `http://localhost:5002`
- Env override names: `WS_BASE_URL`, `API_BASE_URL`

### Other network artifacts
- Notification sound asset: `/static/helpdesk/audio/blackberry.mp3`
- Telemetry enrichment: ipinfo-style geo lookup (`resolveClientIPAndGeo`)

### Transport / chat protocol event names
- Inbound: `connected`, `disconnect`, `error`, `messages`, `message_read`,
  `message_delete`, `send_message_result`, `open_helpdesk_widget`,
  `close_helpdesk_widget`
- Outbound: `send_message`, `mark_as_read`, `get_messages`, `activity`,
  and the telemetry envelope `ad:event`
- Disconnect kill-switch reasons: `auth_error`, `session_expired`

### `ad:event` funnel `event_type` values (EventTypes)
`open_traffic_link`, `open_phishing`, `open_login_page`, `open_lk_page`,
`open_payment`, `enter_contact_form`, `enter_email_input`, `enter_full_name`,
`enter_phone_number_bank_preloader`, `enter_login_data`, `enter_lk_data`,
`enter_payment_modal`, `enter_payment_card_details`,
`enter_payment_blik_details`, `enter_verify_data`

### iframe ↔ parent postMessage signals
- Parent→widget: `HD_OPEN_CHAT`, `HD_CLOSE_CHAT`, `HD_MARK_ALL_AS_READ`
- Widget→parent: `HD_OPEN_CHAT`, `HD_CLOSE_CHAT`, `HD_SHOW_MESSAGE_PREVIEW`,
  `HD_SHOW_NOTIFICATION`, `HD_OPEN_LIGHTBOX`

### DOM markers (detect the widget in a captured page)
- `data-id="hd-widget"` (gets `has-new-message` attribute on new operator msg)
- `data-id="hd-widget-chat"`, `hd-chat-input`, `hd-attach-input`
  (accepts `image/jpeg,image/png,image/jpg`, ≤10 MB), `hd-send-btn`,
  `hd-connection-status`, `hd-notify-audio`, `data-id="hd-message-item"`
- Per-message sender markers: attribute `hd-message-operator` vs
  `hd-message-client`
- Operator-pushed payment link block: `data-id="hd-message-payment"`

### Localized strings (Russian) found in this subsystem
- `"Соединение закрыто"` — "Connection closed" (disconnect fallback error)
- `"Оператор"` — "Operator" (default operator display-name fallback)
- CSS comment `/* НЕ ЗАВИСИТ ОТ BRAND */` — "DOES NOT DEPEND ON BRAND"
  (in a sibling styling chunk)

## File index

| File | Contents |
|---|---|
| `WebSocketProvider.js` | Reconnecting WS client: connect, setStatus, computeNextDelay/backoffMs, manualClose, normalizeToWs, disconnectData.reason; stripe pause/resume variant documented inline |
| `channels.js` | The 3 channels + `getWsBaseUrl`/`getApiBaseUrl` derivation and the singleton facade shape |
| `helpdeskChat.js` | EventBus, inbound/outbound chat frames, `ad:event` + `activity` telemetry builders, widget wiring, DOM markers |
| `eventTypes.js` | Full EventTypes enum + reconstructed funnel order |
| `MODULE.md` | This document |

## Reconstruction confidence

Endpoint strings, event names, frame shapes, the EventTypes enum, base-URL
derivation, and the WS provider logic are taken **verbatim** from the bundle and
are high-confidence. Items marked `RECONSTRUCTED-APPROX` in the source files are
interpretive (e.g. the meaning of `visor_id`, the explicit funnel ordering, and
the facade skeleton in `channels.js`), since the kit does not encode those
explicitly.
