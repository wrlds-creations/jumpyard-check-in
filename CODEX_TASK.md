# CODEX_TASK.md

## Ticket ID

T0020

## Goal

Add the first safe server-owned redeem endpoint shape for the phone check-in flow without enabling public Roller redemption writes.

## Dependencies

- T0019 completed, pushed, and merged to `main`.
- Dev API already exposes placeholder route `POST /v1/check-in/redeem`.
- Dev Aurora contains fresh lookup/webhook booking snapshots and ticket ids.
- Roller `POST /redemptions` request shape is confirmed:
  - body has `tickets[]`
  - each ticket has required `ticketId`
  - optional `redemptionDate`
  - optional `redemptionDevice`
  - max 10 ticket redemptions per call
  - ticket ids must be unique per call

## Current Status

Completed locally and deployed to dev on branch `codex/t0020-redeem-spike`.

Validation result:

- `npm run validate`: passed.
- `node --check infra/lambda/redeem/index.js`: passed.
- local request-shape smoke tests: passed.
- `npm --prefix infra run build`: passed.
- `npm --prefix infra run synth:dev`: passed.
- AWS preflight: account `376129878018`, region `eu-north-1`.
- `npm --prefix infra run diff:dev`: showed only the approved redeem Lambda code/env change before deploy.
- `npm --prefix infra run deploy:dev`: passed.
- post-deploy `npm --prefix infra run diff:dev`: no differences.
- deployed endpoint smoke tests: passed.
- Aurora audit verification: planned/blocked/write-disabled attempts were written without Roller redemption writes.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `infra/lib/jumpyard-cloud-stack.ts`
- `infra/lambda/redeem/index.js`

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Booking creation implementation
- Payment implementation
- Add-product implementation
- Production config
- Production credentials
- `.env`

## Requirements

1. Replace the dev redeem placeholder with a real Lambda asset.
2. Keep the endpoint server-owned:
   - phone app must not call Roller directly
   - Roller credentials stay in AWS only
3. Validate request shape:
   - require booking identifier
   - require idempotency key
   - reject duplicate ticket ids
   - reject more than 10 ticket ids
4. Resolve the booking and ticket ids from Aurora.
5. Return a safe redeem plan for eligible bookings without writing to Roller by default.
6. Block unsafe cases before any Roller write:
   - unpaid booking
   - cancelled/deleted/draft booking
   - stale local booking snapshot
   - wrong expected date
   - unknown ticket id
   - already locally marked redeemed ticket
   - no ticket ids
7. Persist safe check-in attempt audit rows in Aurora.
8. Persist safe event-log rows for planned or blocked redeem attempts.
9. Include the Roller `POST /redemptions` client code behind a disabled environment guard for future controlled testing.
10. Do not enable real Roller redemption writes in the deployed dev endpoint during this ticket.

## Non-Goals

- Do not wire the phone UI to redeem.
- Do not redeem real Playground tickets through the deployed public endpoint.
- Do not create payment logic.
- Do not create booking logic.
- Do not implement add-product logic.
- Do not create staging or production resources.
- Do not change Roller Live/production.
- Do not add staff handoff UI.

## Acceptance Criteria

- `POST /v1/check-in/redeem` no longer returns the T0004 placeholder.
- The endpoint can return a `planned` response for an eligible paid booking using local Aurora ticket ids.
- The endpoint blocks unpaid bookings before Roller writes.
- The endpoint rejects invalid request shapes before database or Roller work.
- Real Roller redemption writes are disabled in deployed dev config.
- No phone UI, assets, deliverables, payment, booking creation, add-product, production config, or `.env` files are changed.
- Root validation and infra validation pass.

## Manual Verification

After deploy, call the dev endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem
```

Expected safe cases:

1. Missing idempotency key returns `invalid_request`.
2. Paid booking `5032210` returns `planned` with selected ticket ids and no Roller write.
3. Unpaid booking `5032211` returns `blocked` with reason `payment_required`.
4. `confirmRedeem=true` returns `blocked` with `redeem_write_disabled` while the deployed guard is disabled.

## Automated Validation

Run:

- `npm run validate`
- `node --check infra/lambda/redeem/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- post-deploy redeem endpoint smoke tests
