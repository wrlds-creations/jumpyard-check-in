# CODEX_TASK.md

## Ticket ID
T0057

## Goal
Run a focused integrated smoke test across the current JumpYard check-in flow.

## Dependencies
- T0056 completed, deployed to dev, and merged to `main`.
- Known paid Playground booking `5063394` exists from the public T0055/T0056 smoke.
- Dev JumpYard Cloud API is deployed in AWS account `376129878018`, region `eu-north-1`.
- Staff auth exists from T0047.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md only if AWS resource behavior/status is discovered during smoke verification

## Do not touch
- App source code
- UI files
- Payment package vendor files
- Package dependencies
- Aurora migrations or schema
- CDK infrastructure definitions
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Lock ticket numbering.
   - T0057 is now `Integrated smoke test`.
   - T0058 is now `Stack production readiness`.

2. Run an integrated happy-path smoke using dev/Playground only.
   - Confirm lookup for a paid Playground booking through JumpYard Cloud.
   - Confirm the local prepayment draft state is already reconciled to `published`.
   - Start or resume the JumpYard Cloud check-in session.
   - Mark the session ready for staff.
   - Authenticate through staff auth.
   - Confirm staff handoff list/detail can see the ready session.
   - Execute staff-confirmed redeem if the chosen booking/session is still redeemable.
   - Confirm the session leaves the active ready list after successful redeem.

3. Run a minimal browser smoke.
   - Confirm the phone app loads.
   - Confirm the staff/admin app loads enough to show the handoff/login shell.
   - Do not change UI behavior or styling.

4. Keep the smoke safe.
   - Do not print staff passcodes, staff tokens, Roller secrets, access tokens, raw payment JWTs, full phone numbers, or full email addresses.
   - Use only Playground/dev resources.
   - Do not touch Roller Live.

## Non-goals
- Do not build new app behavior.
- Do not fix card/scheme payment configuration.
- Do not create new paid bookings unless the existing smoke booking cannot be used.
- Do not add new AWS resources.
- Do not enable production/staging resources.
- Do not change staff auth implementation.
- Do not change SMS scheduling or sending behavior.

## Acceptance criteria
- Source-of-truth docs show T0057 as integrated smoke test and T0058 as stack production readiness.
- The selected paid booking can be looked up through JumpYard Cloud.
- The selected paid booking can create/resume a check-in session and reach ready-for-staff.
- Staff-auth-protected list/detail can read the ready session.
- Staff-confirmed redeem succeeds or a clear documented blocker explains why redeem was not executed.
- Aurora confirms the final session and ticket state after the smoke.
- `npm run validate` passes.

## Manual verification
- Review the smoke output in `TEST_PLAN.md`.
- Confirm no secret values, raw JWTs, or full PII were recorded.

## Automated validation
Run:
- `npm run validate`
- `git diff --check`
