# CODEX_TASK.md

## Ticket ID
T0052

## Goal
Reuse the T0051 Roller payment execution path for separate linked add-product drafts in the existing-booking phone check-in flow.

## Dependencies
- T0051 completed and merged.
- Roller Playground API credentials are valid locally and in AWS.
- The public test origin `https://jumpyard-check-in.pages.dev` has been requested for Roller allowlisting. Full public browser payment smoke still depends on allowlist confirmation.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/components/AddonsOffer.tsx
- jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- Staff/admin UI
- Kiosk UI
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

1. Preserve the add-product architecture.
   - Existing-booking add-products must still create a separate linked add-on draft booking.
   - Do not mutate the original Roller booking through `PUT /bookings/{uniqueId}`.
   - Do not use a hosted payment-link fallback.

2. Wire add-product drafts into the T0051 payment component.
   - Use the existing `POST /v1/bookings/{bookingReference}/add-products` response.
   - Keep the raw `paymentJwt` response-only and in memory.
   - Render the Roller payment drop-in when JWT and payment config are present.
   - Keep the payment-pending fallback when JWT/config/package setup is unavailable.
   - Do not store, log, print, or render the raw `paymentJwt`.

3. Continue the phone check-in flow after approved add-product payment.
   - A successful add-product payment should continue the original booking's check-in flow.
   - The separate add-on booking should not be treated as the guest's redeemable check-in booking.
   - The legacy local/mock `APP_PAYMENT` screen must not run after the add-product payment is already handled by Roller.

4. Keep scope narrow.
   - Do not implement payment-result polling, payment webhooks, add-on fulfillment reconciliation, or staff add-on pickup changes.
   - Do not change new-booking payment behavior beyond shared type compatibility.

5. Update source-of-truth docs.
   - Record T0052 behavior and the remaining public allowlist/payment smoke blocker.
   - Document that add-product payment uses the same narrow JWT/package exception as T0051.

## Non-goals
- Do not implement production payment rollout.
- Do not add gift card, membership, discount, or multi-visit payment behavior.
- Do not publish draft bookings manually outside Roller Payments.
- Do not create or change AWS resources.
- Do not change SMS, webhook, Data API, staff auth, or redeem behavior.
- Do not change add-on product mappings or add a server-owned catalog endpoint.

## Acceptance criteria
- Add-product drafts carry the response-only `paymentJwt` into the phone payment component in memory.
- Existing-booking add-ons render the Roller payment drop-in when payment setup is available.
- Missing/blocked payment setup still shows the existing safe payment-pending fallback.
- Approved add-product payment continues the original booking check-in path without entering the legacy payment screen.
- Original booking mutation remains out of scope.
- `npm run validate` passes.
- `cd jumpyard-checkin-phone && npm run lint` passes.
- `cd jumpyard-checkin-phone && npm run build` passes.

## Manual verification
- Confirm `https://jumpyard-check-in.pages.dev` is allowlisted before expecting public card payment to complete end-to-end.
- Start with a paid existing booking.
- Add a mapped add-on such as socks or padlock.
- Confirm the add-on quote and separate draft creation still work.
- Confirm payment UI renders when the draft has JWT/config.
- Use the Adyen official test-card docs and the Visa card ending `1142` after allowlist confirmation.
- Confirm approved payment continues into the normal safety/QR check-in flow for the original booking.

## Automated validation
Run:
- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
- `git diff --check`
