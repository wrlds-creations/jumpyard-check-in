# CODEX_TASK.md

## Ticket ID
T0034

## Goal
Build add-product architecture step 1: server-side quote and separate add-on draft booking linked to an existing booking.

## Dependencies
- T0033 completed and merged.
- Dev JumpYard Cloud API is available.
- Roller Playground credentials are stored server-side in AWS.
- Payment package/drop-in remains externally blocked.
- Existing booking add-products must use the separate linked booking pattern from `D0007`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- AWS_RESOURCES.md
- infra/lambda/booking/index.js
- infra/migrations/

## Do not touch
- Phone UI implementation
- Admin UI implementation
- Kiosk UI implementation
- Redeem business logic
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Package dependencies
- Unrelated assets or deliverables

## Requirements

1. Implement `POST /v1/bookings/{bookingReference}/add-products/quote`.
   - Resolve and validate the original booking server-side.
   - Use Roller Playground only.
   - Quote the requested add-on items as a separate booking/draft cost request.
   - Do not modify the original Roller booking.
   - Do not create a draft booking in quote mode.

2. Implement `POST /v1/bookings/{bookingReference}/add-products`.
   - Require `confirmDraft=true`.
   - Require an idempotency key.
   - Resolve and validate the original booking server-side immediately before the write.
   - Create a separate Roller Playground draft booking for the add-on items.
   - Link the original booking to the add-on draft in JumpYard Cloud.
   - Persist safe pre-payment draft metadata.
   - Never persist raw `paymentJwt`.

3. Add any missing Aurora metadata needed for add-on draft tracking.
   - Keep the existing `jumpyard.booking_links` model as the primary original-to-add-on link.
   - Add only minimal columns needed to distinguish new-booking drafts from add-product drafts.
   - Keep guest contact fields structured and masked/hashed where applicable.

4. Keep payment execution deferred.
   - Do not render payment UI.
   - Do not collect card details.
   - Do not publish the add-on draft booking.
   - Document that payment completion remains blocked until the Roller payment package/drop-in is available.

## Non-goals
- Do not build phone add-product UI.
- Do not implement real or fake card payment.
- Do not publish the add-on draft booking.
- Do not call `PUT /bookings/{uniqueId}` on the original booking.
- Do not change redemption behavior.
- Do not write to Roller Live/production.

## Acceptance criteria
- Add-product quote returns costs without creating a booking.
- Add-product draft creates a separate Roller Playground draft booking.
- Aurora links the original booking to the add-on draft through `jumpyard.booking_links`.
- Aurora records the add-on draft in pre-payment state without raw `paymentJwt`.
- `npm run validate` passes.
- Booking Lambda syntax, infra build, and dev synth pass.
- Dev migration/deploy are applied only to the approved dev stack.

## Manual verification
Run a deployed add-product quote against a known Playground booking and confirm no draft/link row is created.

Run a deployed add-product draft against a known Playground booking and confirm:
- Roller returns a draft unique id.
- `jumpyard.prepayment_booking_drafts` has an add-product draft row.
- `jumpyard.booking_links` links the original booking to the add-on draft.
- Raw `paymentJwt` is not stored in Aurora.

## Automated validation
Run:
- `npm run validate`
- `node --check infra/lambda/booking/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
