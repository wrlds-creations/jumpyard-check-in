# CODEX_TASK.md

## Ticket ID
T0124

## Goal
Let guests continue checkout after clearing rejected gift-card or Klippkort fields.

## Context
- T0124 is the next Pelle/Anders walkthrough polish ticket after T0123.
- The Pelle/Anders walkthrough is planned for Tuesday 2026-06-16 at 10:00 and should follow the Gustav demo flow.
- Gift-card and Klippkort fields are payment-prep inputs in the buy-entry review step.
- Today, after a rejected presentkort or Klippkort quote, the guest can get stuck unless they enter a valid replacement code.
- Clearing a rejected field should mean normal checkout without that code.
- SkyRider staff handout grouping is intentionally split into T0125.

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
- Kiosk application source
- Staff/admin application source
- JumpYard Cloud backend source
- Staff API contracts
- Payment package/vendor source
- Roller bookings, drafts, payments, or redemptions
- SkyRider staff handout grouping; that is T0125

## Requirements

1. Clearing rejected codes:
   - If a rejected gift-card code is cleared, the guest can continue checkout with no gift card.
   - If a rejected Klippkort code is cleared, the guest can continue checkout with no Klippkort.
   - Empty fields should be treated as absent inputs, not invalid attempted codes.

2. Rejected-code safety:
   - A non-empty rejected gift-card or Klippkort code should still block draft/payment continuation until removed, replaced, or successfully re-applied.
   - Replacing a rejected code with another non-empty code should still require quote refresh before draft/payment.
   - Clearing a previously accepted/applied value should still require quote refresh because the amount due can change.

3. Scope:
   - Keep this frontend-only.
   - Do not change quote, draft, publish, or payment API payload shapes.
   - Do not create Roller bookings, drafts, or payments during implementation.

## Non-Goals
- Do not change SkyRider fulfillment copy or grouping in T0124.
- Do not change backend payment contracts.
- Do not add new payment methods.
- Do not alter Roller payment package internals.

## Acceptance Criteria
- After a rejected gift-card attempt, clearing the gift-card field lets the guest proceed with normal no-code checkout.
- After a rejected Klippkort attempt, clearing the Klippkort field lets the guest proceed with normal no-code checkout.
- A non-empty rejected gift-card or Klippkort code still blocks checkout until removed, replaced, or accepted by a refreshed quote.
- Empty gift-card/Klippkort fields are omitted from quote/draft inputs as before.
- No AWS, Roller, backend, staff/admin, kiosk, redeem, SMS, or email behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser or equivalent smoke confirms rejected gift-card and Klippkort clearing behavior.
