# CODEX_TASK.md

## Ticket ID
T0115

## Goal
Fix back navigation inside the existing-booking add-on flow.

## Context
- T0115 is the next confirmed Gustav review ticket after T0114.
- The existing-booking add-on flow has internal steps for selecting add-ons, reviewing the add-on quote, preparing payment, and pending payment.
- The visible top back button is currently owned by the parent app state, so it can treat the whole add-on flow as `APP_ADDONS`.
- From add-on review/payment preparation, back should return to the add-on selection step, not to the booking summary.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/app/page.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`

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

1. Existing-booking add-on back target:
   - Back from add-on review should return to add-on selection.
   - Back from add-on payment preparation should return to add-on selection.
   - Back should not land on the booking summary while the guest is still inside add-on review/payment preparation.

2. Parent flow behavior:
   - Back from the add-on selection step itself can keep returning to booking summary.
   - Existing session start, safety, payment, quote/draft, and Roller payment behavior must remain unchanged.

3. Scope:
   - Keep the change inside the phone frontend navigation coordination for the existing-booking add-on flow.
   - Do not change prices, product ids, quote/draft/payment payloads, backend contracts, or payment package internals.

4. Documentation:
   - Update source-of-truth docs and validation notes for T0115.

## Non-Goals
- Do not change add-on quantity rules in T0115; T0116 handles it.
- Do not change SkyRider information copy in T0115; T0117 handles it.
- Do not add new guest-facing add-ons.
- Do not change AWS, backend routes, IAM, secrets, migrations, or EventBridge.

## Acceptance Criteria
- The global visible back affordance returns from add-on review to add-on selection.
- The global visible back affordance returns from add-on payment preparation to add-on selection.
- Back from add-on selection itself still returns to booking summary.
- No price, payment, add-on quantity, backend, AWS, redeem, SMS/email, or Roller write behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser smoke with mocked JumpYard Cloud lookup/availability/quote confirms back from add-on review returns to add-on selection instead of booking summary.
- Code check confirms the parent back button still returns from add-on selection to booking summary.
