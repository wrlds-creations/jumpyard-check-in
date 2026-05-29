# CODEX_TASK.md

## Ticket ID
T0070

## Goal
Run an integrated dev/Playground smoke test that proves the main existing-booking check-in path works together end to end.

## Dependencies
- T0069 locked the stabilization roadmap.
- Dev AWS stack exists and targets Roller Playground.
- Staff auth and staff-confirmed redeem are already implemented.
- Playground writes are allowed only for scoped dev smoke data.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md

## Do not touch
- App source code
- UI files
- Payment implementation
- SMS/email Lambda code
- Data API importer code
- Webhook code
- Redeem code
- CDK infrastructure code
- Aurora migrations
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Use a safe dev/Playground smoke booking.
   - Use Roller Playground only.
   - Prefer a fresh paid booking for today's date.
   - Do not print secrets, raw tokens, full phone numbers, or full email addresses.

2. Verify core check-in path through JumpYard Cloud.
   - Lookup the booking through `POST /v1/check-in/lookup`.
   - Start or resume a check-in session through `POST /v1/check-in/sessions`.
   - Mark the session ready for staff through `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`.
   - Authenticate as staff through `POST /v1/staff/auth/login`.
   - Read staff session detail.
   - Staff-confirm redeem the session through `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`.

3. Verify final state.
   - Confirm Aurora session status is `redeemed` or equivalent completed state.
   - Confirm selected redeemable tickets are marked redeemed locally.
   - Confirm Roller reports the redeemed ticket status after the final refresh/redeem path.

4. Keep this ticket as verification only.
   - Do not change Lambda/app/CDK behavior.
   - If a failure is found, document it in `FOLLOWUPS.md` unless the user explicitly scopes a fix.

5. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the smoke result.
   - Update `REPO_CURRENT_STATE.md` with T0070 status and next recommended ticket.
   - Update `TEST_PLAN.md` with the exact safe test result.
   - Update `AWS_RESOURCES.md` only if the smoke reveals meaningful AWS operational state.

## Non-goals
- Do not enable unattended SMS/email sends.
- Do not test card/scheme payments.
- Do not create staging/live resources.
- Do not change production-readiness architecture.
- Do not write to Roller Live/production.
- Do not implement fixes discovered during the smoke.

## Acceptance criteria
- A fresh dev/Playground booking can be looked up through JumpYard Cloud.
- A JumpYard Cloud check-in session can be started/resumed and marked ready for staff.
- Staff auth works.
- Staff-confirmed redeem succeeds for selected redeemable tickets.
- Aurora reflects the completed session and redeemed ticket state.
- Any failure is documented with a follow-up id.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Review the T0070 rows in `TEST_PLAN.md` and confirm the smoke proves the end-to-end path without relying on chat history.

## Automated validation
Run:
- npm run validate
- git diff --check
