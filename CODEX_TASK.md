# CODEX_TASK.md

## Ticket ID

T0015

## Goal

Implement a safe dev Roller booking webhook intake endpoint in JumpYard Cloud.

## Dependencies

- T0014 completed, pushed, and merged to `main`.
- Dev AWS foundation exists in account `376129878018`, region `eu-north-1`.
- Aurora migrations through `0002` are applied.
- Roller webhook documentation confirms booking webhook events `Created`, `Updated`, and `Cancelled`, retry behavior, response handling, and fast-acknowledgement expectations.

## Current Status

Completed locally and deployed to dev on branch `codex/t0015-booking-webhook-intake`.

Validation result:

- `node --check infra/lambda/webhook/index.js`: passed
- Local webhook handler smoke: unauthorized and invalid JSON return HTTP `200`; missing database config returns HTTP `500`
- AWS identity preflight: account `376129878018`
- AWS region preflight: `eu-north-1`
- `npm --prefix infra run build`: passed
- `npm --prefix infra run synth:dev`: passed
- `npm --prefix infra run diff:dev`: expected webhook Lambda and dev-token secret changes before deploy
- `npm --prefix infra run deploy:dev`: passed; stack was already in sync and reported no changes
- Post-deploy `npm --prefix infra run diff:dev`: no differences
- Deployed webhook smoke:
  - unauthorized request returned HTTP `200` with `ignored_unauthorized`
  - authorized first request returned HTTP `200` with `accepted`
  - authorized duplicate request returned HTTP `200` with `duplicate`
- Aurora verification: `jumpyard.roller_webhook_events` contains event `t0015-smoke-booking-created-5032210` with status `received`

Deployed endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings
```

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
- `infra/lib/jumpyard-cloud-stack.ts`
- `infra/lambda/webhook/`

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

1. Replace the webhook placeholder with a real Lambda handler for:
   - `POST /v1/roller/webhooks/bookings`
   - `POST /v1/roller/webhooks/redemptions`
2. Add a dev-only webhook token stored in AWS Secrets Manager.
3. The handler must:
   - Accept only HTTP `POST`.
   - Parse JSON without logging raw payloads or secrets.
   - Require the dev token in a supported auth header until Roller production webhook verification is confirmed.
   - Return HTTP `200` quickly for accepted, duplicate, unauthorized, invalid JSON, and oversized requests.
   - Return HTTP `500` only for server-side config/database failures that should trigger Roller retry behavior.
   - Compute an idempotency key from a Roller event id when available, otherwise from a stable route/body hash.
   - Store only normalized event metadata and payload hash in `jumpyard.roller_webhook_events`.
   - Append a safe event in `jumpyard.event_log` for newly received events.
4. Deploy to the approved dev stack only after AWS account and region preflight.
5. Do not register a Roller webhook yet.
6. Do not implement webhook enrichment, booking snapshot updates, payment logic, or redemption logic yet.

## Non-Goals

- Do not call Roller from the webhook handler.
- Do not create, update, cancel, or redeem bookings.
- Do not store raw webhook payloads.
- Do not expose a production webhook endpoint.
- Do not add IP allowlisting yet.
- Do not implement scheduled imports.
- Do not change app UI.

## Acceptance Criteria

- Webhook Lambda is deployed for the dev webhook routes.
- Dev webhook token secret exists in AWS Secrets Manager.
- Unauthorized webhooks are acknowledged with HTTP `200` and not persisted.
- Authorized first delivery is acknowledged with HTTP `200` and persisted.
- Authorized duplicate delivery is acknowledged with HTTP `200` and not duplicated.
- Server-side configuration or database failures return HTTP `500`.
- Aurora `jumpyard.roller_webhook_events` has the smoke event row.
- No app, asset, deliverable, production config, `.env`, payment, redeem, or booking-creation code was changed.

## Manual Verification

Use AWS Query Editor against database `jumpyard_cloud`:

```sql
select event_id_or_hash, event_type, booking_reference, roller_unique_id, status
from jumpyard.roller_webhook_events
where event_id_or_hash = 't0015-smoke-booking-created-5032210';
```

Expected row:

```text
t0015-smoke-booking-created-5032210 | Created | 5032210 | t0015-smoke-booking-created-5032210-unique | received
```

## Automated Validation

Run:

- `node --check infra/lambda/webhook/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Post-deploy `npm --prefix infra run diff:dev`
- Deployed unauthorized webhook smoke
- Deployed authorized webhook smoke
- Deployed duplicate webhook smoke
- Aurora Data API verification query
- `npm run validate`
