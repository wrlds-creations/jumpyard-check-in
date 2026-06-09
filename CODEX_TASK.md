# CODEX_TASK.md

## Ticket ID
T0114

## Goal
Clean internal Roller product names before they are shown to guests in the phone app.

## Context
- T0113 made add-on prices server-owned through JumpYard Cloud availability data.
- T0114 is the next confirmed Gustav review ticket and handles display labels only.
- Roller product names can be operational/internal, for example `Coffee and tea Sweden`.
- Guest-facing phone surfaces should show clean customer-friendly labels such as `Bryggkaffe`.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin application source
- Kiosk application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Customer-friendly labels:
   - Map internal Roller add-on product names to guest-friendly labels before phone UI display.
   - At minimum, show `Coffee and tea Sweden` as `Bryggkaffe`.
   - Preserve already-friendly entry/session names.

2. Existing-booking surfaces:
   - Existing add-ons shown in booking summary should use the cleaned labels.
   - Confirmation/handout copy that uses booking or add-on labels should inherit the cleaned labels.

3. Scope:
   - Keep the change inside phone-side model/display mapping.
   - Do not change prices, product ids, quote/draft/payment payloads, or backend contracts.

4. Documentation:
   - Update source-of-truth docs and validation notes for T0114.

## Non-Goals
- Do not change back navigation in T0114; T0115 handles it.
- Do not change add-on quantity rules in T0114; T0116 handles it.
- Do not change SkyRider information copy in T0114; T0117 handles it.
- Do not add new guest-facing add-ons.
- Do not change AWS, backend routes, IAM, secrets, migrations, or EventBridge.

## Acceptance Criteria
- Phone booking model conversion cleans internal Roller labels before UI display.
- Existing add-on chips do not show `Coffee and tea Sweden`; they show `Bryggkaffe`.
- Existing booking product labels remain useful for entry/session products.
- No price, payment, add-on quantity, navigation, backend, AWS, redeem, SMS/email, or Roller write behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser smoke with mocked JumpYard Cloud lookup confirms `Coffee and tea Sweden` is displayed as `Bryggkaffe`.
- Search confirms the internal product name is not introduced as visible UI copy.
