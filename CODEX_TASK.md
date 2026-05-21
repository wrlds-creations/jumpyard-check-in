# CODEX_TASK.md

## Ticket ID

T0017

## Goal

Enrich accepted Roller booking webhook events by refreshing the booking from Roller REST and updating the Aurora booking snapshot.

## Dependencies

- T0016 completed, pushed, and merged to `main`.
- Dev AWS foundation exists in account `376129878018`, region `eu-north-1`.
- Aurora migrations through `0002` are applied.
- Dev webhook intake endpoint exists.
- Roller credentials are present in AWS Secrets Manager.

## Current Status

Completed locally and deployed to dev on branch `codex/t0017-webhook-enrichment`.

Validation result:

- `node --check infra/lambda/webhook/index.js`: passed
- Local webhook handler smoke against dev AWS/Roller:
  - event `t0017-local-webhook-enrich-5032210-20260521094844`
  - response HTTP `200`, `accepted`
  - enrichment status `processed`
  - booking reference `5032210`
  - item count `2`
  - ticket count `4`
  - Aurora `roller_webhook_events.status` became `processed`
- `npm --prefix infra run build`: passed
- `npm --prefix infra run synth:dev`: passed
- `npm --prefix infra run diff:dev`: showed only the webhook Lambda code asset change before deploy
- `npm --prefix infra run deploy:dev`: passed
- Deployed webhook smoke:
  - event `t0017-deployed-webhook-enrich-5032210-20260521095241`
  - response HTTP `200`, `accepted`
  - enrichment status `processed`
  - Aurora `roller_webhook_events.status` is `processed`
- Post-deploy `npm --prefix infra run diff:dev`: no differences
- `npm run validate`: passed

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
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

1. Keep the T0015 webhook intake behavior:
   - Verify the dev webhook token.
   - Deduplicate by event id or payload hash.
   - Do not store raw webhook payloads.
   - Return HTTP `200` for ignored unauthorized, invalid request, accepted, and duplicate deliveries.
2. For a newly accepted booking webhook event:
   - Resolve booking reference or Roller unique id from the payload.
   - Call Roller REST `GET /bookings/{identifier}` through the existing server-side credentials/config guard.
   - Reject non-Playground Roller config before any Roller call.
   - Enrich product names from Roller `/products` on a best-effort basis.
   - Upsert normalized booking, booking item, and ticket rows into Aurora.
   - Mark the webhook event as `processed` when enrichment succeeds.
3. If the event lacks a booking identifier:
   - Mark it `pending_enrichment`.
   - Return HTTP `200`.
4. If enrichment fails because Roller or Aurora is unavailable:
   - Mark the webhook event `failed`.
   - Return HTTP `500` so Roller can retry.
   - Allow retry of duplicate deliveries when the previous status is `received` or `failed`.
5. Do not print secrets, access tokens, full raw Roller payloads, customer names, addresses, or notes.

## Non-Goals

- Do not register the real Roller webhook yet.
- Do not implement an async SQS enrichment worker yet.
- Do not implement redeem.
- Do not implement payment.
- Do not implement booking creation.
- Do not change phone UI.
- Do not add staging or production AWS resources.

## Acceptance Criteria

- New authorized booking webhook deliveries can update Aurora booking snapshots.
- Duplicate processed deliveries are ignored safely.
- Failed enrichment remains retryable through Roller webhook retries.
- Webhook event status moves to `processed` after successful enrichment.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run diff:dev` after deploy shows no differences.
- No app, asset, deliverable, payment, redeem, booking creation, production config, or `.env` files are changed.

## Manual Verification

Use the deployed dev endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings
```

The request must include the current dev webhook token from AWS Secrets Manager in one accepted header, such as:

```text
x-jumpyard-webhook-token: <dev token from /jumpyard-check-in-dev/webhooks/dev-token>
```

Recommended payload:

```json
{
  "eventId": "manual-t0017-booking-updated-5032210",
  "eventType": "Updated",
  "data": {
    "bookingReference": "5032210"
  }
}
```

Expected result:

- `status`: `accepted`
- `webhook.enrichment.status`: `processed`
- `webhook.enrichment.updatedBooking`: `true`
- `webhook.enrichment.bookingReference`: `5032210`

Use AWS Query Editor against database `jumpyard_cloud`:

```sql
select event_id_or_hash, status, booking_reference, enrichment_attempts, processed_at, error_summary
from jumpyard.roller_webhook_events
where event_id_or_hash like 'manual-t0017-%'
order by received_at desc;
```

## Automated Validation

Run:

- `node --check infra/lambda/webhook/index.js`
- Local webhook handler smoke against dev AWS/Roller
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Deployed webhook smoke
- Post-deploy `npm --prefix infra run diff:dev`
- `npm run validate`
