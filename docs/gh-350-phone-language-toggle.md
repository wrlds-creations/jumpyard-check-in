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

- `src/components/LanguageToggle.tsx` (new). On start screens: `SV / EN` as a
  `role="group"` named `Språk` / `Language`, where each option is a native
  `<button type="button">` with `aria-pressed`, its own `lang` attribute and its
  own-language accessible name (`Svenska`, `English`), so a code or flag is never
  the only cue. Inside the flow: a compact variant with one muted button showing
  only the language the guest can switch to (`EN` while Swedish is active), named
  `Byt språk till English` / `Switch language to Svenska`. Both variants use bold
  italic uppercase 9px in the heading style, 24px-high buttons for touch and the
  primary-colored `focus-visible` outline.
- `src/app/page.tsx`: renders the control once as the first child of the flow
  root, absolutely positioned in the top-right corner of the phone shell
  (`top-2 right-2 z-20`, below the `z-50` exit dialog), with
  `compact={!isStartState(progressState)}`. A `hasProgressBar` helper is shared
  by `ProgressBar` and the navigation row: states without a progress bar
  (`APP_MOBILE`, `KIOSK_CHOICE`, `KIOSK_LOOKUP`, `KIOSK_BUY`) give the row `pr-10`
  so `Avsluta` never sits under the control. `BuyTickets` is untouched because the
  shell-level control also covers the new-booking screens.
- `src/flow/exitFlowPolicy.ts`: exports `isStartState`, the existing start-state
  set (`IDLE`, `APP_START`, `APP_MOBILE`, `KIOSK_ENTRY`, `KIOSK_CHOICE`) that
  already hides `Avsluta`; the same set decides which screens show both languages.
- `src/context/LanguageContext.tsx`: exports the `Language` type, adds
  `common.language` (`Språk` / `Language`) and `common.switchLanguage`
  (`Byt språk till` / `Switch language to`), and keeps
  `document.documentElement.lang` in step with the choice, since the layout
  hardcodes `en`.
- `src/flow/languageToggle.test.mjs` and the `test:language-toggle` script.
- Repository: `DECISIONS.md` gains D0205.

Design iterations with Love on 2026-09-03: the first version was a filled
black/white pill inside the navigation row and the new-booking header. Love's
reaction was "SJUKT fult". It was replaced by a text-only control, and Love then
asked for absolute placement at the very top, super small, to the right of the
progress bar, in the bold italic style used by other headings. After seeing it in
the mobile view, Love asked that only the start screen ("Vad vill du göra?") show
both languages and that every later screen show just the language to switch to.
The final version follows those instructions.

Language lives in the provider outside flow state, so switching only re-renders
labels. The Roller drop-in reads its labels through refs and its mount effect does
not depend on language, so switching during payment does not remount the SDK.
No kiosk, extend-page, backend, AWS, payment or booking behavior changed, and no
translation was rewritten beyond the one new label.

## Validation

Local checks on 2026-09-03 (Windows, Node 22.16):

- `npm run test:language-toggle`: 6/6. The test renders the real provider and
  control through `react-dom/server`, with a fake stored preference, and asserts
  the group name, pressed state, own-language names, `lang` attributes, the
  English and unknown stored values, the compact variant (only the other language,
  named `Byt språk till English` / `Switch language to Svenska`, no group or
  pressed state), exact `setLang` wiring, the document-language sync, the single
  placement with `compact={!isStartState(progressState)}`, the `isStartState`
  classification and that `BuyTickets` stays untouched.
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

- Start screen (`KIOSK_CHOICE`): full `SV / EN` control at x 331–367, y 8–32 on
  375px; no horizontal overflow.
- Inside the flow the compact control is 15px wide (x 352–367 on 375px). On the
  new-booking time slot step the last progress icon ends at x 331 on 375px and at
  x 282 on 320px, leaving 21px and 15px of clearance (the 320px figure combines
  the measured icon position with the measured control width). Before the compact
  variant, the full control was adjacent to the icon on 375px and overlapped its
  corner by 6px on 320px, which is why start screens are the only place it appears.
- Lookup (`KIOSK_LOOKUP`): `Tillbaka` at 28–80, `Avsluta` / `Exit` ends at 323
  with the row's `pr-10`, compact control starts at 352, a 29px gap.
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
tracked separately.

## Merge and protected rollout — 2026-09-03

Love explicitly asked in chat on 2026-09-03 to merge and deploy this change to
`checkin.jumpyard.se` and the paired origins, including anything already on
`main`. `main` had no commits beyond the branch base and all four required checks
were green, so [PR #365](https://github.com/wrlds-creations/jumpyard-check-in/pull/365)
was squash-merged as `b99a41c192373e9a92491aa7c31fb5afef5939bb`; main CI
[33763734079](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33763734079)
passed.

| Evidence | Exact identity / result |
|---|---|
| Immutable release | [33763734057](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33763734057), successful; SHA `b99a41c192373e9a92491aa7c31fb5afef5939bb` |
| Artifact | `9896775164`; digest `sha256:bb2fa13b56d212dd4e13735b84d81b5f4f68d76b6aec5a796c75d3bf4b84481f`; manifest SHA-256 `89f99eb97d129859576b576faa1fa6ce3a15254a718ea1cb2a8924f34a30c4c2`; 505 files verified |
| Park promotion | [33764307783](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33764307783), successful. Plan: current and release template `70b058da41cfb971574065376c3b7f562a2653907dea7a4ef1e6b81530b9b28c` identical, 202 resources, no additions, removals or changes, `apply_migrations=false`. CDK reported `no changes`; phone, admin and Apple Pay routes returned HTTP 200 with the park-test API target |
| Nacka public promotion | [33764870440](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33764870440), successful, same artifact. Allowed origins `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se` only; guest domain HTTP 200 with the exact API target (10 assets), staff routes HTTP 200 with exact Park API and Cognito targets, Apple Pay association HTTP 200 |
| Rollback candidate | Release `33758112334`, SHA `9600165ec0dbf81907c36da0b5c769cdfbe7a18e`, artifact `9894482103`, digest `sha256:c552ef276028c4b21a28ad2f47ed2d82153da37097156b78fc3f48750d34ff37`, unexpired until 2026-12-02 |

Each plan job log was read through the GitHub jobs API (the CLI log view is empty
while a run waits for approval) and checked against the expected artifact ID,
digest, SHA and target set before the delegated protected `park-test` approval.
Both approval comments record Love's request, the plan facts and the rollback
candidate. Nothing was rebuilt and no environment protection was bypassed. No
migration, AWS resource, secret, provider setting, live payment or guest message
changed; the unchanged admin output was republished by the same workflow.

Independent read-only readback after the public run: `https://checkin.jumpyard.se/`
returned HTTP 200 and one of its ten referenced JavaScript chunks contains the
language control (its `language-option` test ids), which none of the ten chunks
served before the promotion contained; `https://staff-checkin.jumpyard.se/`
returned HTTP 200. This is static readback, not a guest flow test.

The earlier #338 rollout of `9600165` (Park `33759993254`, public `33760491190`,
both successful the same day) is retained inside this release; its own evidence
section in `docs/gh-338-exact-payment-status.md` still reads "Pending". Love's
physical phone review of the language control remains the open user check.
