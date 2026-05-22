# CODEX_TASK.md

## Ticket ID
T0033

## Goal
Build the phone create-booking pre-payment flow up to a Roller Playground draft booking and payment-pending state.

## Dependencies
- T0032 completed and merged.
- Dev JumpYard Cloud API is available.
- Roller Playground credentials are stored server-side in AWS.
- Roller payment package/drop-in prerequisites are still externally blocked.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- AWS_RESOURCES.md
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/booking/index.js
- infra/migrations/
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/components/BuyTickets.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- Admin UI implementation
- Kiosk UI implementation
- Existing-booking add-product flow
- Redeem business logic
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Package dependencies
- Unrelated assets or deliverables

## Requirements

1. Add a server-side availability endpoint for the phone buy-entry flow.
   - Phone app must call JumpYard Cloud, not Roller directly.
   - JumpYard Cloud should read Roller Playground `GET /product-availability`.
   - The endpoint should return the next selected start times with relevant jump products and remaining capacity.

2. Update the phone buy-entry UI.
   - Select one of the next three half-hour start times.
   - Select an available jump product/duration.
   - Limit quantity by server-returned capacity.
   - Collect first name, last name, email, and phone.
   - Show a server-side quote before creating a draft.
   - Create a guarded Roller Playground draft booking through JumpYard Cloud.
   - End in a clear payment-pending state.

3. Store pre-payment draft state in Aurora.
   - Persist safe draft metadata, selected items, status, total/amount owing, and guest email/phone.
   - Store hash/masked companion fields for email and phone.
   - Never persist raw `paymentJwt`.

4. Keep payment execution deferred.
   - Do not render Roller/Adyen payment UI.
   - Do not collect card details.
   - Do not publish a paid booking.
   - Document that T0034 handles payment package/drop-in after Roller/Pabel provides prerequisites.

## Non-goals
- Do not implement real or fake card payment.
- Do not publish the draft booking.
- Do not start the check-in session for unpaid draft bookings.
- Do not implement add-product linked booking.
- Do not write to Roller Live/production.
- Do not change staff/admin redeem behavior.

## Acceptance criteria
- Phone buy-entry flow can load availability from JumpYard Cloud.
- Phone buy-entry flow can quote a selected product/time/quantity through JumpYard Cloud.
- Phone buy-entry flow can create a Roller Playground draft booking through JumpYard Cloud.
- Aurora records the draft in a pre-payment table without raw `paymentJwt`.
- `npm run validate` passes.
- Phone lint/build passes.
- Booking Lambda syntax, infra build, and dev synth pass.
- Dev migration/deploy are applied only to the approved dev stack.

## Manual verification
Run the phone app, choose buy entry, select a time/product/quantity, enter fake customer contact details, review the quote, create the draft, and confirm the payment-pending state appears.

Confirm in AWS/Aurora that a row exists in `jumpyard.prepayment_booking_drafts` with the new draft id and without raw payment JWT data.

## Automated validation
Run:
- `npm run validate`
- `node --check infra/lambda/booking/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
