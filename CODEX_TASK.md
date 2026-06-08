# CODEX_TASK.md

## Ticket ID
T0110

## Goal
Polish staff handoff product rows before the Gustav demo.

## Context
- T0107 made paid linked add-on products visible in staff handoff.
- T0108 proved the deployed staff detail can show original entry plus linked add-ons.
- T0110 tightens the staff view so operators see a compact handout list with the right product icons and no noisy explanatory or duplicate product subtitles.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-admin/src/app/page.tsx`
- `jumpyard-checkin-admin/public/jumpyard-next-icons/*.png`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources
- Aurora migrations
- Phone application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Product rows:
   - Remove grey subtitles under each "Att lämna ut" row, such as ticket/price/time or SkyRider child-detail text.
   - Keep the primary product name and quantity visible.
   - Preserve the linked add-on badge for rows that come from linked paid add-on bookings.

2. Product icons:
   - Use product-specific JumpYard icons for common handout rows: entry, SkyRider, socks, padlock, coffee, and family/group where detectable.
   - Keep a safe fallback for unknown products.

3. Redeem panel copy:
   - Remove the explanatory copy saying the final check happens server-side before tickets are redeemed.
   - Do not change the actual staff-confirmed redeem behavior.

4. Documentation:
   - Update source-of-truth docs and the roadmap/current-ticket tables.

## Non-Goals
- Do not change staff API contracts.
- Do not change redeem behavior.
- Do not change backend linked add-on logic.
- Do not add new Roller product mappings beyond UI icon detection.
- Do not deploy AWS resources.

## Acceptance Criteria
- The staff handoff detail list is more compact and no longer shows grey product subtitles.
- SkyRider, socks, padlock, coffee, entry, and family/group rows use the closest available JumpYard icon.
- The staff redeem panel no longer displays the server-side final-check copy.
- Source-of-truth docs record T0110 status.

## Validation
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
