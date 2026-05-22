# CODEX_TASK.md

## Ticket ID
T0035

## Goal
Wire the phone existing-booking add-product step to JumpYard Cloud quote/draft endpoints and stop safely at payment pending.

## Dependencies
- T0034 completed and merged.
- Dev JumpYard Cloud API is available.
- Payment package/drop-in remains externally blocked.
- Existing booking add-products must use the separate linked booking pattern from `D0007` and `D0044`.

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
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts
- jumpyard-checkin-phone/src/flow/types.ts

## Do not touch
- Backend Lambda implementation
- AWS infrastructure
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

1. Update the existing phone add-ons step for existing bookings.
   - Keep the existing check-in flow intact when no new add-ons are selected.
   - Only create an add-product draft when the guest selects new add-ons.
   - Do not mutate the original Roller booking.

2. Call the T0034 JumpYard Cloud endpoints from the phone client.
   - Quote with `POST /v1/bookings/{bookingReference}/add-products/quote`.
   - Create a separate add-on draft with `POST /v1/bookings/{bookingReference}/add-products`.
   - Require customer contact before draft creation because Roller draft booking requires it.
   - Use an idempotency key for draft creation.

3. Stop at payment pending.
   - Show the quoted total before creating the draft.
   - Show a clear payment-pending state after draft creation.
   - Do not collect card details.
   - Do not publish the draft booking.
   - Do not continue the add-on flow as if the add-on is paid.

4. Handle stock-only add-ons correctly.
   - A separate add-on draft may contain only stock/add-on products such as socks or padlock.
   - Do not treat stock-only add-on drafts as redeemable check-in bookings.
   - Products that are not mapped to a safe Playground product id yet must be visibly disabled or blocked.

## Non-goals
- Do not implement real or fake card payment.
- Do not build the Roller payment package/drop-in.
- Do not publish draft bookings.
- Do not create a server-side add-on catalog endpoint.
- Do not change staff/admin redeem behavior.
- Do not change the new-booking buy-entry flow except for shared client types if needed.

## Acceptance criteria
- Existing-booking add-ons can quote through JumpYard Cloud.
- Existing-booking add-ons can create a separate Roller Playground draft through JumpYard Cloud.
- The phone UI stops at payment pending after the add-on draft.
- Socks-only or padlock-only add-on drafts are supported as separate non-redeemable add-on drafts.
- Raw `paymentJwt` is not displayed or stored by the phone UI.
- `npm run validate` passes.
- Phone lint/build pass.

## Manual verification
Open the phone app, search a paid existing booking, start check-in, add socks or another mapped add-on, enter contact details, quote the add-on, reserve the draft, and confirm the UI ends at payment pending.

Confirm in Aurora that the draft is stored as `flow_type='add_product'` and linked to the original booking through `jumpyard.booking_links`.

## Automated validation
Run:
- `npm run validate`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
