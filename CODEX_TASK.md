# CODEX_TASK.md

## Ticket ID
T0125

## Goal
Move SkyRider into the correct staff handout grouping without adding extra explanatory item text.

## Context
- T0125 is the next Pelle/Anders walkthrough polish ticket after T0124.
- The Pelle/Anders walkthrough is planned for Tuesday 2026-06-16 at 10:00 and should follow the Gustav demo flow.
- T0122 grouped staff handout rows into check-in handout, later collection, and other booking items.
- SkyRider is currently grouped with check-in handout items such as visitor wristbands, socks, and padlocks.
- The user clarified that SkyRider does not need row text saying it is picked up from staff; correct grouping is enough.

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
- Kiosk application source
- Phone application source
- JumpYard Cloud backend source
- Staff API contracts
- Payment package/vendor source
- Roller bookings, drafts, payments, or redemptions
- Gift-card or Klippkort checkout behavior; that was T0124

## Requirements

1. SkyRider grouping:
   - SkyRider should no longer appear in the same check-in handout grouping as visitor wristbands, socks, and padlocks.
   - SkyRider should remain visible in the staff handout list.
   - Preserve the existing SkyRider icon and product label behavior.

2. Copy restraint:
   - Do not add item-level text such as `SkyRider hämtas hos personalen`.
   - Existing section labels or notes may remain if they are already part of the grouping UI.

3. Scope:
   - Keep this frontend-only.
   - Do not change staff API payloads, backend grouping/contracts, redeem behavior, payment behavior, Roller writes, AWS resources, SMS, or email behavior.

## Non-Goals
- Do not add new staff fulfillment states.
- Do not change linked add-on visibility or badge behavior.
- Do not change coffee, socks, padlock, visitor wristband, or unknown-item grouping except where the SkyRider move requires section note cleanup.
- Do not add guest-facing SkyRider copy.

## Acceptance Criteria
- SkyRider appears outside `Lämna ut vid incheckning`.
- Visitor wristbands, socks, and padlocks still appear under `Lämna ut vid incheckning`.
- Coffee still appears under `Hämtas efter hoppet`.
- Unknown products still appear under `Övrigt i bokningen`.
- Linked add-on badge remains visible for linked SkyRider rows.
- No AWS, Roller, backend, phone, kiosk, redeem, payment, SMS, or email behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- Browser or equivalent smoke confirms SkyRider grouping and linked add-on badge behavior.
