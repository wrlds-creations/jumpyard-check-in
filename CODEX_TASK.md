# CODEX_TASK.md

## Ticket ID
T0109

## Goal
Verify and harden SkyRider consent timing before payment.

## Context
- T0106 moved SkyRider height consent before payment in the visible phone UI.
- The follow-up from demo rehearsal is to make that rule fail-closed, so neither new buy-entry nor existing-booking add-on payment can be quoted/drafted if SkyRider was selected without the 100 cm approval.
- T0110 is intentionally separate and handles staff/admin handoff row polish.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources
- Aurora migrations
- Admin application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. New buy-entry flow:
   - Selecting SkyRider must show the 100 cm approval immediately after the add-ons step.
   - Quote/draft/payment side effects must be blocked if SkyRider is selected and the approval is not present.

2. Existing-booking add-on flow:
   - Adding SkyRider must show the 100 cm approval immediately after the add-ons step.
   - Add-product quote/draft/payment side effects must be blocked if SkyRider is newly selected and the approval is not present.

3. Documentation:
   - Update source-of-truth docs and the lower roadmap/current-ticket tables.
   - Keep T0110 as the next confirmed ticket.

## Non-Goals
- Do not change Roller product ids or availability mapping.
- Do not change backend quote/draft endpoints.
- Do not deploy AWS resources.
- Do not change admin handoff UI in this ticket.

## Acceptance Criteria
- SkyRider approval is required before quote/draft/payment for new buy-entry.
- SkyRider approval is required before quote/draft/payment for existing-booking add-ons.
- Source-of-truth docs record T0109 status and T0110 as next confirmed step.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
