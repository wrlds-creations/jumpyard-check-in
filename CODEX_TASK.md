# CODEX_TASK.md

## Ticket ID

T0010

## Goal

Wire the phone check-in booking lookup step to the deployed JumpYard Cloud lookup API.

## Dependencies

- T0009 completed, pushed, and merged to `main`.
- Dev JumpYard Cloud endpoint exists:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Roller Playground seed bookings exist:
  - `5032210`: paid-ready
  - `5032211`: pending payment
  - `5032212`: wrong date
  - `5032213`: SkyRider/add-on
  - `5032214`: original booking for linked add-on flow
  - `5032215`: separate add-on booking

## Current Status

Completed locally on branch `codex/t0010-phone-lookup-wiring`.

Validation result:

- `npm run validate`: passed
- `cd jumpyard-checkin-phone && npm run lint`: passed with four pre-existing `<img>` warnings
- `cd jumpyard-checkin-phone && npm run build`: passed
- CORS preflight to `POST /v1/check-in/lookup`: passed
- Local phone dev server: `http://127.0.0.1:3000` returned HTTP `200`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `.env.example`
- `jumpyard-checkin-phone/README.md`
- `jumpyard-checkin-phone/src/flow/`
- `jumpyard-checkin-phone/src/components/BookingLookup.tsx`
- `jumpyard-checkin-phone/src/components/BookingSummary.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`

## Do Not Touch

- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation
- AWS infrastructure
- Production config
- Production credentials
- `.env`

## Requirements

1. Replace the phone lookup mock call with a JumpYard Cloud client adapter.
2. The phone app must call only JumpYard Cloud, never Roller directly.
3. The lookup client must:
   - POST to `/v1/check-in/lookup`
   - Send the booking identifier and expected operating date
   - Never include Roller credentials or secrets
   - Map the normalized cloud response into the existing phone `Booking` model
4. The phone UI must:
   - Continue to booking summary when eligibility is `ready`
   - Continue to booking summary when eligibility is `payment_required`, with unpaid status and the check-in CTA blocked
   - Show a clear stop state for `wrong_date`
   - Show a clear stop state for `no_redeemable_tickets`
   - Keep the existing not-found behavior for missing bookings
5. Add public, non-secret env documentation for:
   - `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`
   - `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE`
6. Update source-of-truth docs with validation results and the next recommended ticket.

## Non-Goals

- Do not implement payment.
- Do not implement redeem/check-in writes.
- Do not implement booking creation.
- Do not write lookup results to Aurora.
- Do not implement daily seed ingestion.
- Do not implement webhook intake.
- Do not create, update, or delete AWS resources.
- Do not add Roller credentials to the frontend.

## Acceptance Criteria

- Phone lookup for `5032210` reaches booking summary using JumpYard Cloud.
- Phone lookup for `5032211` reaches booking summary, shows `Obetald` with payment icon, and cannot start check-in.
- Phone lookup for `5032212` shows wrong-date stop state when expected date is `2026-05-21`.
- Unknown booking reference shows not-found state.
- No frontend code calls Roller directly.
- No secrets are committed.
- `npm run validate` passes.
- `cd jumpyard-checkin-phone && npm run lint` passes.
- `cd jumpyard-checkin-phone && npm run build` passes.

## Manual Verification

Run the phone app and test booking references:

- `5032210`
- `5032211`
- `5032212`
- `999999999`

Confirm the app remains inside the phone flow and calls JumpYard Cloud only.

## Automated Validation

Run:

- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
