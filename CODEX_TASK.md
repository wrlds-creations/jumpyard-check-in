# CODEX_TASK.md

## Ticket ID
T0079

## Goal
Polish existing-booking add-product UX after the successful payment smoke.

## Dependencies
- T0078 completed and merged.
- Existing-booking add-product quote/draft/payment path works in Playground.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- infra/lambda/booking/index.js
- jumpyard-checkin-phone/src/components/AddonsOffer.tsx
- jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- SMS/email production unlock work
- Data API importer code
- Webhook code
- Redeem code
- Staff/admin app
- CDK infrastructure resources
- Aurora migrations
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables
- Roller/Adyen postal-code configuration

## Requirements

1. Existing-booking add-products should not ask the guest to re-enter contact details when the original booking/contact data can be used server-side.
   - The phone add-product flow should skip the visible contact step for existing bookings.
   - JumpYard Cloud should be able to quote/create the add-product draft without a customer payload by resolving safe original booking contact server-side.
   - If contact cannot be resolved, fail closed with a clear message rather than using fake contact data.

2. Add a short payment-approved confirmation state before the app advances to the original safety/check-in continuation.
   - The guest should briefly see that payment was approved.
   - Do not add a manual extra click unless needed.
   - Keep the app flow fast.

3. Leave postal-code behavior unchanged.
   - Do not attempt to disable or bypass Adyen/Roller postal-code collection in T0079.
   - Track postal-code configuration only as an external follow-up if needed.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the T0079 behavior.
   - Update `REPO_CURRENT_STATE.md` with T0079 status and next ticket numbering.
   - Update `TEST_PLAN.md` with validation scenarios.
   - Add out-of-scope findings to `FOLLOWUPS.md`.

## Non-goals
- Do not change the linked add-on booking architecture.
- Do not modify original Roller bookings directly.
- Do not change staff/admin redeem.
- Do not deploy AWS unless explicitly needed and credentials are available.
- Do not alter Roller/Adyen payment-method or postal-code settings.

## Acceptance criteria
- Existing-booking add-product flow skips guest contact entry when server-side original contact can be used.
- Backend add-product quote/draft accepts omitted customer only when original contact can be resolved safely.
- Approved payment shows a short confirmation before safety/check-in continuation.
- `npm run validate` passes.
- Relevant syntax/build checks pass.
- `git diff --check` passes.

## Manual verification
Run an existing-booking add-product flow and confirm:
- add-on selection goes directly to review/quote, not contact entry
- linked add-on draft still uses separate booking mode
- approved payment briefly confirms success before safety continuation

## Automated validation
Run where local tooling permits:
- node --check infra/lambda/booking/index.js
- npm --prefix jumpyard-checkin-phone run lint
- npm --prefix jumpyard-checkin-phone run build
- npm run validate
- git diff --check
