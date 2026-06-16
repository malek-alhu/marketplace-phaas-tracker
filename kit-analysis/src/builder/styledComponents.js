/**
 * styledComponents.js — RECONSTRUCTED from minified Next.js 16.2.7 production bundle
 *
 * TECHNICAL REVERSE-ENGINEERING FOR SECURITY RESEARCH — SOURCE DOCUMENTATION, NOT EXECUTABLE.
 * Source chunk: kit-source/decompressed/dc7efb52ff51...js.txt
 *
 * WHAT THIS IS
 * ------------
 * The named styled-components (styled-components / Emotion `withConfig` factories) emitted
 * by the kit's compiled page templates. Each carries a `displayName` (preserved at build
 * time) that reveals the ORIGINAL React component file/name in the author's source tree —
 * useful attribution metadata. Below, each is reconstructed with its exact displayName,
 * componentId, and CSS, plus a description of what it renders.
 *
 * Components found in THIS chunk:
 *   - VerifyMainBlock___StyledDiv   (sc-60ccd14a-0)
 *   - VerifyMainBlock___StyledDiv2  (sc-60ccd14a-1)
 *
 * Naming convention `<Owner>___Styled<Tag>[n]` is the styled-components Babel-plugin format:
 *   "Owner" = the React component that defined the styled element (here: `VerifyMainBlock`).
 * (The prompt also references `Site___StyledDiv`; that lives in a different bundle chunk and
 *  is not present here. // RECONSTRUCTED-APPROX)
 */

import styled from "styled-components"; // r.default
import { css } from "styled-components"; // o.css

/* =========================================================================================
 * VerifyMainBlock___StyledDiv  (minified local: _)
 * A simple positioning wrapper placed *behind* page content.
 * ======================================================================================= */
export const VerifyMainBlock___StyledDiv = styled("div").withConfig({
  displayName: "VerifyMainBlock___StyledDiv",
  componentId: "sc-60ccd14a-0",
})`
  ${css("position:relative;z-index:1;")}
`;

/* =========================================================================================
 * VerifyMainBlock___StyledDiv2  (minified local: L)
 * The foreground content card wrapper (sits above the StyledDiv background, higher z-index).
 * In the rendered page it wraps the verification message box + the "Verificar" CTA button.
 * ======================================================================================= */
export const VerifyMainBlock___StyledDiv2 = styled("div").withConfig({
  displayName: "VerifyMainBlock___StyledDiv2",
  componentId: "sc-60ccd14a-1",
})`
  ${css("position:relative;z-index:10;")}
`;

/* =========================================================================================
 * VerifyMainBlock  — the React component that OWNS the two styled divs above.
 * (Reconstructed from the surrounding JSX; renamed minified identifiers.)
 *
 * This is the VICTIM-FACING page body for the "Verificación" (Verify) scenario, themed as
 * the Spanish classifieds marketplace **Milanuncios**. It renders:
 *   - an avatar/face SVG (#007AFF Apple-blue) inside StyledDiv (background layer),
 *   - a heading (prop `title`, default Spanish "Su cuenta" = "Your account"),
 *   - inside StyledDiv2 (foreground): a white card with the Spanish coercion paragraph and
 *     a green "Verificar" ("Verify") button linking to the phishing capture URL.
 *
 * VERBATIM Spanish victim-facing copy (NOT author language — this is the lure shown to
 * Spanish-speaking victims; the AUTHOR/operator UI is Russian, see other files):
 *   "Su cuenta de Milanuncios está restringida, ahora los anuncios no son visibles para
 *    otros usuarios. Necesitamos verificar tu identidad para solucionar esto. Confirma tus
 *    datos bancarios en un plazo de 24 horas, de lo contrario, la cuenta será eliminada.
 *    Una vez completada la verificación, se eliminarán todas las restricciones y tu cuenta
 *    de Milanuncios se activará. Si tienes alguna pregunta, escríbenos en el chat de abajo
 *    y te ayudaremos. Gracias por tu comprensión."
 *   English: "Your Milanuncios account is restricted... We need to verify your identity...
 *    Confirm your banking details within 24 hours or the account will be deleted..." — a
 *    classic urgency + bank-detail-capture lure.
 *   CTA button text: "Verificar" = "Verify".
 * ======================================================================================= */
export function VerifyMainBlock({ title, verifyLink }) {
  return (
    <VerifyMainBlock___StyledDiv>
      {/* background layer: avatar/face SVG (#007AFF) + heading */}
      {/* ...avatar <svg viewBox="0 0 28 41" .../> ... */}
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 text-center">
        {title || "Su cuenta" /* "Your account" */}
      </h2>

      <VerifyMainBlock___StyledDiv2 className="max-w-2xl w-full">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 md:p-6 mb-4 md:mb-6">
          <p className="text-sm md:text-base text-gray-700 leading-relaxed text-center">
            {/* Spanish coercion paragraph — see verbatim text in the header comment above */}
            Su cuenta de Milanuncios está restringida, ahora los anuncios no son visibles
            para otros usuarios. Necesitamos verificar tu identidad para solucionar esto.
            Confirma tus datos bancarios en un plazo de 24 horas, de lo contrario, la cuenta
            será eliminada. Una vez completada la verificación, se eliminarán todas las
            restricciones y tu cuenta de Milanuncios se activará. Si tienes alguna pregunta,
            escríbenos en el chat de abajo y te ayudaremos. Gracias por tu comprensión.
          </p>
        </div>
        {verifyLink && (
          <div className="flex justify-center">
            <a href={verifyLink}
               className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 px-6 md:py-3 md:px-8 rounded-lg shadow-md ...">
              Verificar{/* "Verify" — submits victim to the phishing capture flow */}
            </a>
          </div>
        )}
      </VerifyMainBlock___StyledDiv2>
    </VerifyMainBlock___StyledDiv>
  );
}

/* -----------------------------------------------------------------------------------------
 * RELATED (non-styled-component) marketplace chrome rendered alongside VerifyMainBlock,
 * also impersonating Milanuncios (logo assets baked into the kit):
 *   <a href="https://www.milanuncios.com/"> with
 *     /static/milanuncios/media/logo-desktop.svg  (desktop logo)
 *     /static/milanuncios/media/logo-mobile.svg   (mobile logo)
 *   alt="Milanuncios"
 * These hard-coded brand assets are part of the kit's impersonation payload.
 * --------------------------------------------------------------------------------------- */
