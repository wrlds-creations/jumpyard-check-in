# CODEX_TASK.md

## Ticket ID

`T0176`

## Title

Frontend redeem and assisted full-flow rehearsal

## Status

Manual full-flow test window open

## Goal

Let Love run the deployed park-test phone/admin flow end to end before a real assisted visitor uses it. Verify new booking + card payment, post-payment sync, lookup, safety, handoff QR/code, staff/admin session detail, staff redeem action, and post-redeem UI. Also allow a POS-created Nacka booking in the approved test week to be looked up, supplemented with add-ons, paid, and redeemed.

## Scope

- Inspect the existing phone/admin redeem flow and current park-test gate posture.
- Prepare the narrowest safe frontend rehearsal path for T0176.
- Prepare a scoped assisted full-flow rehearsal window after explicit user approval.
- Scope the full-flow window to JumpYard Nacka Forum (`venueId=50871`) and operating dates `2026-06-29` through `2026-07-05`.
- Open only the gates needed for new booking/payment, post-payment sync, assisted lookup, existing-booking add-ons, staff auth, and redeem in that window.
- Keep broad same-day imports, webhook processing, SMS, and JumpYard email off.
- Document the rehearsal outcome, manual test path, risks, and next step.

## Allowed Areas

- `CODEX_TASK.md`
- `REPO_CURRENT_STATE.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `docs/`
- Park-test config/scripts only if a narrow T0176 rehearsal gate is explicitly needed.
- Phone/admin frontend code only if a blocking UI issue is found in the T0176 rehearsal path.
- Infra/Lambda code only if a blocking T0176 bug is found and the fix stays scoped to frontend redeem rehearsal readiness.

## Validation Plan

- Run targeted static checks for any changed frontend/infra files.
- Run `npm run validate`.
- If AWS gate config changes are needed, read `AWS_RESOURCES.md`, use `skills/aws-project-infrastructure/`, synth/deploy only the scoped park-test config, and record readback in `AWS_RESOURCES.md`.
- Record manual deployed frontend rehearsal steps or the exact blocker if no safe Live redeem can be performed in this ticket.

## Result

Implemented and deployed the T0176 staff-auth-only frontend redeem rehearsal gate, then expanded T0176 with an explicitly approved assisted full-flow test window.

- Added `infra/config/park-test-frontend-redeem-rehearsal.json`.
- Added config/CDK/runtime support for `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL` and `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS`.
- Deployed only `SessionHandler` code/environment to park-test; no new AWS resources were created.
- Readback confirmed `SessionHandler` has staff auth and T0176 enabled for `jycs_mqtimdxf_bb33c94c`, while `RedeemHandler` keeps `ENABLE_ROLLER_REDEEM_WRITES=false` and booking, lookup, webhook, guest messaging, and add-on gates remain closed.
- Documented manual admin rehearsal steps in `docs/t0176-frontend-redeem-rehearsal.md`.
- Added `infra/config/park-test-full-flow-rehearsal.json`.
- Added config/CDK/runtime support for `T0176_FULL_FLOW_REHEARSAL_APPROVED`, `ENABLE_T0176_FULL_FLOW_REHEARSAL`, `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES`, and `T0176_FULL_FLOW_VENUE_ID`.
- Deployed the full-flow window to park-test. No new AWS resources were created.
- Readback confirmed:
  - Booking writes on: new booking/payment and existing-booking add-on gates.
  - Lookup on: post-payment sync and assisted Nacka/date-scoped lookup.
  - Redeem writes on: T0176 full-flow scoped by Nacka/date.
  - Staff auth on.
  - Webhook processing, guest messaging, and JumpYard email sends off.
  - `JUMPYARD_EMERGENCY_STOP=true` remains on.
- Staff login with the temporary test passcode authenticated and returned a bearer token without printing it.
- Availability read smoke returned `available`; no booking was created by the smoke.
- Implemented the manual T0176 feedback fix pass after Love tested the full flow:
  - ready-for-entry `Att hämta` uses the add-on bag icon and shows the entry product/duration directly instead of `Armband`;
  - booking summary shows the entry product with quantity;
  - existing-booking add-ons use a clean loading state, no SkyRider-only red highlight, socks prefill to jumper count when missing, and review rows show quantity/unit/line total;
  - assisted lookup stores Roller booking/customer display names and refreshes name-missing local cache entries from Roller so POS-created bookings do not fall back to `Gäst` when Roller provides a name.
- Validation for the fix pass passed: `node --check infra/lambda/lookup/index.js`, phone lint/build, `npm run validate`, and `git diff --check` with existing warnings only.

Manual verification pending: Love should test the park-test phone PWA and admin with real card-payment flows, a POS-created booking lookup/add-on flow, and staff redeem.
