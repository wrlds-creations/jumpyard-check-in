# Phone language control — #350

## Scope and implementation

Approved issue: [#350](https://github.com/wrlds-creations/jumpyard-check-in/issues/350).
Branch: `codex/gh-350-phone-language-toggle`, based on current `main`
`9600165ec0dbf81907c36da0b5c769cdfbe7a18e` (after #338 / PR #364). Love asked for a
read-only feasibility check on 2026-09-03 and then approved implementation
("Jag litar på dig kör!").

The phone app already had complete Swedish and English copy and a saved preference
(`jy.lang`), but the check-in flow itself had no way to switch. Only the separate
extend page carried a copy of the kiosk's single-code toggle.

Changed files under `jumpyard-checkin-phone/`:

- `src/components/LanguageToggle.tsx` (new): `SV / EN` as a `role="group"` named
  `Språk` / `Language`. Each option is a native `<button type="button">` with
  `aria-pressed`, its own `lang` attribute and its own-language accessible name
  (`Svenska`, `English`), so a code or flag is never the only cue. Bold italic
  uppercase 9px in the heading style; the active language is black and the other
  muted. Buttons are 24px high for touch and show the primary-colored
  `focus-visible` outline.
- `src/app/page.tsx`: renders the control once, absolutely positioned in the
  top-right corner of the phone shell (`top-2 right-2 z-20`, below the `z-50`
  exit dialog). A `hasProgressBar` helper is shared by `ProgressBar` and the
  navigation row: states without a progress bar (`APP_MOBILE`, `KIOSK_CHOICE`,
  `KIOSK_LOOKUP`, `KIOSK_BUY`) give the row `pr-16` so `Avsluta` never sits under
  the control. `BuyTickets` is untouched because the shell-level control also
  covers the new-booking screens.
- `src/context/LanguageContext.tsx`: exports the `Language` type, adds
  `common.language` (`Språk` / `Language`) and keeps `document.documentElement.lang`
  in step with the choice, since the layout hardcodes `en`.
- `src/flow/languageToggle.test.mjs` and the `test:language-toggle` script.
- Repository: `DECISIONS.md` gains D0205.

Design iterations with Love on 2026-09-03: the first version was a filled
black/white pill inside the navigation row and the new-booking header. Love's
reaction was "SJUKT fult". It was replaced by a text-only control, and Love then
asked for absolute placement at the very top, super small, to the right of the
progress bar, in the bold italic style used by other headings. The final version
follows that instruction.

Language lives in the provider outside flow state, so switching only re-renders
labels. The Roller drop-in reads its labels through refs and its mount effect does
not depend on language, so switching during payment does not remount the SDK.
No kiosk, extend-page, backend, AWS, payment or booking behavior changed, and no
translation was rewritten beyond the one new label.

## Validation

Local checks on 2026-09-03 (Windows, Node 22.16):

- `npm run test:language-toggle`: 5/5. The test renders the real provider and
  control through `react-dom/server`, with a fake stored preference, and asserts
  the group name, pressed state, own-language names, `lang` attributes, the
  English and unknown stored values, exact `setLang` wiring, the document-language
  sync, the single shell placement and that `BuyTickets` stays untouched.
- Existing phone suites: `test:exit-flow` 5/5, `test:payment-recovery` 95/95,
  `test:paid-confirmation` 9/9, `test:payment-confirmation` 18/18,
  `test:product-visibility` 5/5.
- `npx tsc --noEmit`: pass. `npm run lint`: 0 errors and the four pre-existing
  image-element warnings. `npm run build`: pass. `git diff --check`: pass.

## Manual verification

Performed in the desktop app's Browser pane against `npm run dev` at 375x812 and
320x568, using `?park=1` (Park QR entry). Later steps need a real booking or API
session and were not exercised; the control is shell-level, so its placement is
identical there.

- Start screen (`KIOSK_CHOICE`): control at x 331–367, y 8–32 on 375px; no
  horizontal overflow.
- New booking (`KIOSK_BUY`, time slot step): the last progress icon ends at x 331
  and the control starts at 331, so they are adjacent on 375px. On 320px the
  control (276–312) overlaps the icon's upper-right edge (icon 250–282) by 6px;
  the `Klar` label is unaffected and nothing overflows.
- Lookup (`KIOSK_LOOKUP`): `Tillbaka` at 28–80, `Avsluta` ends at 299, control
  starts at 331, so the row keeps a 32px gap.
- Switching on the start screen to `EN`: heading becomes "What would you like to
  do?", `<html lang>` becomes `en`, `jy.lang` stores `en`, the flow state is
  unchanged. On the lookup screen with `ABC123` typed, switching to `EN` and back
  keeps the state and the entered value while the placeholder, heading and
  `Avsluta` / `Exit` follow the language.
- Keyboard: both options have `tabIndex` 0 and Tab moves focus from `SV` to `EN`
  with a visible focus outline. Enter/Space activation could not be exercised in
  the pane: its injected keys arrive as trusted `keydown` events without `code`,
  which does not trigger native button activation, confirmed against the existing
  `Tillbaka` button. Activation relies on standard `<button>` semantics.

Still needed: Love's review on a physical phone, including Safari's address bar
behavior at the top edge. The pre-existing stored-language hydration mismatch
(the provider reads `localStorage` during the first render) is unchanged and
tracked separately. Publication uses the existing protected release path when
Love decides; this record does not claim any deployment.
