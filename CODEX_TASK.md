# CODEX_TASK.md

## Ticket ID
T0058

## Goal
Audit the current dev AWS stack and repository posture for production readiness before any staging/live setup.

## Dependencies
- T0057 completed and merged to `main`.
- Current AWS dev stack exists in account `376129878018`, region `eu-north-1`.
- Payment card/scheme work is paused until Pabel/Roller replies.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md

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

1. Audit production-readiness posture for the current dev stack.
   - Environment separation and naming.
   - Secrets and parameter ownership.
   - Data storage, retention, and PII posture.
   - Public API exposure and auth boundaries.
   - Webhook security and retry posture.
   - SMS readiness and sandbox/consent blockers.
   - Observability, alarms, logs, and operational diagnostics.
   - Rollback, migration, and deployment safety.
   - Backfill/sync/cutover requirements.

2. Produce a clear readiness result.
   - Mark each area as ready, partially ready, blocked, or deferred.
   - List concrete blockers before staging/live.
   - List recommended next tickets in a practical order.
   - Keep payment card/scheme as waiting on Pabel/Roller, not active work.

3. Use AWS work rules safely.
   - Read `AWS_RESOURCES.md`.
   - Use `skills/aws-project-infrastructure/`.
   - Do not create, change, deploy, or delete AWS resources.
   - If AWS credentials are available, read only identity/diff/synth state.
   - If AWS credentials are unavailable or expired, document that as a validation gap.

4. Keep output safe.
   - Do not print staff passcodes, staff tokens, Roller secrets, access tokens, raw payment JWTs, full phone numbers, or full email addresses.
   - Use only docs, IaC inspection, and safe validation commands.
   - Do not touch Roller Live.

## Non-goals
- Do not build new app behavior.
- Do not fix card/scheme payment configuration.
- Do not create bookings, drafts, payments, or redemptions.
- Do not add new AWS resources.
- Do not enable production/staging resources.
- Do not change staff auth implementation.
- Do not change SMS scheduling or sending behavior.
- Do not change infra/CDK code.

## Acceptance criteria
- Source-of-truth docs show T0058 as stack production readiness.
- A production-readiness matrix exists in project docs.
- Staging/live blockers are clear and ticketed as followups or next tickets.
- AWS resources are not changed.
- App/source behavior is not changed.
- Payment card/scheme remains parked until Pabel/Roller replies.
- `npm run validate` passes.

## Manual verification
- Review the T0058 readiness matrix and confirm it matches the intended production path.
- Confirm no AWS resource changes were deployed.

## Automated validation
Run:
- `npm run validate`
- `git diff --check`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
