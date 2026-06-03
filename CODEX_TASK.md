# CODEX_TASK.md

## Ticket ID
T0095

## Goal
Run a structured integrated regression rehearsal for the current public Playground system and document what still needs fixing before broader production-readiness work resumes.

## Dependencies
- T0093 completed and merged.
- T0094 membership/`10-Kort` implementation is parked until JumpYard/Roller confirms intended usage/consumption.
- Public phone app is available at `https://jumpyard-check-in.pages.dev`.
- Public staff/admin app is available at `https://jumpyard-checkin-admin.pages.dev`.
- Roller Playground credentials and AWS dev backend are already configured.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- GIFT_CARD_MULTI_VISIT_DISCOVERY.md only if gift-card or membership/code findings need clarification

## Do not touch
- Phone app UI
- Staff/admin app UI
- Kiosk app
- Lambda implementation
- AWS CDK resources
- Aurora migrations
- Payment package/vendor files
- Assets
- Deliverables
- Roller Live
- Production credentials
- `.env`

## Requirements

1. Run the regression rehearsal against the current public dev/Playground system only.

2. Cover the highest-value flows:
   - Public phone app loads.
   - Buy-entry card-only payment still reaches Roller/Adyen payment.
   - Gift-card field still appears in buy-entry checkout.
   - Invalid gift card remains blocked.
   - Staff/admin public app loads.
   - Staff/admin login and ready queue are still reachable.

3. Prefer non-destructive checks first.
   - Do not intentionally consume staff redeem tickets unless the test needs a full end-to-end check-in proof.
   - If a full write/payment/redeem smoke is needed, document it clearly before running it.

4. Record each result in `TEST_PLAN.md`.

5. Update `REPO_CURRENT_STATE.md` with:
   - T0095 status.
   - What passed.
   - What failed or needs a follow-up.
   - Recommended next ticket.

6. Put any bug or UX findings in `FOLLOWUPS.md` unless the user explicitly asks to fix them inside T0095.

## Non-goals
- Do not implement new features.
- Do not fix UI polish issues.
- Do not add membership/`10-Kort` UI.
- Do not change gift-card behavior.
- Do not deploy AWS changes.
- Do not create production resources.
- Do not change secrets or credentials.

## Acceptance criteria
- T0095 documents whether the current public phone and staff/admin apps are usable for the core rehearsal surface.
- T0095 documents any blocking issue separately from lower-priority polish.
- No app/source behavior changes are made.
- No secrets, raw tokens, full contact data, full gift-card numbers, or private test codes are committed.
- Root validation passes after docs updates.

## Manual verification
Use only the public Playground/dev URLs:

- `https://jumpyard-check-in.pages.dev`
- `https://jumpyard-checkin-admin.pages.dev`

## Automated validation
Run:
- npm run validate
- git diff --check
