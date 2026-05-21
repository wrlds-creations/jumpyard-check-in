# CODEX_TASK.md

## Ticket ID

T0024

## Goal

Wire the phone app start-check-in action to the server-owned JumpYard Cloud session API.

## Dependencies

- T0023 completed, pushed, and merged to `main`.
- Dev API exposes `POST /v1/check-in/sessions`.
- Phone lookup already uses JumpYard Cloud and returns normalized booking summaries.

## Current Status

Completed locally on branch `codex/t0024-phone-start-session-wiring`.

Validation result:

- `npm run validate`: passed.
- `cd jumpyard-checkin-phone && npm run lint`: passed with four pre-existing `<img>` warnings.
- `cd jumpyard-checkin-phone && npm run build`: passed.
- Browser validation: paid booking `5032210` advanced from booking summary to add-ons only after storing session `jycs_mpfe3dum_7dc29b1b`.
- Browser validation: unpaid booking `5032211` stayed on booking summary with disabled `Betalning krävs` CTA and no session id.

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
- `jumpyard-checkin-phone/src/components/BookingSummary.tsx`
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

1. Add a phone-side JumpYard Cloud client function for `POST /v1/check-in/sessions`.
2. Send a stable idempotency key when starting a session.
3. Include booking reference, Roller unique id when available, and expected visit date.
4. Store the returned `checkinSessionId` and session status in phone flow state.
5. On the booking summary CTA:
   - call the session API first
   - show a starting state while the request is running
   - continue the existing guest flow only after session start/resume succeeds
6. Keep unpaid, wrong-date, already-redeemed, not-fresh, and failed session starts blocked in the phone UI.
7. Do not call Roller from the phone app.
8. Do not expose redeem tokens or credentials in frontend code.
9. Do not mark sessions `ready_for_staff` in this ticket.

## Non-Goals

- Do not implement staff/admin handoff views.
- Do not wire final redeem.
- Do not call `ready-for-staff`.
- Do not create or edit bookings.
- Do not implement payment.
- Do not implement add-product.
- Do not create or deploy AWS resources.
- Do not modify assets.

## Acceptance Criteria

- A paid ready booking creates or resumes a JumpYard Cloud session before leaving the booking summary.
- The phone flow stores the session id in client flow state.
- Repeated starts resume the server-owned active session.
- A pending-payment booking remains blocked and cannot start session progress from the phone UI.
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
4. Confirm the flow advances only after a JumpYard Cloud session id is present.
5. Enter unpaid booking `5032211`.
6. Confirm the summary shows unpaid/payment-required and the start CTA stays disabled.

## Automated Validation

Run:

- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
