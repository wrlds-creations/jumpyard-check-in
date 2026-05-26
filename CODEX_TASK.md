# CODEX_TASK.md

## Ticket ID
T0051

## Goal
Integrate Roller Payments package execution for new booking drafts in the phone buy-entry flow.

## Dependencies
- T0050 completed and merged.
- Roller Playground API credentials are valid locally and in AWS.
- Pabel confirmed Roller Payments API authorization, `GET /venues/me.paymentSettings`, official package docs, Adyen test-card source, and public-origin allowlisting requirement.
- Public test origin `https://jumpyard-check-in.pages.dev` has been requested for allowlisting. If confirmation is not yet received, implementation must remain safe and report the blocker instead of pretending payment is fully proven.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- jumpyard-checkin-phone/package.json
- jumpyard-checkin-phone/package-lock.json
- jumpyard-checkin-phone/eslint.config.mjs
- jumpyard-checkin-phone/vendor/ecom-payments/**
- jumpyard-checkin-phone/src/app/globals.css
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/components/BuyTickets.tsx
- jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- Staff/admin UI
- Kiosk UI outside the phone buy-entry route
- Add-product payment execution
- Existing booking check-in/redeem behavior
- Aurora migrations
- AWS resources or CDK config
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Vendor the official Roller Payments package.
   - Use the current Roller-approved Version History package `v217`.
   - Keep only the package files needed for `@roller/ecom-payments`; do not commit downloaded archives or temp files.
   - Add dependencies through the phone app package manifest/lockfile.

2. Wire new booking drafts into the payment package.
   - Use the existing `POST /v1/bookings/draft` response.
   - Pass the response-only `paymentJwt` to the Roller payment package.
   - Use `paymentSession.config` from `GET /venues/me.paymentSettings`.
   - Do not store, log, print, or render the raw `paymentJwt`.
   - Keep frontend Roller usage limited to the official payment package/JWT flow, not direct Roller REST credentials or general Roller API calls.

3. Add phone UI payment execution for buy-entry only.
   - After a new booking draft is created, render the Roller/Adyen drop-in when JWT and payment config are present.
   - Keep the existing payment-pending fallback when JWT/config/package setup is unavailable.
   - On approved payment, attempt to resolve the newly paid booking through JumpYard Cloud lookup and continue into the normal check-in path.
   - If lookup lags behind Roller/webhook sync, show a retryable sync message.

4. Keep add-product payment deferred.
   - Do not wire `createAddProductDraft` into the payment drop-in in this ticket.
   - Document T0052 as the follow-up that reuses the proven payment execution path for add-product drafts.

5. Update source-of-truth docs.
   - Record that T0051 installs and wires the approved package but full public browser payment still depends on allowlist confirmation and real card smoke.
   - Update the test plan with package syntax/build validation and manual browser payment test expectations.

## Non-goals
- Do not implement add-product payment execution.
- Do not publish draft bookings manually outside Roller Payments.
- Do not add a hosted payment-link fallback.
- Do not create or change AWS resources.
- Do not change staff auth, SMS, webhook, redeem, or Data API behavior.
- Do not commit test card numbers into source beyond referencing the official Adyen docs source.

## Acceptance criteria
- Phone app includes the Roller-approved `@roller/ecom-payments` package `v217`.
- New booking draft responses keep raw `paymentJwt` response-only and available only to the in-memory payment component.
- Buy-entry flow renders the payment drop-in when payment config and JWT are available.
- Approved payment attempts to resolve the paid booking through JumpYard Cloud and continue into check-in.
- Missing/blocked payment setup shows a safe fallback and does not lose the draft state.
- Add-product payment remains unchanged and deferred to T0052.
- `npm run validate` passes.
- `cd jumpyard-checkin-phone && npm run lint` passes.
- `cd jumpyard-checkin-phone && npm run build` passes or any blocker is documented.

## Manual verification
- Confirm `https://jumpyard-check-in.pages.dev` is allowlisted before expecting the browser payment drop-in to complete end-to-end.
- Create a new booking from the phone buy-entry flow on the public Cloudflare URL.
- Use the Adyen official test-card docs and the Visa card ending `1142`.
- Confirm the payment package renders without exposing Roller credentials or the raw JWT.
- Confirm an approved payment resolves the booking through JumpYard Cloud or shows the retryable sync message while webhook/lookup catches up.

## Automated validation
Run:
- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
- `git diff --check`
