# CODEX_TASK.md

## Ticket ID
T0031

## Goal
Implement server-side JumpYard Cloud quote and draft booking endpoints for new bookings against Roller Playground.

## Dependencies
- T0030 completed and merged.
- Dev AWS foundation is deployed.
- Roller Playground credentials exist in AWS Secrets Manager.
- Roller environment/base URL are configured in AWS SSM as Playground.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/booking/**

## Do not touch
- Phone UI implementation
- Admin UI implementation
- Kiosk UI implementation
- Aurora migrations
- Redeem business logic
- Staff auth
- Production credentials
- Live Roller config
- `.env`
- Package dependencies
- Unrelated assets or deliverables

## Requirements

1. Replace the booking placeholder Lambda with a real booking handler for:
   - `POST /v1/bookings/quote`
   - `POST /v1/bookings/draft`

2. The quote endpoint must:
   - Read Roller config and credentials server-side.
   - Reuse the Playground fail-closed guard.
   - Validate product/date/time/quantity input.
   - Call Roller Playground `POST /bookings/draft/costs`.
   - Return normalized cost fields only.
   - Not create a booking.

3. The draft endpoint must:
   - Read Roller config and credentials server-side.
   - Reuse the Playground fail-closed guard.
   - Validate customer and item input.
   - Require an idempotency key.
   - Require explicit `confirmDraft=true`.
   - Call Roller Playground `POST /bookings/draft`.
   - Return the draft unique id, costs, payment config, and the returned `paymentJwt` for the future frontend payment component.
   - Not log or persist the raw `paymentJwt`.

4. Payment config handling must:
   - Read safe venue payment settings from `GET /venues/me`.
   - Return `integrationId`, `configurationId`, and `apiUrl` when available.
   - Never return Roller OAuth tokens or client credentials.

5. Idempotency and audit must:
   - Use existing `jumpyard.idempotency_records` for draft writes.
   - Write safe `jumpyard.event_log` rows for quote/draft attempts.
   - Store only safe identifiers and summaries, never raw payment JWTs.

6. Deployment:
   - Synthesize and diff the dev stack.
   - Deploy only the approved booking Lambda code change if diff is scoped.
   - Smoke test deployed quote and draft endpoints against Playground.
   - Update `AWS_RESOURCES.md`.

7. Documentation:
   - Update source-of-truth docs with T0031 status.
   - Lock next ticket as `T0032 Payment package proof-of-concept`.
   - Shift phone UI create-booking/payment wiring to the following ticket.

## Non-goals
- Do not build phone booking UI.
- Do not render Roller/Adyen payment component.
- Do not process fake/test payment.
- Do not publish a paid booking after payment.
- Do not implement add-product linked booking.
- Do not redeem tickets.
- Do not add staff auth.
- Do not create Aurora tables.
- Do not write to Roller Live/production.

## Acceptance criteria
- `POST /v1/bookings/quote` works against Roller Playground and returns normalized costs.
- `POST /v1/bookings/draft` works against Roller Playground and returns draft/payment-session data.
- Draft writes are idempotency-keyed and require explicit confirmation.
- No secrets, access tokens, or raw payment JWTs are printed or persisted.
- Dev deploy succeeds with scoped booking Lambda changes only.
- `npm run validate` passes.
- Infra build/synth pass.

## Manual verification
Call the deployed dev endpoints with a known Playground product variation such as `1765836`, date, time, fake customer data for draft, and a unique idempotency key.

Confirm:
1. Quote returns costs but no booking id.
2. Draft returns a draft unique id and payment JWT presence.
3. Roller Live is not called.
4. No app UI changed.

## Automated validation
Run:
- `npm run validate`
- `node --check infra/lambda/booking/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
