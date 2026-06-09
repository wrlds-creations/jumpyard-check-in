# CODEX_TASK.md

## Ticket ID
T0120

## Goal
Show staff/admin dates in a human-readable Swedish format.

## Context
- T0120 is the next confirmed Gustav review ticket after T0119.
- Staff handoff rows and detail tiles currently use `formatDate()` in `jumpyard-checkin-admin/src/app/page.tsx`.
- `formatDate()` returns the raw date string, and the ready timestamp uses a numeric short date, so staff can see numeric dates that may be misread during handoff.
- The desired staff-facing format is short and human-readable, for example `6 aug`.

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
- Date-box layout fixes; T0121 handles visual box layout
- Handout categorization; T0122 handles handout grouping
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Staff date display:
   - Render staff-facing visit dates as Swedish human-readable labels such as `6 aug`.
   - Apply the same formatting to the staff queue row and the selected handoff detail date tile.
   - Format staff-facing date/time timestamps with the same readable date style, for example `6 aug 10:30`.
   - Preserve `-` for missing dates and preserve the raw value when it cannot be parsed as a date.

2. Flow scope:
   - Do not change staff API contracts, backend date payloads, sorting, filtering, auth, redeem, or handout logic.
   - Do not change the visual layout of the date box in T0120; T0121 handles that separately.

3. Documentation:
   - Update source-of-truth docs and validation notes for T0120.

## Non-Goals
- Do not implement the T0121 staff date-box layout fix.
- Do not implement the T0122 handout-list grouping.
- Do not change phone, kiosk, backend, AWS, Roller, redeem, payment, SMS, or email behavior.

## Acceptance Criteria
- A staff visit date such as `2026-08-06` renders as `6 aug`.
- A staff date/time such as `2026-08-06T08:30:00.000Z` renders with the readable date label, for example `6 aug 10:30`.
- Missing dates still render as `-`.
- Unparseable date values still render as their original value.
- Staff list rows and selected handoff detail use the human-readable date label.
- No staff API, backend, auth, redeem, sorting, filtering, or handout behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- Browser or equivalent smoke confirms a staff queue row and handoff detail show a date such as `6 aug`.
