# CODEX_TASK.md

## Ticket ID
T0084

## Goal
Rebuild the staff handoff app into one operational queue/detail page that works well on phones and keeps staff focused on finding a booking, reviewing what to hand out, and triggering the existing staff check-in action.

## Dependencies
- T0083 completed and merged.
- Staff auth from T0047 remains required for all staff handoff APIs.
- Staff identity/search data from T0083 is available in the admin API response.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- jumpyard-checkin-admin/src/app/page.tsx
- jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx

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

1. Keep the staff app as one operational page after login:
   - search input and QR scanner controls remain immediately available
   - the waiting queue remains visible on the same page
   - selecting a row, searching, or scanning opens the handoff summary without browser navigation

2. Improve phone-sized staff UX:
   - show search/scan first
   - when no handoff is selected, show the queue below search/scan
   - when a handoff is selected, switch to a focused compact summary view
   - include a close/back control so staff can return to search/scan and queue without redeeming

3. Improve queue readability:
   - prioritize guest name when available
   - keep handoff code and booking reference visible
   - keep date, time, and selected ticket count easy to scan

4. Improve detail/summary readability:
   - prioritize guest, handoff code, booking reference, date/time, and payment state
   - do not show masked contact details in the compact summary
   - do not show safety status as a separate summary tile
   - show products/items as the compact "att lämna ut" list
   - do not show a separate ticket list unless it becomes operationally needed again
   - keep the existing staff redeem/check-in button behavior

5. Keep scope narrow:
   - do not change backend contracts or API behavior
   - do not add the large green post-redeem success screen; that stays in T0085
   - do not deploy the staff/admin app to Cloudflare; that stays in T0087

6. User-approved pulled-forward T0086 fix:
   - remove the duplicate guest-facing backup-code box from the ready-for-staff confirmation screen
   - keep the QR code and main staff/pickup code visible

## Non-goals
- Do not change staff auth.
- Do not change redeem semantics.
- Do not change QR payload semantics.
- Do not add new backend search fields.
- Do not implement real-time guest-name enrichment; that stays in T0088.

## Acceptance criteria
- Admin app still builds.
- Staff login, queue, search, QR scanner toggle, selected detail, product/ticket summary, and existing staff redeem action remain wired to the same API functions.
- On mobile layout, search/scan appears before selected detail and queue.
- Guest ready-for-staff screen no longer shows a separate backup-code box.
- No app backend, AWS, Roller, payment, SMS, or email behavior changes.

## Manual verification
Open the staff/admin app, log in with the staff passcode, confirm the queue loads, search or select a ready handoff, and confirm the selected compact summary appears on the same page with products, tickets, and the check-in button.

## Automated validation
Run:
- npm --prefix jumpyard-checkin-admin run build
- npm --prefix jumpyard-checkin-phone run build
- npm run validate
- git diff --check
