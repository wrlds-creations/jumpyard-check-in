# CODEX_TASK.md

## Ticket ID
T0081

## Goal
Run a focused integrated Playground rehearsal of the core guest/staff flows after T0080 confirmed data freshness.

## Dependencies
- T0080 completed and merged.
- Public Cloudflare check-in app is available.
- Dev JumpYard Cloud API is available.
- Dev staff/admin app can be run locally if needed.
- Roller Playground card payment path is available.
- AWS dev read access is available for verification.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md

Operational verification may use:
- Public check-in app `https://jumpyard-check-in.pages.dev`
- Local admin app if already available or easy to start
- Dev JumpYard Cloud API
- Dev Aurora read-only queries
- Roller Playground writes for scoped smoke bookings/drafts only
- Staff-confirmed redeem for a dedicated smoke booking only

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

1. Rehearse the new-booking purchase/check-in flow:
   - buy entry through the public phone app
   - complete card payment with the approved Playground test card
   - continue into safety/check-in
   - reach ready-for-staff QR/handoff state

2. Rehearse the existing-booking check-in/staff handoff flow:
   - use a known paid existing booking or the booking created in this rehearsal
   - confirm lookup uses JumpYard Cloud
   - confirm ready-for-staff session is visible to staff/admin
   - perform staff-confirmed redeem only on a dedicated smoke booking

3. Rehearse the existing-booking add-product flow:
   - select a mapped add-on for a paid existing booking
   - confirm no duplicate visible contact entry is required
   - quote and pay the linked add-on draft
   - confirm the add-product draft is linked/published in Aurora
   - confirm the original check-in continuation still works

4. Verify data after the rehearsal:
   - Aurora booking/session/draft rows where practical
   - processed webhook events where practical
   - no unsafe Roller Live or production writes

5. Update source-of-truth docs with:
   - smoke booking references and safe identifiers
   - passed/failed scenarios
   - blockers or follow-ups
   - next recommended ticket

## Non-goals
- Do not build new functionality.
- Do not change UI copy/design.
- Do not deploy AWS changes.
- Do not send SMS/email.
- Do not submit AWS support cases.
- Do not change payment-provider configuration.
- Do not test Roller Live.

## Acceptance criteria
- New-booking purchase/check-in is either passed or a clear blocker is documented.
- Existing-booking staff handoff/redeem is either passed or a clear blocker is documented.
- Existing-booking add-product payment/continuation is either passed or a clear blocker is documented.
- Aurora/webhook readback is documented where available.
- No source/runtime files are changed.
- `npm run validate` passes.
- `git diff --check` passes, ignoring existing CRLF-only warnings if present.

## Manual verification
Use the browser and AWS/Aurora read-only checks to confirm the integrated flows.

## Automated validation
Run:
- npm run validate
- git diff --check
