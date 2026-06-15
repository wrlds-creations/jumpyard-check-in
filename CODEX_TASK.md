# CODEX_TASK.md

## Ticket ID
T0123

## Goal
Polish the phone payment step copy and back navigation before the Pelle/Anders walkthrough.

## Context
- T0123 is the first confirmed polish ticket after T0122.
- The Pelle/Anders walkthrough is planned for Tuesday 2026-06-16 at 10:00 and should follow the Gustav demo flow.
- In the buy-entry checkout, the Roller payment method page currently shows `Kortbetalning` even though the guest may choose card, Swish, Klarna, Apple Pay, or another payment method.
- When the guest uses the back control from the payment method/drop-in step, the flow currently returns too far back and loses the selected basket/contact/payment-prep state.
- Gift-card and Klippkort cleanup is intentionally split into T0124.
- SkyRider staff handout grouping is intentionally split into T0125.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`
- `jumpyard-checkin-phone/src/flow/machine.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Kiosk application source
- Staff/admin application source
- JumpYard Cloud backend source
- Staff API contracts
- Payment package/vendor source
- Roller bookings, drafts, payments, or redemptions
- Gift-card/Klippkort invalid-clearing behavior; that is T0124
- SkyRider staff handout grouping; that is T0125

## Requirements

1. Payment heading:
   - Change the visible payment step heading from `Kortbetalning` to `Betalning`.
   - Keep the payment page generic because the available methods can include card, Swish, Klarna, Apple Pay, Google Pay, or other Roller/Adyen methods.
   - Do not change payment method availability or payment package behavior.

2. Back navigation:
   - When the guest is on the payment method/drop-in step and presses the visible back control, return to the buy-entry review/summary/payment-prep step.
   - Preserve selected date/time, entry quantity, add-ons, contact fields, quote, gift-card/Klippkort input state, and payment-prep summary where possible.
   - Do not return to the first availability/date step unless the guest explicitly backs through the normal earlier steps.

3. Scope:
   - Keep this frontend-only.
   - Do not change quote, draft, publish, or payment API payloads.
   - Do not create Roller bookings or payments during implementation except if a later validation step explicitly uses normal public Playground checkout.

## Non-Goals
- Do not fix rejected gift-card/Klippkort clearing in T0123.
- Do not change SkyRider fulfillment copy or grouping in T0123.
- Do not change backend payment contracts.
- Do not add new payment methods.
- Do not alter Roller payment package internals.

## Acceptance Criteria
- Payment method/drop-in page heading reads `Betalning`, not `Kortbetalning`.
- Back from the payment method/drop-in page returns to the review/summary/payment-prep step.
- The guest's selected basket and contact/payment-prep state are still present after going back.
- Guest can proceed forward to payment again from the review/summary/payment-prep step.
- No AWS, Roller, backend, staff/admin, kiosk, redeem, SMS, or email behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser or equivalent smoke confirms the heading and back navigation behavior in the buy-entry payment flow.
