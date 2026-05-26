# CODEX_TASK.md

## Ticket ID
T0053

## Goal
Change the phone buy-entry flow so guests build one basket with entry tickets and add-ons before creating one Roller draft booking and paying once.

## Dependencies
- T0051 completed and merged.
- T0052 completed and merged.
- Roller Playground API credentials are valid locally and in AWS.
- Full public browser payment smoke still depends on Roller allowlist confirmation for `https://jumpyard-check-in.pages.dev`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- jumpyard-checkin-phone/src/components/BuyTickets.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- Staff/admin UI
- Kiosk UI
- Existing-booking add-product flow
- Existing booking lookup/check-in/redeem behavior
- AWS resources or CDK config
- Backend/Lambda code
- Aurora migrations
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Payment package vendor files
- Package dependencies
- Unrelated local assets or deliverables

## Requirements

1. Correct the new-booking flow order.
   - The phone buy-entry flow should be: choose time, choose entry product and quantity, choose add-ons, enter contact details, review, create one draft booking, pay once, continue check-in.
   - Do not create or pay the entry booking before the guest can choose add-ons.

2. Build one Roller draft booking basket.
   - Include the selected entry item and selected mapped add-ons in the same `POST /v1/bookings/draft` request.
   - Use the same selected booking date and start time for basket items.
   - Keep final pricing from JumpYard Cloud/Roller quote, not from frontend estimates.

3. Keep payment behavior from T0051.
   - Use the existing Roller payment drop-in after the combined draft is created.
   - Keep raw `paymentJwt` response-only and in memory.
   - Keep the payment-pending fallback when JWT/config/package setup is unavailable.
   - On approved payment, resolve the paid booking through JumpYard Cloud and continue check-in.

4. Keep existing-booking add-products separate.
   - Do not change T0052 behavior for guests who already have a booking.
   - Existing booking plus add-ons still uses separate linked add-product drafts.

5. Update source-of-truth docs.
   - Record that new booking add-ons are part of the same draft/payment basket.
   - Move staff production readiness to the next available ticket number after T0053.

## Non-goals
- Do not implement production payment rollout.
- Do not add gift card, membership, discount, or multi-visit payment behavior.
- Do not add a server-owned add-on catalog endpoint.
- Do not add add-on fulfillment reconciliation or payment-result webhooks.
- Do not create or change AWS resources.
- Do not change SMS, webhook, Data API, staff auth, or redeem behavior.

## Acceptance criteria
- Phone buy-entry flow shows add-ons before contact/review/payment.
- New booking draft contains entry plus selected add-ons in one basket.
- Review step shows basket lines and the server/Roller quoted total.
- Payment happens once for the combined draft.
- Existing-booking add-product flow is unchanged.
- `npm run validate` passes.
- `cd jumpyard-checkin-phone && npm run lint` passes.
- `cd jumpyard-checkin-phone && npm run build` passes.

## Manual verification
- Open the phone app buy-entry flow.
- Choose a time, entry product, quantity, and at least one mapped add-on.
- Confirm the review step shows both entry and add-on lines.
- Confirm the draft/payment step represents one combined basket.
- Confirm public card execution remains blocked until `https://jumpyard-check-in.pages.dev` is allowlisted.

## Automated validation
Run:
- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
- `git diff --check`
