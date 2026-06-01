# CODEX_TASK.md

## Ticket ID
T0080

## Goal
Verify that Roller Data API sync, webhook enrichment, Aurora freshness, and lookup behavior are healthy after the payment/add-product smokes.

## Dependencies
- T0079 completed and merged.
- AWS dev access available.
- Roller Playground API access available.

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
- Lambda code
- CDK infrastructure
- Aurora migrations
- Package dependencies
- AWS resources
- Production credentials
- Roller Live
- `.env`
- Assets/deliverables

## Requirements

1. Verify dev AWS identity/account/region.

2. Verify the daily Roller Data API EventBridge rule:
   - It exists.
   - It is enabled.
   - It targets the dev data-sync Lambda.

3. Check latest `jumpyard.booking_seed_runs` status for scheduled/manual Data API sync.

4. Verify recent smoke bookings exist/fresh in Aurora where practical:
   - recent new-booking smoke
   - recent existing-booking smoke
   - recent add-product smoke

5. Verify recent webhook events are processed, or document why no new webhook is expected.

6. Verify lookup for a known recent paid booking returns from JumpYard Cloud/Aurora and not an unsafe state.

7. Document whether any merged backend code still needs dev deployment before full integrated rehearsal.

8. Update source-of-truth docs with results and next ticket.

## Non-goals
- Do not modify runtime behavior.
- Do not deploy AWS changes.
- Do not create or modify AWS resources.
- Do not create Roller bookings unless verification cannot proceed otherwise and the user explicitly approves it.
- Do not send SMS/email.
- Do not redeem tickets.

## Acceptance criteria
- Data API schedule state is documented.
- Latest sync health is documented.
- Aurora freshness/readback is documented.
- Webhook processing health is documented.
- Known lookup behavior is documented.
- No app/backend/AWS runtime files are changed.
- `npm run validate` passes.
- `git diff --check` passes, ignoring existing CRLF-only warnings if present.

## Manual verification
Use AWS Console or AWS CLI read-only checks to confirm:
- EventBridge schedule state.
- Latest Data API run health.
- Aurora records for recent smoke bookings.
- Recent webhook processing status.

## Automated validation
Run:
- npm run validate
- git diff --check
