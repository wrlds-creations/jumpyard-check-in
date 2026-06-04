# CODEX_TASK.md

## Ticket ID
T0100

## Goal
Deploy and smoke-test the T0099 `Klippkort` checkout implementation in dev/public environments.

## Dependencies
- T0099 completed locally in working tree.
- Roller Playground code-validation model remains `discounts: [{ code }]`.
- AWS dev deploy access and Cloudflare/public app publish access are required for full completion.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- GIFT_CARD_MULTI_VISIT_DISCOVERY.md
- AWS_RESOURCES.md
- infra/lambda/booking/index.js, only if deploy smoke finds a T0099 Klippkort defect
- jumpyard-checkin-phone/src/components/BuyTickets.tsx, only if public smoke finds a T0099 Klippkort defect
- jumpyard-checkin-phone/src/context/LanguageContext.tsx, only if public smoke finds a T0099 Klippkort defect
- jumpyard-checkin-phone/src/flow/cloudClient.ts, only if public smoke finds a T0099 Klippkort defect

## Do not touch
- Staff/admin app UI
- Kiosk app
- Aurora migrations
- AWS CDK resource topology
- Payment package/vendor files
- Assets
- Deliverables
- Roller Live
- Production credentials
- `.env`

## Requirements

1. Deploy the T0099 booking Lambda changes to AWS dev:
   - Confirm AWS account and region before deploy.
   - Run CDK diff and verify only the booking Lambda code changes.
   - Deploy only the approved T0099 backend code.

2. Publish or verify the public phone app bundle includes the T0099 UI:
   - Public buy-entry flow should show optional `Klippkort`.
   - The field must not be named `10-Kort`.
   - The UI must not show remaining visits.

3. Run integrated Playground smokes:
   - Invalid/no-effect `Klippkort` blocks continuation.
   - Valid entry-only `Klippkort` reduces eligible entry amount.
   - Full coverage publishes a no-payment draft and continues into check-in sync.
   - Valid `Klippkort` with entry plus add-ons leaves add-ons payable.
   - Normal no-code and gift-card flows still work.

4. Verify server-side safety:
   - Raw `Klippkort` codes are not logged, persisted, or returned.
   - API responses show only masked/safe metadata.
   - Idempotency uses hashed code values only.

5. Update source-of-truth docs with deploy/smoke results and the next recommended ticket.

## Non-goals
- Do not implement remaining-use display.
- Do not implement local pass counting.
- Do not create or administer Roller memberships, gift cards, or discount codes.
- Do not call Roller Live.
- Do not change AWS resource topology.
- Do not add Aurora migrations.
- Do not change staff redeem behavior.

## Acceptance criteria
- Dev booking Lambda has T0099 `Klippkort` logic deployed.
- Public phone app exposes `Klippkort`.
- Invalid/no-effect code blocks safely.
- Valid entry-only code can complete the no-payment path when fully covered.
- Mixed entry plus add-ons leaves add-ons payable.
- No remaining visits are displayed.
- `npm run validate` passes.

## Manual verification
Run public phone smokes after deploy/publish:

- No gift card or klippkort.
- Invalid klippkort code.
- Valid klippkort code for entry-only basket.
- Valid klippkort code with entry plus add-ons.

## Automated validation
Run:
- npm run validate
- npm --prefix jumpyard-checkin-phone run build
- node --check infra/lambda/booking/index.js
- npm --prefix infra run synth:dev
- git diff --check
