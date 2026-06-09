# CODEX_TASK.md

## Ticket ID
T0117

## Goal
Improve SkyRider information so guests understand the height requirement, staff safety check, and recommended timing.

## Context
- T0117 is the next confirmed Gustav review ticket after T0116.
- SkyRider consent already happens before quote/draft/payment in both buy-entry and existing-booking add-on flows.
- The existing consent copy only makes the 100 cm requirement clear.
- Guests also need to understand that staff performs a safety check and that SkyRider is best used after trampoline/jump time.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/SkyRiderAttest.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin application source
- Kiosk application source
- Add-on prices, quantity rules, product ids, quote/draft/payment payload shape, or backend contracts
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Guest-facing SkyRider information:
   - Show the 100 cm height requirement.
   - Explain that staff performs a safety check before the ride.
   - Recommend using SkyRider after trampoline/jump time.

2. Flow scope:
   - Keep the existing SkyRider consent-before-payment gate.
   - Keep existing add-on selection, quote, draft, payment, and capacity behavior unchanged.
   - Do not change add-on prices, product ids, quantity rules, backend contracts, AWS, Roller writes, redeem, SMS, or email behavior.

3. Documentation:
   - Update source-of-truth docs and validation notes for T0117.

## Non-Goals
- Do not change add-on quantity rules in T0117; T0116 handled that.
- Do not change gift-card/Klippkort CTA or validation in T0117; T0118/T0119 handle those.
- Do not change staff date or handout behavior in T0117; T0120-T0122 handle those.
- Do not change SkyRider availability/capacity gating.

## Acceptance Criteria
- SkyRider consent screen clearly shows the 100 cm requirement.
- SkyRider consent screen clearly mentions staff safety check before riding.
- SkyRider consent screen recommends SkyRider after jump time.
- Consent and continue behavior still require explicit confirmation before the flow proceeds.
- No price, product id, quantity, payment, backend, AWS, redeem, SMS/email, or Roller write behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser or equivalent smoke confirms the SkyRider consent screen shows the new information and still requires confirmation before continuing.
