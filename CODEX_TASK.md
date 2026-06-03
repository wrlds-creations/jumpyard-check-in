# CODEX_TASK.md

## Ticket ID
T0096

## Goal
Run one controlled full integrated write/redeem rehearsal against the current public Playground system.

## Dependencies
- T0095 completed and merged.
- Public phone app is available at `https://jumpyard-check-in.pages.dev`.
- Public staff/admin app is available at `https://jumpyard-checkin-admin.pages.dev`.
- Roller Playground card payment is available through the allowlisted public phone domain.
- Staff/admin dev login is available.
- Roller Playground and AWS dev backend are already configured.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md

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

1. Use the current public dev/Playground system only.

2. Create exactly one dedicated new buy-entry booking through the public phone app:
   - Select a current available time.
   - Select one normal jump-entry product.
   - Do not use gift card or membership/`10-Kort` code in this rehearsal.
   - Use safe test guest data.
   - Submit one Playground card payment if the Roller/Adyen test payment flow is available.

3. Continue the same guest flow after successful payment:
   - Confirm the paid booking continues into safety/check-in.
   - Complete the guest safety step.
   - Confirm the phone flow reaches ready-for-staff with a handoff code/QR.

4. Use the public staff/admin app to finish the same booking:
   - Log in with the dev staff auth flow.
   - Find the handoff in the queue or search.
   - Verify the detail summary is usable.
   - Perform one staff-confirmed redeem only for this dedicated test booking.

5. Verify server-side state after the rehearsal:
   - Booking is visible from JumpYard Cloud lookup/Aurora-backed state.
   - Staff redeem returns success.
   - Admin queue no longer shows the completed handoff.
   - Record the created booking reference, handoff code, and safe result metadata.

6. Stop and document instead of fixing if any blocker appears:
   - Payment package fails to load.
   - Card payment cannot complete.
   - Booking does not sync to Aurora.
   - Phone cannot reach ready-for-staff.
   - Admin cannot redeem.

7. Record all results in `TEST_PLAN.md`.

8. Update `REPO_CURRENT_STATE.md` with:
   - T0096 status.
   - What passed.
   - Any blockers or follow-ups.
   - Recommended next ticket.

9. Put any bug or UX findings in `FOLLOWUPS.md` unless the user explicitly asks to fix them inside T0096.

## Non-goals
- Do not implement new features.
- Do not fix UI polish issues.
- Do not test Roller Live.
- Do not test gift-card payment.
- Do not test membership/`10-Kort` code consumption.
- Do not create AWS resources.
- Do not deploy AWS changes.
- Do not change secrets or credentials.
- Do not run broad load tests.

## Acceptance criteria
- One dedicated public Playground booking has either completed through payment, ready-for-staff, and staff redeem, or the exact blocker is documented.
- Any created booking reference and handoff code are recorded in source-of-truth docs.
- No app/source behavior changes are made.
- No secrets, raw tokens, full contact data, full card data, full gift-card numbers, or private test codes are committed.
- Root validation passes after docs updates.

## Manual verification
Use only the public Playground/dev URLs:

- `https://jumpyard-check-in.pages.dev`
- `https://jumpyard-checkin-admin.pages.dev`

## Automated validation
Run:
- npm run validate
- git diff --check
