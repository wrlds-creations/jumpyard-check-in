# CODEX_TASK.md

## Ticket ID
T0101

## Goal
Add the next operational monitoring and runbook layer for the JumpYard Cloud dev flow before broader readiness work.

## Dependencies
- T0100 completed.
- Existing dev AWS foundation and CloudWatch observability from earlier tickets.
- No production/live cutover yet.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- GUEST_MESSAGING_PRODUCTION_UNLOCK.md
- Existing infra observability/logging files only if needed for monitoring/runbook wiring
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

## Requirements

1. Review the current dev monitoring coverage:
   - Data API sync.
   - Roller webhook processing.
   - Booking quote/draft/payment paths.
   - Gift card and Klippkort/code paths.
   - SMS/email guest messaging.
   - Staff handoff/redeem.

2. Identify practical gaps before larger rollout:
   - Missing alarms.
   - Missing dashboards.
   - Missing runbook steps.
   - Missing owner/action routing.
   - Missing safe API call/error counters.

3. Add only the monitoring/runbook pieces that are low-risk and fit the existing dev AWS pattern.

4. Document operational response:
   - What the signal means.
   - Where to look in AWS.
   - What a safe first action is.
   - When to contact Roller/Josh/Joao/Pabel.

5. Update source-of-truth docs with what changed and what remains for staging/live readiness.

## Non-goals
- Do not move to staging/live.
- Do not request SMS/SES production unlock.
- Do not replace dev staff auth.
- Do not redesign the customer or staff UI.
- Do not add new payment behavior.
- Do not change Roller webhook subscriptions unless explicitly required.

## Acceptance criteria
- Existing dev observability is documented clearly.
- Any added alarms/dashboards/runbooks are listed in AWS_RESOURCES.md.
- Operational gaps remain tracked in FOLLOWUPS.md.
- `npm run validate` passes.
- If AWS changes are made, `npm --prefix infra run synth:dev`, `diff:dev`, and `deploy:dev` are run and documented.

## Manual verification
Open the relevant AWS Console areas and confirm the documented dashboard/alarm/runbook paths make sense for a non-Codex operator.

## Automated validation
Run:
- npm run validate
- npm --prefix infra run synth:dev, if infra changed
- npm --prefix infra run diff:dev, if infra changed
- git diff --check
