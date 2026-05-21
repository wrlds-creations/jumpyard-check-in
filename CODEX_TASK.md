# CODEX_TASK.md

## Ticket ID

T0021

## Goal

Enable controlled Roller Playground ticket redemption through JumpYard Cloud with dev-only auth and a final live Roller refresh before any write.

## Dependencies

- T0020 completed, pushed, and merged to `main`.
- Dev `POST /v1/check-in/redeem` already resolves local Aurora booking/ticket snapshots and audits attempts.
- Roller `POST /redemptions` request shape is confirmed.
- Dev AWS target remains account `376129878018`, region `eu-north-1`.

## Current Status

Completed locally and deployed to dev on branch `codex/t0021-controlled-redeem-execution`.

Validation result:

- `npm run validate`: passed.
- `node --check infra/lambda/redeem/index.js`: passed.
- `npm --prefix infra run build`: passed.
- `npm --prefix infra run synth:dev`: passed.
- AWS preflight: account `376129878018`, region `eu-north-1`.
- `npm --prefix infra run diff:dev`: showed the approved redeem dev-token secret, CORS header, redeem Lambda asset/env change, and scoped Secrets Manager permission before deploy.
- `npm --prefix infra run deploy:dev`: passed.
- Follow-up `npm --prefix infra run diff:dev`: showed only the redeem Lambda asset update after removing the invalid default `redemptionDevice`.
- Follow-up `npm --prefix infra run deploy:dev`: passed.
- Final post-deploy `npm --prefix infra run diff:dev`: no differences.
- Controlled redeem smoke: booking `5032454` returned `redeemed` through Roller Playground.
- Aurora verification: ticket `5032454-21397335` is locally marked `redeemed`, and `jumpyard.checkin_attempts` contains `redeemed` plus follow-up `already_redeemed` rows.

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

1. Keep default redeem planning behavior intact for `confirmRedeem=false`.
2. Require a separate dev-only redeem token for `confirmRedeem=true`.
3. Store the redeem token in AWS Secrets Manager, not in code or `.env`.
4. Keep Roller config guarded to Playground only.
5. Before any Roller redemption write:
   - authenticate the confirmed redeem request
   - refresh the booking from Roller REST `GET /bookings/{identifier}`
   - upsert the refreshed booking/item/ticket snapshot into Aurora
   - re-run redeem eligibility against the refreshed Aurora context
6. Enable real Roller redemption writes only for the protected dev path.
7. Persist audit rows for successful, blocked, rejected, and unauthorized-safe outcomes where appropriate.
8. Run one controlled Playground redeem smoke against a dedicated paid test booking, not against the normal `5032210` lookup fixture if avoidable.
9. Confirm already-redeemed local state is visible in Aurora after the controlled redeem.

## Non-Goals

- Do not wire the phone UI to redeem.
- Do not create staff/admin redeem UI.
- Do not create payment logic.
- Do not create booking logic.
- Do not implement add-product logic.
- Do not create staging or production resources.
- Do not write to Roller Live/production.
- Do not expose this as a production-ready public redemption path.

## Acceptance Criteria

- `confirmRedeem=true` without the dev token is blocked before Roller writes.
- `confirmRedeem=true` with the dev token performs final Roller REST refresh before `POST /redemptions`.
- A controlled Playground redeem smoke succeeds for a dedicated paid booking.
- Aurora `jumpyard.checkin_attempts` records the successful redeem attempt.
- Aurora `jumpyard.roller_booking_tickets` marks the redeemed ticket(s) locally after success.
- Root validation and infra validation pass.
- Dev CDK diff/deploy are reviewed and documented.
- No UI, assets, deliverables, production config, production credentials, or `.env` files are changed.

## Manual Verification

After deploy, call the dev endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem
```

Expected controlled cases:

1. `confirmRedeem=true` without `x-jumpyard-redeem-token` returns HTTP `403`.
2. `confirmRedeem=false` still returns a safe `planned` response.
3. A dedicated paid Playground booking with valid dev token returns `redeemed`.
4. Reusing the same ticket after success is blocked locally as `already_redeemed`.

## Automated Validation

Run:

- `npm run validate`
- `node --check infra/lambda/redeem/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- post-deploy controlled redeem endpoint smoke tests
