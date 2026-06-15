# CODEX_TASK.md

## Ticket ID
T0125

## Goal
Correct SkyRider handout grouping so SkyRider is picked up at check-in in both phone and admin surfaces.

## Context
- T0125 was misinterpreted in the previous pass.
- The intended behavior is that SkyRider is handed out at check-in.
- The admin app was already correct before the previous T0125 change: SkyRider belonged under `Lämna ut vid incheckning`.
- The phone/check-in app confirmation screen was the surface that grouped SkyRider as a later/other add-on.
- This correction should restore admin grouping and move SkyRider into the phone confirmation handout list.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-admin/src/app/page.tsx`
- `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Kiosk application source
- JumpYard Cloud backend source
- Staff API contracts
- Payment package/vendor source
- Roller bookings, drafts, payments, or redemptions
- Gift-card or Klippkort checkout behavior

## Requirements

1. Phone/check-in confirmation grouping:
   - SkyRider should appear in the staff handout list shown to guests on the ready-for-staff confirmation screen.
   - SkyRider should not appear under the phone confirmation screen's other/later add-ons group.
   - Keep the existing SkyRider label and icon behavior.

2. Admin grouping:
   - Restore SkyRider to `Lämna ut vid incheckning` in the admin staff handout list.
   - Visitor wristbands, socks, padlocks, and SkyRider should be check-in handouts.
   - Coffee should remain in the later-collection group.

3. Scope:
   - Keep this frontend-only.
   - Do not change staff API payloads, backend grouping/contracts, redeem behavior, payment behavior, Roller writes, AWS resources, SMS, or email behavior.

## Non-Goals
- Do not add new staff fulfillment states.
- Do not change linked add-on visibility or badge behavior in admin.
- Do not change coffee, socks, padlock, visitor wristband, or unknown-item grouping except to restore SkyRider correctly.
- Do not add extra explanatory pickup text for SkyRider.

## Acceptance Criteria
- Phone confirmation screen lists SkyRider in `Att hämta ut hos personalen`.
- Phone confirmation screen no longer lists SkyRider in `Övriga tillägg i bokningen`.
- Admin handoff detail lists SkyRider under `Lämna ut vid incheckning`.
- Admin coffee still appears under `Hämtas efter hoppet`.
- No AWS, Roller, backend, kiosk, redeem, payment, SMS, or email behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- Browser or equivalent smoke confirms phone and admin SkyRider grouping.
