# CODEX_TASK.md

## Ticket ID
T0085

## Goal
Polish the staff handoff completion moment so staff get a clear successful check-in confirmation after redeeming tickets, then return to the queue/search screen.

## Dependencies
- T0084 completed and merged.
- Staff auth from T0047 remains required for staff handoff APIs.
- Existing staff redeem behavior from T0027 remains the source of truth for actual ticket redemption.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- jumpyard-checkin-admin/src/app/page.tsx

## Do not touch
- Guest phone flow behavior
- JumpYard Cloud API/Lambda behavior
- AWS/CDK resources
- Aurora migrations
- Roller API write paths
- Payment behavior
- SMS/email behavior
- Package dependencies
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Keep the existing staff redeem action:
   - do not change API calls
   - do not change staff auth
   - do not change redeem request payloads or idempotency behavior
   - do not change Roller write semantics

2. Add a clear post-redeem success confirmation:
   - show a large green success/check visual after a successful staff redeem
   - show enough context for staff to trust the action, such as guest name, handoff code, booking reference, ticket count, and status
   - keep this confirmation visible until staff chooses the next step
   - provide a manual button to return to the queue
   - provide a manual button to scan the next QR code

3. Return staff to the operating surface after completion:
   - clear the selected handoff after successful completion
   - remove the redeemed session from the visible queue
   - clear search text when staff chooses to continue so the remaining queue is visible
   - keep search/QR controls available for the next guest

4. Keep phone-sized staff UX clean:
   - on mobile, the success confirmation should use the focused detail area
   - after staff chooses a next step, the user should land back on search/scan plus queue or open QR scanning
   - avoid adding new scroll-heavy sections

## Non-goals
- Do not redesign the full admin app again.
- Do not change staff auth.
- Do not change backend contracts or API behavior.
- Do not change redeem semantics.
- Do not create new backend state or migrations.
- Do not add staff/admin Cloudflare deployment; that stays in T0087.
- Do not implement real-time guest-name enrichment; that stays in T0088.
- Do not change guest messaging, payment, booking, or phone app flows.

## Acceptance criteria
- Admin app builds.
- Existing staff login, queue, search, QR scanner toggle, selected detail, and staff redeem action remain wired to the same API functions.
- Successful staff redeem shows a large green confirmation.
- The UI stays on the confirmation until staff chooses `Tillbaka till kön` or `Scanna ny QR`.
- No backend, AWS, Roller, payment, SMS, email, package, or asset behavior changes.

## Manual verification
Open the staff/admin app, log in with the staff passcode, select a ready handoff, trigger the existing staff check-in action on a Playground test session, confirm the large green success confirmation appears, then confirm `Tillbaka till kön` returns to search/scan plus queue and `Scanna ny QR` opens the scanner.

## Automated validation
Run:
- npm --prefix jumpyard-checkin-admin run build
- npm run validate
- git diff --check
