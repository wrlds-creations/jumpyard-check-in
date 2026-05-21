# CODEX_TASK.md

## Ticket ID
T0029

## Goal
Resume an existing phone check-in session instead of restarting the guest flow.

## Dependencies
- T0028 completed and merged.
- Phone app already starts or resumes JumpYard Cloud check-in sessions.
- Phone confirmation screen already renders the server-owned handoff QR.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- `jumpyard-checkin-phone/src/app/page.tsx`
- `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`
- `jumpyard-checkin-phone/src/flow/types.ts`

## Do not touch
- AWS infrastructure
- Lambda/API handlers
- Aurora migrations
- Roller API code
- Redeem business logic
- Booking creation/add-product logic
- Payment logic
- Kiosk app
- Admin app
- Production credentials
- Live Roller config
- Unrelated assets or deliverables

## Requirements

1. When the phone app looks up a paid booking, start/resume the JumpYard Cloud session so active resume states can be detected before the booking summary.

2. When JumpYard Cloud returns `ready_for_staff`:
   - Skip the add-ons/safety flow.
   - Show the final confirmation screen immediately after search.
   - Preserve the server-owned handoff code and QR payload.

3. When the session is already completed/redeemed or JumpYard Cloud reports `already_redeemed`:
   - Do not restart the check-in flow.
   - Show an "already checked in" completion state.
   - Do not show a redeem QR or staff handoff action as if the booking still needs check-in.

4. When the session is still `guest_in_progress`:
   - Continue the normal guest flow from the booking summary.
   - Do not skip required guest-side steps.

5. Keep all Roller and redeem authority server-side:
   - Do not call Roller from the phone app.
   - Do not expose redeem tokens or staff secrets.
   - Do not change backend write behavior.

6. Update source-of-truth docs with:
   - T0029 status.
   - Resume behavior.
   - Validation results.
   - Recommended next ticket.

## Non-goals
- Do not implement SMS token restore.
- Do not implement booking creation.
- Do not implement payment.
- Do not implement staff authentication.
- Do not deploy AWS changes.
- Do not change Roller webhook registration.
- Do not change final redeem behavior.

## Acceptance criteria
- Ready-for-staff resumed sessions open directly from phone lookup on the QR confirmation screen.
- Already-redeemed/completed bookings show an already checked-in state.
- Guest-in-progress sessions still follow the normal flow.
- `npm run validate` passes.
- Phone lint/build pass.
- No AWS, Roller, admin, or redeem handler changes are made.

## Manual verification
1. Find a booking with an active `ready_for_staff` session.
2. Open the phone app and look up that booking.
3. Confirm the phone jumps directly to the QR confirmation screen after search.
4. Find or use a booking whose selected tickets are already redeemed.
5. Open the phone app and look up that booking.
6. Confirm the phone shows the already checked-in state without restarting the flow.
7. Confirm a normal paid booking without a ready handoff still continues through the normal guest flow.

## Automated validation
Run:
- `npm run validate`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
