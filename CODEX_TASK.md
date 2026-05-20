# CODEX_TASK.md

## Ticket ID

T0009

## Goal

Implement the first deployed JumpYard Cloud booking lookup endpoint for the phone check-in flow.

## Dependencies

- T0008 completed, pushed, and merged to `main`.
- Roller Playground seed bookings exist:
  - `5032210`: paid-ready
  - `5032211`: pending payment
  - `5032212`: wrong date
  - `5032213`: SkyRider/add-on
  - `5032214`: original booking for linked add-on flow
  - `5032215`: separate add-on booking
- AWS dev foundation exists in account `376129878018`, region `eu-north-1`.
- AWS Roller credentials are stored in `/jumpyard-check-in-dev/roller/credentials`.
- Roller env/base URL are stored in SSM Parameter Store.

## Current Status

Completed locally and deployed to the approved dev stack on 2026-05-20.

Deploy result:

- Branch: `codex/t0009-booking-lookup-endpoint`
- Stack: `jumpyard-check-in-dev-stack`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Post-deploy diff: no differences

Smoke result:

- `5032210`: `found`, `ready`, `canCheckIn=true`
- `5032211`: `found`, `payment_required`, `canCheckIn=false`
- `5032212` with expected date `2026-05-21`: `found`, `wrong_date`, `canCheckIn=false`
- `999999999`: `not_found`, HTTP `404`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `infra/lib/`
- `infra/lambda/`
- `infra/package.json`
- `infra/package-lock.json`

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation
- Production config
- Production credentials
- `.env`

## Requirements

1. Replace the deployed lookup Lambda placeholder behind:
   - `POST /v1/check-in/lookup`
2. The endpoint must:
   - Accept a booking reference or Roller unique id in `identifier`.
   - Read Roller Playground credentials from Secrets Manager.
   - Read Roller env/base URL from SSM Parameter Store.
   - Reuse the Playground-only guard behavior.
   - Reject unsafe non-Playground config before Roller calls.
   - Call Roller server-side using `GET /bookings/{identifier}`.
   - Return normalized JumpYard response data, not raw Roller payloads.
   - Never return or log secrets, access tokens, or raw sensitive payloads.
3. Normalize at least:
   - `bookingReference`
   - `rollerUniqueId`
   - booking/payment status
   - `total`
   - `amountOwing`
   - booking items
   - product ids/names when safely available
   - ticket ids when present
4. Return eligibility for the phone flow:
   - `ready`
   - `payment_required`
   - `wrong_date`
   - `no_redeemable_tickets`
5. Keep this ticket read-only against Roller:
   - no booking create/update
   - no payment writes
   - no redemption writes
6. Deploy only to the approved dev stack after:
   - AWS account preflight
   - AWS region preflight
   - CDK synth
   - CDK diff
7. Smoke test the deployed endpoint against T0008 seed bookings.
8. Update source-of-truth docs with:
   - deployed behavior
   - validation results
   - any follow-up issues
   - recommended next ticket

## Non-Goals

- Do not connect the phone UI yet.
- Do not use local Aurora index first yet.
- Do not write lookup results to Aurora yet.
- Do not implement daily seed ingestion.
- Do not implement webhook intake.
- Do not implement redemption/check-in writes.
- Do not implement payment flow.
- Do not create staging or production AWS resources.

## Acceptance Criteria

- `POST /v1/check-in/lookup` no longer returns `501` in dev.
- Lookup for `5032210` returns `found` and `eligibility.reason=ready`.
- Lookup for `5032211` returns `found` and `eligibility.reason=payment_required`.
- Lookup for `5032212` with expected date `2026-05-21` returns `found` and `eligibility.reason=wrong_date`.
- Unknown booking reference returns a stable `not_found` response.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- `npm --prefix infra run diff:dev` shows only approved T0009 lookup Lambda code changes.
- Dev deploy succeeds.
- No UI, asset, deliverable, `.env`, production config, payment, or redeem files are changed.

## Manual Verification

After deploy, call:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup" `
  -ContentType "application/json" `
  -Body '{"identifier":"5032210","identifierType":"bookingReference","expectedDate":"2026-05-21"}'
```

Confirm the response is normalized and contains no raw Roller secret/token data.

## Automated Validation

Run:

- `node --check infra/lambda/lookup/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- `npm run validate`
