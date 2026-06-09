# CODEX_TASK.md

## Ticket ID
T0118

## Goal
Replace the unclear gift-card/Klippkort payment-options CTA with specific apply actions.

## Context
- T0118 is the next confirmed Gustav review ticket after T0117.
- Gift card and Klippkort inputs live in the buy-entry review/payment-preparation step.
- Editing either field marks payment inputs dirty and requires a fresh quote before the draft/payment button is enabled.
- The current CTA text `Uppdatera belopp` is too vague for guests.
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
- Gift-card/Klippkort validation rules or max length
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Payment-options CTA:
   - Show `Applicera presentkort` when only a gift card has been entered.
   - Show `Applicera klippkort` when only a Klippkort code has been entered.
   - Keep the action clear when both fields have values or a code is being cleared.

2. Flow scope:
   - Keep the existing quote-refresh behavior after editing payment option fields.
   - Keep the draft/payment button disabled while payment inputs are dirty.
   - Do not change validation, input max length, quote/draft payload shape, backend contracts, AWS, Roller writes, redeem, SMS, or email behavior.

3. Documentation:
   - Update source-of-truth docs and validation notes for T0118.

## Non-Goals
- Do not change gift-card/Klippkort max length, input formatting, or valid/ready state in T0118; T0119 handles that.
- Do not change SkyRider information or quantity rules.
- Do not change staff date or handout behavior; T0120-T0122 handle those.
- Do not change payment package internals.

## Acceptance Criteria
- The old guest-facing CTA text `Uppdatera belopp` is no longer used for the payment-options apply action.
- Gift-card-only edits show `Applicera presentkort`.
- Klippkort-only edits show `Applicera klippkort`.
- The existing quote refresh still runs through the same handler.
- No validation, max length, price, product id, quantity, payment payload, backend, AWS, redeem, SMS/email, or Roller write behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser or equivalent smoke confirms the CTA labels for gift-card-only and Klippkort-only edits.
