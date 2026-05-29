# CODEX_TASK.md

## Ticket ID
T0069

## Goal
Lock the near-term stabilization roadmap before broader staging/live production-readiness work.

## Dependencies
- T0068 completed unified booking-time guest messaging.
- User direction: do not move straight into environment/cutover, runbooks, production auth, WAF, retention, or live backfill until SMS/email and the full dev flow are proven together.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md

## Do not touch
- App source code
- UI files
- Admin app
- Phone app
- Payment code
- SMS/email Lambda code
- Data API importer code
- Webhook code
- Redeem code
- AWS resources
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Lock the stabilization gate.
   - Document that the next tickets must prove the current dev/Playground system end to end before production-readiness implementation starts.
   - The gate must include Data API refresh, webhook update, SMS/email sends, check-in, staff handoff/redeem, and add-product/payment behavior.

2. Reorder the confirmed ticket roadmap.
   - Put integrated dev smoke, Data API/webhook health, and SMS/email sender verification before environment/cutover work.
   - Move environment/cutover, runbooks, dev-token replacement, route auth/WAF, retention/PII, and live backfill/cutover rehearsal after the stabilization tickets.
   - Keep card/scheme payment smoke deferred until Roller/Pabel confirms the missing card payment method.

3. Update follow-ups.
   - Make each open production-readiness follow-up point to the correct later ticket after the roadmap reorder.
   - Keep SMS/email follow-ups before broader production-readiness tickets.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the T0069 roadmap decision.
   - Add a decision in `DECISIONS.md` that stabilization and full-flow proof come before production-readiness implementation.
   - Update `REPO_CURRENT_STATE.md` with T0069 status and the new confirmed next-ticket sequence.
   - Update `TEST_PLAN.md` with docs-only validation for T0069.

## Non-goals
- Do not implement SMS/email code changes.
- Do not enable unattended real sends.
- Do not create staging/live AWS resources.
- Do not change payment behavior.
- Do not change webhook, Data API, redeem, phone, or admin behavior.
- Do not write to Roller Live/production.

## Acceptance criteria
- `REPO_CURRENT_STATE.md` clearly shows T0070-T0074 as stabilization/verification tickets before production-readiness tickets.
- Production-readiness tickets are still preserved and renumbered after the stabilization gate.
- `PROJECT_CONTEXT.md` and `DECISIONS.md` explain why the roadmap is ordered this way.
- `FOLLOWUPS.md` points open production-readiness items at the correct future tickets.
- No app code or AWS resources are changed.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Open `REPO_CURRENT_STATE.md` and confirm a new Codex session sees the next work as stabilization/full-flow proof before broader staging/live readiness.

## Automated validation
Run:
- npm run validate
- git diff --check
