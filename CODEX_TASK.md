# CODEX_TASK.md

## Ticket ID
T0107

## Goal
Show paid linked add-on booking products in staff/handoff fulfillment.

## Context
- Existing-booking add-ons are created as separate linked Roller draft bookings.
- After payment, staff currently sees the original booking items but can miss paid linked add-ons such as socks, padlock, coffee, or SkyRider.
- The demo handoff needs one staff summary that shows everything the guest should receive.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `infra/lambda/session/index.js`
- `jumpyard-checkin-admin/src/lib/adminApi.ts`
- `jumpyard-checkin-admin/src/app/page.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Phone buy-entry flow
- Payment package internals
- Redemption logic
- SMS/email logic
- Dynamic add-on catalog

## Requirements

1. Staff session detail:
   - Include original booking items.
   - Include paid/published linked add-on booking items for the same original booking.
   - Do not include unpaid or payment-pending linked add-on items.

2. Staff UI:
   - Show linked add-on rows in the same handoff product list.
   - Mark linked add-on rows clearly as `Tillägg`.
   - Keep redeem behavior unchanged.

3. Documentation:
   - Update source-of-truth docs and the lower roadmap/current-ticket tables.
   - Keep T0108 as the next confirmed demo-regression ticket.

## Non-Goals
- Do not change how add-on bookings are created or paid.
- Do not change Roller redemption eligibility.
- Do not deploy AWS in this ticket.
- Do not run the full Gustav demo regression; that remains T0108.

## Acceptance Criteria
- Staff detail returns original plus paid linked add-on product rows.
- Staff UI visibly labels linked rows as add-ons.
- Admin lint/build and session Lambda syntax checks pass.
- Source-of-truth docs record T0107 status and next ticket.

## Validation
- `node --check infra/lambda/session/index.js`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
