# CODEX_TASK.md

## Ticket ID

T0018

## Goal

Register the Roller Playground booking webhook against the deployed JumpYard Cloud dev endpoint and confirm real Roller delivery into Aurora.

## Dependencies

- T0017 completed, pushed, and merged to `main`.
- Dev AWS foundation exists in account `376129878018`, region `eu-north-1`.
- Dev webhook endpoint exists and enriches accepted booking webhook events.
- Roller credentials are present in AWS Secrets Manager.
- Dev webhook token secret exists in AWS Secrets Manager.

## Current Status

Completed locally and deployed to dev on branch `codex/t0018-roller-webhook-registration`.

Validation result:

- `npm --prefix infra run register:webhook:dev`: passed as dry-run and found existing webhook after apply.
- Guarded `npm --prefix infra run register:webhook:dev:apply`: registered Roller Playground webhook id `238`.
- `npm --prefix infra run build`: passed.
- `node --check infra/lambda/webhook/index.js`: passed.
- `npm --prefix infra run deploy:dev`: passed after adding real Roller header support.
- Post-deploy `npm --prefix infra run diff:dev`: no differences.
- `npm run validate`: passed.
- Real Roller Playground created-booking webhook:
  - booking reference `5032443`
  - unique id `69ea56d8-969f-41a3-bda5-cb09ad8a67b2`
  - event type `Created`
  - Aurora `jumpyard.roller_webhook_events.status` became `processed`
  - enrichment attempts `1`
  - processed at `2026-05-21 08:42:34.92816+00`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
- `infra/package.json`
- `infra/scripts/register-roller-webhook.ts`
- `infra/lambda/webhook/index.js`

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation outside test seed validation
- Production config
- Production credentials
- `.env`

## Requirements

1. Add a guarded Roller Playground webhook registration command that:
   - Reads Roller config from AWS SSM/Secrets Manager.
   - Reuses the Playground environment guard.
   - Defaults to dry-run.
   - Requires explicit write confirmation before registering a webhook.
   - Does not print secrets, webhook tokens, access tokens, or raw Roller responses.
2. Register the Playground booking webhook against:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings
```

3. Subscribe to booking events:
   - `Created`
   - `Updated`
   - `Cancelled`
4. Include tickets in the webhook payload.
5. Confirm the registration is idempotent by re-running dry-run after apply.
6. Confirm real Roller delivery reaches the deployed dev endpoint.
7. Confirm real delivery updates Aurora through the T0017 enrichment path.
8. Capture the real Roller auth header shape without logging token values.

## Non-Goals

- Do not register a live/production Roller webhook.
- Do not create staging or production AWS resources.
- Do not change phone UI.
- Do not implement payment.
- Do not implement redeem.
- Do not implement new booking creation UX.
- Do not store raw webhook payloads.
- Do not print secrets, tokens, customer names, addresses, booking notes, or raw Roller payloads.

## Acceptance Criteria

- Roller Playground has a booking webhook registered to the dev JumpYard Cloud endpoint.
- Registration dry-run detects the existing webhook and does not create duplicates.
- Real Roller Playground webhook delivery uses HTTP `POST`.
- Real Roller auth header is accepted by the dev Lambda.
- Real Roller created-booking webhook is persisted and enriched into Aurora.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- `node --check infra/lambda/webhook/index.js` passes.
- No app, asset, deliverable, payment, redeem, production config, or `.env` files are changed.

## Manual Verification

Use AWS Query Editor against database `jumpyard_cloud`:

```sql
select event_type, booking_reference, roller_unique_id, status, enrichment_attempts, processed_at, error_summary
from jumpyard.roller_webhook_events
where booking_reference = '5032443'
   or roller_unique_id = '69ea56d8-969f-41a3-bda5-cb09ad8a67b2'
order by received_at desc;
```

Expected result:

- `event_type`: `Created`
- `booking_reference`: `5032443`
- `status`: `processed`
- `enrichment_attempts`: `1`
- `error_summary`: `null`

Use Roller Playground webhook view if needed:

- webhook id `238`
- url `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- events `created`, `updated`, `cancelled`
- include `tickets=true`

## Automated Validation

Run:

- `npm --prefix infra run register:webhook:dev`
- Guarded `npm --prefix infra run register:webhook:dev:apply`
- `npm --prefix infra run build`
- `node --check infra/lambda/webhook/index.js`
- `npm --prefix infra run deploy:dev`
- Real Roller Playground create-booking webhook delivery check
- Aurora webhook event query
- `npm run validate`
