# CODEX_TASK.md

## Ticket ID
T0106

## Goal
Move SkyRider height consent before payment/draft creation in both buy-entry and existing-booking add-on flows.

## Context
- T0105 cleaned up the existing-booking add-on UI.
- SkyRider is capacity-gated and can be selected as an add-on.
- The demo flow should not let a guest pay for SkyRider before confirming the height requirement.
- Current behavior can show the SkyRider consent too late because payment/draft logic is inside the buy-entry and add-on components.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`
- `jumpyard-checkin-phone/src/components/SkyRiderAttest.tsx`
- `jumpyard-checkin-phone/src/flow/machine.ts`
- `jumpyard-checkin-phone/src/flow/types.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin app
- Payment package internals
- Redemption logic
- SMS/email logic
- Dynamic add-on catalog beyond SkyRider consent timing

## Requirements

1. Buy-entry flow:
   - If SkyRider is selected, show the SkyRider height requirement before quote/draft/payment.
   - After confirmation, continue to contact/review/payment.
   - If no SkyRider is selected, keep the existing path unchanged.

2. Existing-booking add-on flow:
   - If SkyRider is newly selected, show the SkyRider height requirement before quote/draft/payment.
   - After confirmation, continue to add-on review and payment.
   - Avoid showing the parent flow SkyRider consent again after payment.

3. Flow safety:
   - Do not create a Roller draft before the SkyRider height requirement is confirmed.
   - Do not change payment, quote, or backend request payloads except for timing of when they are called.

## Non-Goals
- Do not change SkyRider availability gating.
- Do not add new Roller products.
- Do not solve linked add-on products in staff/handoff; that remains T0107.
- Do not run full Gustav demo regression; that remains T0108.

## Acceptance Criteria
- Buy-entry SkyRider path shows the height requirement before contact/review/payment.
- Existing-booking SkyRider add-on path shows the height requirement before add-on review/payment.
- Existing-booking SkyRider add-on path does not show the height requirement again after payment.
- Phone lint/build pass.
- Source-of-truth docs record T0106 status and next ticket.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- Local browser smoke if feasible.
