# CODEX_TASK.md

## Ticket ID
T0102

## Goal
Add the next notification-routing and channel-specific alerting layer for JumpYard Cloud dev operations.

## Dependencies
- T0101 completed.
- `OPERATIONS_RUNBOOK.md` exists and documents the current dev signals.
- Existing dev CloudWatch dashboard and alarms remain healthy.
- No production/live cutover yet.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- OPERATIONS_RUNBOOK.md
- GUEST_MESSAGING_PRODUCTION_UNLOCK.md
- Existing infra observability/logging files only if needed for alert wiring
- New docs/runbook files only if they fit the repo source-of-truth structure

## Do not touch
- Roller Live
- Production credentials
- `.env`
- App UI
- Assets
- Deliverables
- Aurora schema migrations unless explicitly approved
- AWS production/staging stacks
- Payment package/vendor files
- Staff auth model
- Guest-facing SMS/email copy unless explicitly scoped

## Requirements

1. Review the T0101 runbook and current dev CloudWatch coverage.

2. Decide the lowest-risk next alerting additions for dev:
   - Owner/action routing for existing alarms.
   - Scheduler-specific health signals for Data API sync and due-message planning.
   - SMS/email delivery failure visibility.
   - Webhook enrichment failure visibility.
   - Gift card/Klippkort quote/draft error visibility.

3. Add only dev-safe monitoring changes that fit the current CDK pattern.

4. Do not enable unattended production guest messaging.

5. Update `OPERATIONS_RUNBOOK.md` so each new signal has:
   - Meaning.
   - AWS location.
   - Safe first action.
   - Escalation owner.

6. Update source-of-truth docs with what changed and what remains for staging/live readiness.

## Non-goals
- Do not move to staging/live.
- Do not request SMS/SES production unlock.
- Do not replace staff auth.
- Do not redesign customer or staff UI.
- Do not add payment behavior.
- Do not change Roller webhook subscriptions unless explicitly required.
- Do not create production notification subscriptions without explicit approval.

## Acceptance Criteria
- Existing T0101 runbook stays accurate.
- Any added alarms, dashboards, metric filters, or notification targets are listed in AWS_RESOURCES.md.
- Operational gaps remain tracked in FOLLOWUPS.md.
- `npm run validate` passes.
- If infra changes are made, `npm --prefix infra run synth:dev`, `diff:dev`, and `deploy:dev` are run and documented.

## Manual Verification
Open AWS Console and confirm any new alerting resources are visible, named with `jumpyard-check-in-dev`, and point back to the runbook.

## Automated Validation
Run:
- npm run validate
- npm --prefix infra run synth:dev, if infra changed
- npm --prefix infra run diff:dev, if infra changed
- git diff --check
