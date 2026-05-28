# CODEX_TASK.md

## Ticket ID
T0064

## Goal
Reorder the near-term roadmap so guest SMS and email are finished before broader staging/live readiness work.

## Dependencies
- T0062 documented the route trust boundary.
- T0063 added the email delivery foundation and public guest messaging base URL.
- User explicitly chose to prioritize working SMS and email before the next production-readiness tickets.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md

## Do not touch
- App source code
- UI files
- Lambda code
- CDK code
- Aurora migrations
- Package dependencies
- Roller config
- AWS resources
- Production credentials
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Document that the next implementation work should complete guest messaging first.
   - SMS completion comes before environment/cutover planning.
   - Email completion comes before environment/cutover planning.
   - Unified booking-time guest messaging comes before broader staging/live hardening.

2. Lock the near-term ticket order:
   - T0065 Guest SMS completion.
   - T0066 Guest email completion.
   - T0067 Unified booking-time guest messaging.
   - T0068 Environment and cutover plan.
   - Later production-readiness tickets after messaging is proven.

3. Update follow-ups and project context so this does not get lost.
   - SMS sandbox/sender/consent work should point to T0065.
   - SES sender/domain verification should point to T0066.
   - Combined SMS plus email scheduling should point to T0067.
   - Route auth/WAF and other production-readiness work should remain planned, but not before messaging.

4. Document that this ticket is docs-only.
   - No AWS resources are created or changed.
   - No app behavior changes.
   - No real SMS or email sends.

## Non-goals
- Do not send SMS.
- Do not send email.
- Do not verify SES identities.
- Do not exit SNS sandbox.
- Do not change scheduled sends.
- Do not implement route auth/WAF.
- Do not create staging or production stacks.
- Do not change payment, redeem, webhook, Data API, or UI behavior.

## Acceptance criteria
- Source-of-truth docs list guest SMS/email as the next priority.
- T0065, T0066, and T0067 are clearly defined before environment/cutover work.
- Followups point to the new ticket owners.
- `REPO_CURRENT_STATE.md` recommends T0065 as the next implementation ticket.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Read `REPO_CURRENT_STATE.md`, `PROJECT_CONTEXT.md`, and `FOLLOWUPS.md` and confirm a new Codex session would work on SMS/email before environment/cutover work.

## Automated validation
Run:
- npm run validate
- git diff --check
