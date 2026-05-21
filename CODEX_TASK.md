# CODEX_TASK.md

## Ticket ID

T0016

## Goal

Make `POST /v1/check-in/lookup` use Aurora first, with Roller REST refresh when the booking is missing or the local record is not safe to use.

## Dependencies

- T0015 completed, pushed, and merged to `main`.
- Dev AWS foundation exists in account `376129878018`, region `eu-north-1`.
- Aurora migrations through `0002` are applied.
- Dev Aurora contains booking, booking-item, product-cache, ticket, and guest-profile data from T0012 through T0014.
- Roller credentials are present in AWS Secrets Manager.

## Current Status

Completed locally and deployed to dev on branch `codex/t0016-aurora-first-lookup`.

Validation result:

- `node --check infra/lambda/lookup/index.js`: passed
- Local handler invalid JSON check: returned HTTP `400` with `invalid_json`
- Local handler smoke against dev Aurora:
  - `5032210`: `ready`, source `jumpyard_cloud`, no Roller refresh
  - `5032211`: `payment_required`, source `jumpyard_cloud`, no Roller refresh
  - `5032212`: `wrong_date`, source `jumpyard_cloud`, no Roller refresh
  - `999999999`: `not_found`
- Local live-refresh smoke:
  - First `5001370`: source `roller`, `refreshedFromRoller=true`
  - Second `5001370`: source `jumpyard_cloud`, `refreshedFromRoller=false`
- AWS identity preflight: account `376129878018`
- AWS region preflight: `eu-north-1`
- `npm --prefix infra run build`: passed
- `npm --prefix infra run synth:dev`: passed
- `npm --prefix infra run diff:dev`: showed only the lookup Lambda code asset change
- `npm --prefix infra run deploy:dev`: passed
- Post-deploy `npm --prefix infra run diff:dev`: no differences
- `npm run validate`: passed
- Deployed API smoke:
  - `5032210`: HTTP `200`, `ready`, source `jumpyard_cloud`
  - `5032211`: HTTP `200`, `payment_required`, source `jumpyard_cloud`
  - `5032212`: HTTP `200`, `wrong_date`, source `jumpyard_cloud`
  - `5001370`: HTTP `200`, found from Aurora after prior live refresh
  - `999999999`: HTTP `404`, `not_found`
  - invalid JSON: HTTP `400`, `invalid_json`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `infra/lambda/lookup/`

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation
- Webhook registration
- Production config
- Production credentials
- `.env`

## Requirements

1. Update lookup Lambda to query Aurora before Roller.
2. Aurora lookup must support:
   - `booking_reference`
   - `roller_unique_id`
   - known ticket id where present in `roller_booking_tickets`
3. If Aurora has a fresh, usable record:
   - Return the normalized booking from Aurora.
   - Include booking items and ticket ids.
   - Preserve existing phone response contract.
   - Do not call Roller.
4. If Aurora is missing, stale, tombstoned, or payment state is unclear:
   - Call Roller `GET /bookings/{identifier}`.
   - Normalize the Roller response.
   - Upsert the refreshed booking, items, and ticket ids back into Aurora.
   - Return the normalized refreshed response.
5. Keep Roller as source of truth for live refreshes and future write-critical operations.
6. Do not return raw Roller payloads.
7. Do not store raw Roller payloads or customer names/notes.
8. Keep current stop-state behavior for unpaid, wrong-date, no-ticket, not-found, and service failures.

## Non-Goals

- Do not change phone UI.
- Do not implement redeem.
- Do not implement payment.
- Do not implement booking creation.
- Do not register or process real Roller webhooks beyond T0015 event intake.
- Do not implement scheduled imports.
- Do not add staging or production AWS resources.

## Acceptance Criteria

- Known seeded bookings can be looked up from Aurora without Roller refresh.
- Missing local bookings can refresh from Roller and then be found from Aurora on the next lookup.
- Unknown bookings still return stable `404 not_found`.
- Invalid JSON returns stable `400 invalid_json`.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run diff:dev` after deploy shows no differences.
- No app, asset, deliverable, payment, redeem, booking creation, production config, or `.env` files are changed.

## Manual Verification

Use the deployed dev endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup
```

Recommended payload:

```json
{
  "identifier": "5032210",
  "identifierType": "bookingReference",
  "expectedDate": "2026-05-21"
}
```

Expected result:

- `status`: `found`
- `eligibility.reason`: `ready`
- `source.system`: `jumpyard_cloud`
- `source.refreshedFromRoller`: `false`

Use AWS Query Editor against database `jumpyard_cloud`:

```sql
select booking_reference, booking_status, payment_status, freshness_status, source_last_updated_by
from jumpyard.roller_bookings
where booking_reference in ('5032210', '5032211', '5032212', '5001370')
order by booking_reference;
```

## Automated Validation

Run:

- `node --check infra/lambda/lookup/index.js`
- Local handler smoke against dev Aurora
- Local live-refresh smoke
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Deployed API smoke
- Post-deploy `npm --prefix infra run diff:dev`
- `npm run validate`
