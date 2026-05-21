# CODEX_TASK.md

## Ticket ID

T0025

## Goal

Wire the phone app final guest-side step to the server-owned ready-for-staff handoff endpoint.

## Dependencies

- T0024 completed, pushed, and merged to `main`.
- Dev API exposes `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`.
- Phone flow already starts or resumes a JumpYard Cloud session before leaving booking summary.

## Current Status

Completed locally on branch `codex/t0025-phone-ready-for-staff-handoff`.

Validation result:

- `npm run validate`: passed.
- `npm --prefix jumpyard-checkin-phone run lint`: passed with four pre-existing `<img>` warnings.
- `npm --prefix jumpyard-checkin-phone run build`: passed.
- Browser validation: paid booking `5032210` reached `APP_CONFIRM` with session `jycs_mpfe3dum_7dc29b1b`, handoff status `ready_for_staff`, and handoff code `JY6085`.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/flow/`
- `jumpyard-checkin-phone/src/app/page.tsx`
- `jumpyard-checkin-phone/src/components/SafetyAttest.tsx`
- `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`

## Do Not Touch

- Infra/CDK
- AWS resources
- Backend Lambda code
- Admin UI
- Kiosk UI beyond shared phone flow files
- Assets
- Deliverables
- Booking creation implementation
- Payment implementation
- Add-product implementation
- Roller redeem implementation
- Production config
- Production credentials
- `.env`

## Requirements

1. Add a phone-side JumpYard Cloud client function for `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`.
2. Send a stable idempotency key when marking a session ready for staff.
3. Call the endpoint only after the safety attestation step completes.
4. Store the returned session status, handoff status, safety status, and handoff code in phone flow state.
5. Show a processing state while ready-for-staff is running.
6. Show a retryable error if ready-for-staff fails.
7. Show the server-owned handoff code on the confirmation screen.
8. Keep final Roller redemption out of the phone UI.
9. Do not call Roller from the phone app.
10. Do not expose redeem tokens or credentials in frontend code.

## Non-Goals

- Do not implement staff/admin handoff views.
- Do not wire final redeem.
- Do not call `POST /redemptions`.
- Do not create or edit bookings.
- Do not implement payment.
- Do not implement add-product.
- Do not create or deploy AWS resources.
- Do not modify assets.

## Acceptance Criteria

- A paid ready booking can progress through guest-side steps and mark its JumpYard Cloud session `ready_for_staff`.
- The phone flow stores the returned handoff code and session status.
- The confirmation screen shows the server-owned handoff code.
- Failed ready-for-staff calls keep the guest on the safety attestation step with a visible error.
- Phone app never calls Roller directly.
- Phone app does not contain redeem secrets or Roller credentials.
- `npm run validate` passes.
- `cd jumpyard-checkin-phone && npm run lint` passes with only pre-existing warnings.
- `cd jumpyard-checkin-phone && npm run build` passes.

## Manual Verification

In the phone app:

1. Enter paid booking `5032210`.
2. Confirm the booking summary opens.
3. Press `Ja, starta incheckning`.
4. Continue through add-ons, safety video, and safety attestation.
5. Confirm the flow advances only after ready-for-staff succeeds.
6. Confirm the final screen shows the server-owned handoff code.
7. Confirm the page state includes `data-handoff-status="ready_for_staff"`.

## Automated Validation

Run:

- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
