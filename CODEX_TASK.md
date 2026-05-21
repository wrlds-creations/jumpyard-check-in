# CODEX_TASK.md

## Ticket ID
T0027

## Goal
Redeem selected tickets from a server-owned check-in session after staff confirmation.

## Dependencies
- T0026 completed and merged.
- Dev staff handoff list/detail endpoints exist.
- Dev controlled Roller redeem token exists in AWS Secrets Manager.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- `infra/lib/jumpyard-cloud-stack.ts`
- `infra/lambda/redeem/index.js`
- `jumpyard-checkin-admin/`

## Do not touch
- Phone check-in flow
- Kiosk flow
- Booking creation/add-product logic
- Payment logic
- Roller webhook registration
- Production credentials
- Live Roller config
- Unrelated assets or deliverables

## Requirements

1. Add staff-confirmed session redeem endpoint:
   - `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`

2. The endpoint must:
   - Resolve the server-owned check-in session from Aurora.
   - Require `status='ready_for_staff'` and `handoff_status='ready_for_staff'`.
   - Require completed safety status for this first staff-confirmed path.
   - Use the session's selected ticket ids.
   - Require idempotency.
   - Require the dev redeem token until a real staff auth model exists.
   - Reuse the T0021 final Roller REST refresh and eligibility re-check before writing.
   - Call Roller `POST /redemptions` only after all checks pass.
   - Update local ticket state, check-in attempt audit, event log, and the session completion state after success.

3. Update the staff/admin app to:
   - Show a staff-confirmed redeem action on the selected handoff detail.
   - Require a manually entered temporary dev confirmation code.
   - Never store the code in source, browser env, localStorage, or sessionStorage.
   - Show success/error state after redeem.
   - Remove completed sessions from the active waiting list.

4. Update source-of-truth docs with:
   - T0027 status.
   - Staff redeem endpoint contract.
   - AWS route/resource notes.
   - Validation results.
   - Recommended next ticket.

## Non-goals
- Do not implement production staff authentication.
- Do not expose redeem tokens to the phone app.
- Do not store the dev redeem token in frontend config or browser storage.
- Do not implement QR scanner polish.
- Do not implement booking creation, add-products, or payment.
- Do not change Roller Live/production.

## Acceptance criteria
- Staff redeem endpoint is deployed to dev.
- Admin app can trigger staff-confirmed redeem for a ready session.
- Endpoint performs final Roller refresh before `POST /redemptions`.
- Successful redeem marks the session `redeemed`/`completed`.
- Successful redeem marks local selected tickets as redeemed.
- `npm run validate` passes.
- Infra checks pass.
- Admin lint/build pass.
- No phone app source files are changed.

## Manual verification
1. Create or use a paid Playground booking.
2. Complete the phone flow until the booking appears in the admin handoff list.
3. Open the staff/admin app.
4. Select the handoff.
5. Enter the temporary dev redeem confirmation code.
6. Click the staff-confirmed redeem action.
7. Confirm the admin UI shows success and the session leaves the waiting list.
8. Confirm Roller Playground shows the item/ticket as redeemed.

## Automated validation
Run:
- `npm run validate`
- `node --check infra/lambda/redeem/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
