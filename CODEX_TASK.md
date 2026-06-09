# CODEX_TASK.md

## Ticket ID
T0121

## Goal
Fix the staff/admin date-box layout so the date tile no longer breaks or appears visually damaged.

## Context
- T0121 is the next confirmed Gustav review ticket after T0120.
- T0120 made staff dates human-readable, for example `6 aug`.
- The selected staff handoff detail currently renders the date, time, and payment tiles in three columns at every viewport width.
- On phone-sized staff/admin screens, that cramped metadata row can make the date box look broken.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-admin/src/app/page.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Phone application source
- Kiosk application source
- Staff API contracts or backend source
- Date formatting semantics from T0120
- Handout categorization; T0122 handles handout grouping
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Staff date-box layout:
   - Make the selected handoff detail metadata tiles responsive and stable on narrow staff/admin viewports.
   - Keep the `Datum` tile value visually intact, without awkward word-breaking.
   - Keep the `Tid` tile value visually intact for normal start/end time labels.
   - Preserve the compact three-tile layout on wider staff/admin viewports.

2. Flow scope:
   - Do not change staff API contracts, backend date payloads, sorting, filtering, auth, redeem, or handout logic.
   - Do not change the human-readable date formatting behavior added in T0120.

3. Documentation:
   - Update source-of-truth docs and validation notes for T0121.

## Non-Goals
- Do not implement the T0122 handout-list grouping.
- Do not change phone, kiosk, backend, AWS, Roller, redeem, payment, SMS, or email behavior.
- Do not change staff list sorting/filtering or queue loading behavior.

## Acceptance Criteria
- The selected handoff detail `Datum` tile displays a date such as `6 aug` without broken wrapping or overlap.
- Date/time/payment metadata tiles stack or otherwise fit cleanly on narrow phone-sized staff/admin viewports.
- Wider staff/admin viewports still use the compact three-tile metadata layout.
- Date formatting still follows T0120 behavior.
- No staff API, backend, auth, redeem, sorting, filtering, or handout behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- Browser or equivalent smoke confirms the staff handoff detail date tile fits cleanly on a narrow viewport.
