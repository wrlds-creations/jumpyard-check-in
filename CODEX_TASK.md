# CODEX_TASK.md

## Ticket ID
T0119

## Goal
Improve gift-card and Klippkort input validation feedback in the buy-entry payment-options section.

## Context
- T0119 is the next confirmed Gustav review ticket after T0118.
- Gift card and Klippkort inputs live in the buy-entry review/payment-preparation step.
- Editing either field marks payment inputs dirty and requires a fresh quote before draft/payment can continue.
- Guests can currently type overly long codes, and the field feedback does not clearly distinguish ready, accepted, or rejected states.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin application source
- Kiosk application source
- Add-on prices, quantity rules, product ids, quote/draft/payment payload shape, or backend contracts
- Gift-card/Klippkort server-side validation rules
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Input length:
   - Add a frontend max length to the gift-card and Klippkort fields.
   - Clamp pasted or programmatic input to the same max length.
   - Do not change the quote/draft payload shape.

2. Input state:
   - Show a neutral helper state before input.
   - Show a clear ready state after a guest enters or edits a code and before it is applied.
   - Show a clear done state after a refreshed quote accepts the entered value.
   - Show a rejected/error state only after a refreshed quote returns gift-card or discount-code errors.

3. Flow scope:
   - Keep the existing quote-refresh behavior after editing payment option fields.
   - Keep the draft/payment button disabled while payment inputs are dirty.
   - Do not change backend validation, Roller writes, quote/draft contracts, prices, product ids, redeem, SMS, or email behavior.

4. Documentation:
   - Update source-of-truth docs and validation notes for T0119.

## Non-Goals
- Do not implement server-side gift-card/Klippkort validation changes.
- Do not change add-on prices, product ids, or quantity rules.
- Do not change staff date or handout behavior; T0120-T0122 handle those.
- Do not change payment package internals.

## Acceptance Criteria
- Gift-card and Klippkort inputs cannot exceed the configured frontend max length.
- Pasted values are clamped to the same max length.
- Entered but unapplied values show a clear ready/apply feedback state.
- Applied quote values show a clear done state when no code errors are returned.
- Rejected quote values show a clear error state without pre-marking untouched fields as invalid.
- Existing quote refresh, dirty-input blocking, and quote/draft payload shape stay unchanged.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser or equivalent smoke confirms max length and ready/done/rejected feedback states.
