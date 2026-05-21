# CODEX_TASK.md

## Ticket ID

T0023

## Goal

Implement the server-owned check-in session API skeleton so the phone flow can start or resume a JumpYard Cloud session without directly redeeming Roller tickets.

## Dependencies

- T0022 completed, pushed, and merged to `main`.
- Dev Aurora contains Roller booking, item, and ticket snapshots.
- Dev API already has lookup, webhook, and controlled redeem handlers.
- T0022 locked that phone UI must not hold redeem secrets or directly execute Roller redemption.

## Current Status

Completed locally and deployed to dev on branch `codex/t0023-checkin-session-api-skeleton`.

Validation result:

- `npm run validate`: passed.
- `node --check infra/lambda/session/index.js`: passed.
- Local request-shape smoke: invalid JSON and missing idempotency key returned stable `400` errors.
- `npm --prefix infra run build`: passed.
- `npm --prefix infra run synth:dev`: passed.
- AWS preflight: account `376129878018`, region `eu-north-1`.
- `npm --prefix infra run migrate:dev:status`: showed `0003 checkin sessions` pending before apply.
- `npm --prefix infra run migrate:dev`: applied `0003 checkin sessions`.
- `npm --prefix infra run diff:dev`: showed only the approved session Lambda, log group, API routes, invoke permissions, and scoped DB/log permissions before deploy.
- `npm --prefix infra run deploy:dev`: passed.
- Dev smoke: booking `5032210` created session `jycs_mpfe3dum_7dc29b1b`.
- Dev smoke: repeating `5032210` resumed the same active session.
- Dev smoke: booking `5032211` was blocked as `payment_required`.
- Dev smoke: session `jycs_mpfe3dum_7dc29b1b` was marked `ready_for_staff` with handoff code `JY6085`.
- Aurora verification: `checkin_sessions` row exists with `status='ready_for_staff'`, `handoff_status='ready_for_staff'`, and `safety_status='completed'`.
- Post-deploy `npm --prefix infra run diff:dev`: no differences.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `infra/migrations/`
- `infra/lambda/session/`
- `infra/lib/jumpyard-cloud-stack.ts`

## Do Not Touch

- Phone UI implementation
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

1. Add an Aurora migration for a `jumpyard.checkin_sessions` operational table.
2. Add a session Lambda that supports:
   - `POST /v1/check-in/sessions`
   - `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
3. `POST /v1/check-in/sessions` must:
   - require a booking identifier
   - require an idempotency key
   - read booking/ticket context from Aurora
   - create or resume an active server-owned session
   - reject unpaid, wrong-date, inactive, missing-ticket, and already-redeemed contexts
   - never call Roller
   - never redeem tickets
4. `ready-for-staff` must:
   - require an idempotency key
   - mark the session `ready_for_staff`
   - create or preserve a short handoff code
   - write safe audit/event rows
   - never call Roller
   - never redeem tickets
5. Add the session Lambda and routes to CDK.
6. Apply the dev Aurora migration and deploy the dev session API after AWS account/region preflight.
7. Update source-of-truth docs, AWS inventory, and test plan.

## Non-Goals

- Do not wire phone UI to sessions.
- Do not add staff/admin UI.
- Do not execute Roller redemption from sessions.
- Do not create payment logic.
- Do not create booking logic.
- Do not create add-product logic.
- Do not write to Roller.
- Do not create staging or production resources.

## Acceptance Criteria

- `checkin_sessions` exists in dev Aurora.
- Dev API exposes session start/resume and ready-for-staff routes.
- A paid ready booking can create a session.
- Repeating the start request resumes the active session instead of creating duplicates.
- A pending-payment booking is rejected.
- A session can be marked `ready_for_staff` and receives a handoff code.
- No phone UI, assets, deliverables, production config, production credentials, or `.env` files are changed.
- Root and infra validation pass.

## Manual Verification

After deploy, call:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions/{checkinSessionId}/ready-for-staff
```

Expected cases:

1. Booking `5032210` creates or resumes a session.
2. Booking `5032211` is rejected as `payment_required`.
3. A created session can be marked `ready_for_staff`.
4. Aurora shows the session and related event-log rows.

## Automated Validation

Run:

- `npm run validate`
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run migrate:dev:status`
- `npm --prefix infra run migrate:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- post-deploy endpoint smoke tests
