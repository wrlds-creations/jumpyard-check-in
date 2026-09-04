# Back during the phone add-on payment — #330

## Scope and base

Approved issue: [#330](https://github.com/wrlds-creations/jumpyard-check-in/issues/330), item 3 of the
park-readiness list. Branch `codex/gh-330-addon-payment-back` from `origin/main`
`4d3e68d` (after #367 / PR #371). Love approved implementation in chat on 2026-09-04 ("go")
after a plain-language walkthrough with the park scenario below.

The issue asks for three things while a guest pays for add-ons on the phone:

1. Back must not open a parallel payment attempt.
2. A late result from a closed checkout must not change another purchase.
3. Approved, refused and unknown payments must follow different navigation rules.

## Park scenario

A parent buys socks on the phone inside the park. She taps **Betala**, the park Wi-Fi is slow and
the screen keeps spinning. After ten seconds she taps **Tillbaka**. Nothing must let her pay twice,
nothing from the first attempt may be attributed to a later one, and what Back does must depend on
how the payment ended.

## Walkthrough of the merged code before this change

The checkout wrapper (`RollerPaymentDropIn`) reports a navigation lock for `received` and `approved`
(and for its own `unknown` state) through `onNavigationLockChange`; `AddonsOffer` kept that lock in
a ref and its `returnToSelect` ignored Back while locked or while the payment was unknown. The
page-level Back button, however, only knew the offer's step (`addonsHandlesBack`), so it could not
follow the payment state.

| Payment state | Back before this change | Protection | Gap |
|---|---|---|---|
| Ready, before Betala | Returns to the selection. The checkout cleanup discards the unsubmitted recovery record, the basket (quantities) is kept and the next Continue creates a new draft with a new key. | Existing | None |
| Submitted, waiting for the result | Button visible, tap ignored by the lock. | Existing lock | Inert button, no explanation |
| Unknown, no result | Button visible, tap ignored; only **Kontrollera status** works. | Existing lock and `paymentFailure === 'unknown'` | Inert button |
| Refused | Returns to the selection after the failed attempt is closed (`clearPaymentRecoveryAfterCompletion`); **Prova annan betalmetod** does the same. | Existing | None |
| Approved | Offer step `APPROVED` handed Back to the page, whose state for `APP_ADDONS` is `APP_BOOKING`. The button was active and left the confirmation; a later add-on attempt was blocked by the approved recovery record and showed recovery instead of the shop. | Recovery record | Active button after payment |
| Safety video after payment | `getBackState('APP_SAFETY_VIDEO')` fell back to the pre-payment screen once `paymentTotal` was 0, so a paid new entry and a paid add-on both showed Tillbaka toward the add-on shop, where a second add-on purchase could start. | None | Active button after payment, both flows |

Criterion 2 was already enforced: the wrapper's `current()` requires that the instance is not
cancelled or terminal, still holds ownership and still matches the exact current record (attempt id,
booking identifier and kind); its cleanup sets `cancelled` and releases ownership, so a late SDK
result for a closed instance is ignored. `AddonsOffer` additionally guards approval with
`activePaymentAttemptRef` and `paymentApprovedRef`. The new-entry checkout (`BuyTickets`) already
hid its own Back in the same payment states; the add-on flow did not.

## Change

- `src/flow/addonPaymentNavigation.ts` (new). `getAddonBackRule` maps the offer step, the checkout
  navigation lock and the failure state to one of `page` (selection step: page-level Back applies),
  `select` (before submission, after a confirmed refusal and on the non-payment steps) or `hidden`
  (submitted, unknown or approved). `getFlowBackAction` decides what the shared navigation row
  offers: `addons`, `page` or nothing.
- `src/components/AddonsOffer.tsx`. Mirrors the lock into React state next to the existing ref,
  derives `backRule`, applies the same rule in `returnToSelect` and in the Back-request effect,
  reports it through the new `onBackRuleChange` prop, and resets it on unmount and when a new draft
  starts. Returning to the selection also clears the lock state.
- `src/app/page.tsx`. Holds `addonsBackRule`, replaces `addonsHandlesBack` with
  `getFlowBackAction`, hides the button when the rule is `hidden` and resets the rule when the flow
  leaves `APP_ADDONS`. `getBackState` returns no Back state for the safety video once
  `paymentCompleted` is set, in the new-entry and add-on flows alike; the attest screen keeps its
  return to the video, which never reaches a purchase screen and is the only way to watch it again.
- `src/flow/addonPaymentNavigation.test.mjs` (new), `test:addon-back` in the phone package and
  `validate:gh330-addon-payment-back` in the root `validate` chain.

Unchanged: recovery storage and ownership, `RollerPaymentDropIn`, backend, contract, kiosk,
provider configuration. Browser Back (`popstate`) keeps its existing handling: leaving the document
retains the recovery record, and the repeated-Back limitation accepted in #361 stands. A Roller draft
created before an in-app Back in the ready state remains with Roller until it expires; reusing the
same attempt on retry is #337.

## Validation — 2026-09-04, base `4d3e68d`

- `npm --prefix jumpyard-checkin-phone run test:addon-back`: 11/11 pass. Rule table for every step
  and payment state, page and offer wiring, the actual `getBackState` after a completed payment,
  the retired-instance guard, and add-on recovery cases
  (discarded fresh attempt cannot approve its replacement; submitted or approved attempts block a
  replacement and cannot be downgraded; a refused attempt may be replaced and its late approval is
  ignored). No provider or network call.
- All other phone flow suites plus the payment preview test: 187/187 pass.
- `npx tsc --noEmit`: pass. `npm run lint`: 0 errors, the 4 pre-existing `<img>` warnings.
- `npx next build --webpack`: pass. Webpack is used locally because this worktree shares the
  dependency directory through a junction; release builds are unchanged.
- `git diff --check`, `validate:current-ticket`, `validate:template`, `validate:followups`: pass.
- `node scripts/validate-history-archives.js` keeps the known local Windows CRLF limitation owned by
  the existing Project draft **Make context-size validation consistent for Windows line endings**;
  `PROJECT_CONTEXT.md` is 11,967 LF bytes against the 12,000 limit and was therefore not extended.
  The durable rule is recorded as D0208 in `DECISIONS.md`.
- Not performed: a browser or handset run of a live add-on payment, because reaching the payment
  step creates a Roller draft on Live Nacka. The post-promotion handset check is: Back during a slow
  add-on payment (no button), after approval (no button, only **Fortsätt**), on the safety video after
  a paid entry or paid add-on (no button), before Betala (returns to the shop with the basket kept)
  and after a refusal (**Prova annan betalmetod** and Back both return to the shop).

## Extension approved during implementation

The walkthrough found that after a completed payment the safety-video screen still offered
Tillbaka toward the add-on shop in both flows. Love confirmed in chat on 2026-09-04 that no Back
arrow may exist after a completed payment, for a regular booking as well, and approved handling
it inside #330. A resumed session that reaches the safety step without a payment in this flow
keeps its existing Back to the offer; the exit action was already hidden there by the server
safety state.
