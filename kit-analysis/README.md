# Reconstructed Project — phishing-kit source (readable reconstruction)

**Defensive reconstruction for security research.** The original is a **minified Next.js 16.2.7 production bundle**; this is a human-readable, annotated reconstruction of the kit's architecture, for **reading & validation — NOT execution**. It is intentionally **not runnable** and not 100% complete.

## Structure
| Folder | Subsystem |
|---|---|
| `src/realtime/` | WebSocket transport (`WebSocketProvider`), the 3 C2 channels, helpdesk chat protocol, and the victim telemetry funnel (`EventTypes`). |
| `src/builder/` | The **Russian-language WYSIWYG page-builder admin panel**, the scam scenarios (Покупка 1.0 / Выплата 2.0), styled components, and **`AUTHORSHIP.md`** (Russian-string attribution evidence). |
| `src/templates/` | Brand-skin templating, the `/helpdesk/<id>/<brand>` fake-listing page, the product card, and the **~120-brand template list**. |

Each folder has a `MODULE.md`. Cross-check any file against the originals in `kit-source/decompressed/`.

## ⚠️ Intentionally NOT reconstructed as runnable code
- **`src/payment/`** (card capture / validation / BIN / exfil)
- **`src/cloaking/`** (visitor-gating / geo evasion)

Reconstructing these into clean runnable code would amount to rebuilding a **working card-harvester / evasion engine**, which is off-limits. Their **mechanisms are documented at the analytical level** — the appropriate analytical depth for research — in:
> `docs/kit-code-analysis.md` → **§7** (payment/card) and **§9** (cloaking/geo).

## Fidelity notes
- Reconstructed from minified production code; minified variable names were **renamed for readability**.
- **Literal** endpoints, field names, event names, and Russian/foreign strings are **preserved verbatim** (English translations in comments).
- Uncertain logic is marked `// RECONSTRUCTED-APPROX`.
- **Not runnable.** For human reading/validation only.

## Headline findings surfaced during reconstruction
- **~120 brand "skins"** (marketplaces + couriers + payment/bank) — far beyond the live-observed set (see `src/templates/MODULE.md`).
- **Default builder-brand fingerprint: "Continental Group" + logo `/static/cg.png`** (kit hunt signature).
- **Three C2 WebSocket channels**; dev fallback `ws://localhost:5002`.
- **Two-pronged telemetry:** a 2-second `activity` beacon (victim IP+geo+browser fingerprint) + the `ad:event` funnel carrying typed PII/login/card/BLIK/OTP stage by stage.
- **Scam scenarios** Покупка 1.0 / Выплата 2.0 — the per-victim token prefix `2/` = **Выплата (payout) 2.0**.
- **Russian-language operator/builder UI** (123+ Cyrillic strings) → **Russian-speaking authorship** (see `src/builder/AUTHORSHIP.md`).
