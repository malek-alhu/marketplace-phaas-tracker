# MODULE: builder — the phishing-kit page-builder subsystem

**Technical reverse-engineering for security research. Nothing here is executable; it
documents recovered behaviour of a malicious kit.**

Reconstructed from a minified Next.js 16.2.7 production bundle:
- `kit-source/decompressed/327d4aa1e539…js.txt`
- `kit-source/decompressed/dc7efb52ff51…js.txt`

## What the builder is

This subsystem is the kit's **in-browser WYSIWYG "page builder" / admin panel**. An operator
loads a deployed page in "dev" mode and a draggable, collapsible floating panel appears
(`role="region"`, aria-label **"Панель настроек шаблона"** = *Template settings panel*). From
it the operator configures a fake marketplace page **before sending it to victims** — no code
editing required. The entire panel UI is **in Russian** (see `AUTHORSHIP.md`); the pages it
produces target English- and Spanish-speaking victims.

## Files in this module

| File | Contents |
|---|---|
| `templateSettingsPanel.js` | The full builder UI: title bar (drag/hide/collapse), "Быстрый старт" quick-start, and 7 accordion sections (Header, Footer, Typography, Layout, Visual effects, Advanced colors, Detailed visibility). Also `defaultDevState` + the `BUTTON_VARIANT_LABELS`/`BLOCK_ELEMENT_LABELS` Russian dictionaries. |
| `scenarios.js` | The scam scenario presets (`Покупка 1.0` / `Выплата 2.0` / Verify / Delivery / Custom), the `2_0`/`1_0` victim-facing English i18n content, and the `2/` token-prefix → Payout 2.0 mapping. |
| `styledComponents.js` | The named styled-components `VerifyMainBlock___StyledDiv`/`…StyledDiv2` and the `VerifyMainBlock` Milanuncios verification-scam page they wrap. |
| `AUTHORSHIP.md` | All recovered Russian strings (123 distinct) with translations — authorship evidence. |

## How it works (data flow)

1. **State.** The panel is driven by a single state object (`defaultDevState` in
   `templateSettingsPanel.js`): scenario `preset`, content `method`, theme colours, fonts,
   radii, block visibility map, header nav/actions, footer socials/store badges, etc.
   `patchState({...})` shallow-merges edits; `setBlockVisible(key, checked)` toggles page
   elements; `setPreset(value)` applies a scam scenario.

2. **Scenario selection.** "Быстрый старт" exposes two selectors:
   - **Сценарий** (*Scenario*) — `Покупка (1.0)` / `Выплата (2.0)` / `Верификация` /
     `Доставка` / `Своя тема`. (NB: in this dropdown the option *values* and *labels* are
     swapped in the source — documented, preserved as evidence.)
   - **Метод** (*Method*) — `2_0` / `1_0` / `verify`. The method key chooses which
     victim-facing i18n dictionary (`scenarioContent` in `scenarios.js`) renders.
   Default ships `preset:"purchase", method:"2_0"` → the **Payout 2.0** scenario, whose
   per-victim token prefix is **`2/`**.

3. **Branding & theming.** Operator can upload/replace a logo (data-URL), set a brand name +
   custom Google Font (search) or upload a local font (`.woff2/.woff/.ttf/.otf`), pick a brand
   colour and advanced surface/background/foreground colours, card/button radii, shadows,
   animation speed, and RTL. Defaults brand the page as **"Continental Group"**
   (`/static/cg.png`) — a recurring kit fingerprint.

4. **Layout & visibility.** Operator chooses card order, CTA position, container width, and can
   toggle every block (header/footer/notification/section/product card/recipient card/floating
   bar) and inner element (product image/name/price/details/FAQ/terms, recipient
   name/last-name/address/disclaimer/note, section title/subtitle/badge).

5. **Output / impersonation.** The produced page impersonates a real marketplace. In the
   captured chunk this is **Milanuncios** (Spain): hard-coded logo assets
   `/static/milanuncios/media/logo-desktop.svg` + `…/logo-mobile.svg`, and the
   `VerifyMainBlock` component renders the Spanish "verify your account / confirm bank details
   within 24 hours" lure with a green **"Verificar"** button leading to the credential/bank
   capture flow.

## Criminal purpose (summary)

The builder lets a Russian-speaking operator rapidly spin up brand-accurate fake marketplace
pages that coerce a victim — cast as buyer or seller — into "accepting a payment", "claiming a
payout", or "verifying" their account, ultimately capturing personal and banking data. The
scenario presets are pre-written social-engineering scripts; the panel is the production tool.

## Reconstruction caveats

- Minified single-letter identifiers were renamed for readability; event-handler bodies that
  were not load-bearing for understanding are stubbed with comments.
- Items marked `// RECONSTRUCTED-APPROX` are inferred (e.g. the tail of the `1_0` disclaimer
  string and the `verify` content dictionary fall outside the captured byte window;
  `Site___StyledDiv` referenced in the task brief lives in a different bundle chunk).
- All Russian, English, and Spanish strings are preserved **verbatim**.
