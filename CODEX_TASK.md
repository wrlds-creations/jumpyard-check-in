# CODEX_TASK.md

## Ticket ID
T0028

## Goal
Improve the phone-to-staff handoff by making the guest QR payload usable in the staff/admin app.

## Dependencies
- T0027 completed and merged.
- Phone app already receives a server-owned `handoffCode` and `checkinSessionId`.
- Admin app already lists and opens ready-for-staff sessions.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx`
- `jumpyard-checkin-phone/src/components/QrCode.tsx`
- `jumpyard-checkin-phone/package.json`
- `jumpyard-checkin-phone/package-lock.json`
- `jumpyard-checkin-admin/src/app/page.tsx`

## Do not touch
- AWS infrastructure
- Lambda/API handlers
- Aurora migrations
- Roller API code
- Redeem business logic
- Booking creation/add-product logic
- Payment logic
- Kiosk flow
- Production credentials
- Live Roller config
- Unrelated assets or deliverables

## Requirements

1. Keep the phone final confirmation QR based on the server-owned payload:
   - `JY_HANDOFF:<handoffCode>:<checkinSessionId>`

2. Polish the phone confirmation QR display:
   - Show the scannable QR and short handoff code.
   - Keep the full payload available for test/debug attributes.
   - Use a proven QR generator so external QR scanners can decode the payload.
   - Do not expose Roller secrets or redeem tokens.
   - Do not call Roller or redeem tickets.

3. Add staff/admin handoff lookup improvements:
   - Allow staff to scan the phone QR with the device camera.
   - Allow staff to paste the full QR payload manually.
   - Allow staff to type the short handoff code and select it from the active waiting list.
   - Open the exact server-owned session when the QR payload contains `checkinSessionId`.
   - Stop camera scanning after a successful scan or when the scanner is closed.
   - Show a helpful error when a scanned/pasted value cannot be understood.

4. Update source-of-truth docs with:
   - T0028 status.
   - QR/handoff payload behavior.
   - Validation results.
   - Recommended next ticket.

## Non-goals
- Do not add production staff authentication.
- Do not change the temporary dev redeem code flow.
- Do not create or change AWS resources.
- Do not change Roller webhook registration.
- Do not add a new backend endpoint.
- Do not implement booking creation, add-products, or payment.
- Do not add QR signing or short-lived QR tokens yet.

## Acceptance criteria
- Phone final screen shows a QR derived from the server-owned handoff payload.
- Admin app can open a session by full QR payload.
- Admin app can scan QR codes using the existing browser QR library.
- Admin app can still search by short handoff code or booking reference.
- `npm run validate` passes.
- Phone lint/build pass.
- Admin lint/build pass.
- No AWS, Roller, or redeem handler changes are made.

## Manual verification
1. Complete the phone flow until the confirmation screen shows a handoff code and QR.
2. Confirm the QR card has payload `JY_HANDOFF:<handoffCode>:<checkinSessionId>`.
3. Open the staff/admin app.
4. Paste the full payload into the search field and click `Öppna`.
5. Confirm the matching session detail opens.
6. Click `Skanna QR`.
7. Confirm the scanner opens and can be closed cleanly.
8. If a camera is available, scan the phone QR and confirm the matching session detail opens.

## Automated validation
Run:
- `npm run validate`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
