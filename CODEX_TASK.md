# CODEX_TASK.md

## Ticket ID
T0122

## Goal
Make the staff/admin handout list clearer by separating what is handed out at check-in from what is collected later.

## Context
- T0122 is the next confirmed Gustav review ticket after T0121.
- Staff currently see one flat `Att lämna ut` product list in the selected handoff detail.
- Staff need clearer operational grouping for visitor wristbands, socks, padlocks, SkyRider passes, coffee, and other booking rows.
- The confirmed handout rule is: padlocks, socks, visitor wristbands, and SkyRider passes are handed out at check-in; coffee is collected after jump time.

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
- Date formatting or date-box layout
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Staff handout grouping:
   - Separate selected handoff detail items into operational handout sections.
   - Show a clear section for items handed out at check-in.
   - Show coffee separately as collected after jump time.
   - Keep unknown or unmatched products visible in an `other`/review section instead of hiding them.

2. Category handling:
   - Identify visitor wristbands from entry/ticket/pass/family/group-style products.
   - Identify socks, padlocks, SkyRider passes, and coffee from product names/ids already available in the staff item payload.
   - Preserve linked add-on visibility where relevant.

3. Flow scope:
   - Do not change staff API contracts, backend item payloads, sorting, filtering, auth, redeem, or handout API logic.
   - Do not change phone/kiosk behavior or add new Roller/AWS work.

4. Documentation:
   - Update source-of-truth docs and validation notes for T0122.

## Non-Goals
- Do not change which products are returned by the staff API.
- Do not change Roller redemption eligibility or selected ticket logic.
- Do not deploy AWS changes.
- Do not add new product catalog configuration.

## Acceptance Criteria
- Staff handoff detail shows a distinct `Lämna ut vid incheckning` section.
- Visitor wristbands, socks, padlocks, and SkyRider passes appear under the check-in handout section when present.
- Coffee appears separately as `Hämtas efter hoppet` when present.
- Unknown/unmatched products remain visible under an `Övrigt i bokningen` section.
- Linked add-ons still show the add-on badge where relevant.
- No staff API, backend, auth, redeem, sorting, filtering, payment, AWS, Roller, SMS, or email behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- Browser or equivalent smoke confirms a staff handoff detail separates check-in handouts from coffee/later collection.
