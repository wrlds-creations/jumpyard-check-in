# CODEX_TASK.md

## Ticket ID
T0077

## Goal
Verify the paid existing-booking happy path through JumpYard Cloud check-in state.

## Dependencies
- T0076 completed and merged.
- Public phone app is available at `https://jumpyard-check-in.pages.dev`.
- A paid Roller Playground booking for today's operating date is available or can be created through the already-proven T0076 buy-entry path.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- Payment/check-in test scripts only if needed for safe diagnostics
- Phone app files only if the smoke exposes a current-flow bug that blocks T0077

## Do not touch
- SMS/email production unlock work
- Data API importer code
- Webhook code
- Redeem code
- Staff/admin app
- CDK infrastructure code
- Aurora migrations
- AWS resources
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Run a public existing-booking smoke from `https://jumpyard-check-in.pages.dev`.
   - Use the existing-booking lookup path, not the buy-entry path as the primary verification.
   - Enter a paid booking reference for today's operating date.
   - Confirm the booking is found through JumpYard Cloud.
   - Confirm the app does not require another payment for the already-paid booking.

2. Verify check-in continuation.
   - Start or resume the server-owned check-in session.
   - Complete enough of the safety flow to reach the QR/handoff state, unless the booking is already ready-for-staff and should resume there directly.
   - Confirm the guest does not repeat completed safety steps when a ready-for-staff session already exists.

3. Verify server-side behavior where practical.
   - Record safe booking/session/handoff identifiers only.
   - Confirm JumpYard Cloud owns the session and handoff continuation state.
   - Do not print or persist access tokens, Roller secrets, raw payment JWTs, full phone numbers, full emails, or card data.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the T0077 outcome.
   - Update `REPO_CURRENT_STATE.md` with T0077 status, validation, and next ticket.
   - Update `TEST_PLAN.md` with existing-booking happy-path validation results.
   - Add any blockers or out-of-scope findings to `FOLLOWUPS.md`.

## Non-goals
- Do not redeem tickets in T0077.
- Do not test staff/admin handoff completion.
- Do not implement add-product payment.
- Do not build new UI unless the current existing-booking path is blocked.
- Do not test Roller Live/production.
- Do not enable unattended SMS or email sends.
- Do not create, change, deploy, or delete AWS resources.

## Acceptance criteria
- T0077 is documented as the active ticket.
- The existing-booking lookup path is tested with a paid booking.
- The result is documented as passed, blocked, or needing a focused fix.
- Safe booking/session/handoff identifiers are recorded where available.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Open `https://jumpyard-check-in.pages.dev`, choose the existing-booking path, enter a paid booking reference for today's operating date, and confirm the guest can reach or resume the safety/QR continuation without paying again.

## Automated validation
Run where local tooling permits:
- npm run validate
- git diff --check
