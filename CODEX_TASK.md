# CODEX_TASK.md

## Ticket ID

T0014

## Goal

Import related Roller Data API sources into dev Aurora: tickets, booking payments, and customer contact data.

## Dependencies

- T0013 completed, pushed, and merged to `main`.
- Dev Aurora schema exists and T0012/T0013 data is present.
- Roller Data API `/data/tickets`, `/data/bookingpayments`, and `/data/customers` access works in Playground.
- Local Roller credentials exist in `.env`.
- AWS SSO/profile `wrlds-dev` can access account `376129878018`, region `eu-north-1`.
- Do not commit `.env`.

## Current Status

Completed locally and applied to dev Aurora on branch `codex/t0014-related-data-api-sources`.

Validation result:

- `npm --prefix infra run build`: passed
- `npm --prefix infra run migrate:dev:status`: `0001` applied, `0002` pending before apply
- `npm --prefix infra run migrate:dev`: applied `0002 related data sources`
- `npm --prefix infra run migrate:dev:status`: `0001` and `0002` applied after apply
- `npm --prefix infra run import:related-data:dev -- --start-date 2026-05-20 --end-date 2026-05-21`: passed dry-run
- `npm --prefix infra run import:related-data:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21`: failed closed without write confirmation
- AWS identity preflight: account `376129878018`
- AWS region preflight: `eu-north-1`
- guarded apply with `ROLLER_RELATED_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA`: passed
- guarded apply re-run against the same window: passed

Import result:

- Modified-date window: `2026-05-20 -> 2026-05-21`
- `/data/tickets` records read: `6`
- `/data/bookingpayments` records read: `0`
- `/data/customers` records read: `6`
- `jumpyard.roller_booking_tickets` rows matched after apply: `6`
- `jumpyard.roller_booking_payments` rows matched after apply: `0`
- `jumpyard.guest_profiles` rows matched after apply: `6`

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
- `infra/scripts/`
- `infra/migrations/`

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation
- AWS infrastructure resources
- Production config
- Production credentials
- `.env`

## Requirements

1. Confirm Roller Data API access for:
   - `/data/tickets`
   - `/data/bookingpayments`
   - `/data/customers`
2. Add a dev import command for related Data API sources.
3. The importer must:
   - Load local Roller `.env` values without printing secrets.
   - Reuse the Playground-only guard.
   - Read `startDate`, `endDate`, `pageNumber`, and `pageSize`.
   - Fetch paginated Data API records.
   - Upsert ticket rows into `jumpyard.roller_booking_tickets`.
   - Upsert payment rows into `jumpyard.roller_booking_payments`.
   - Upsert structured customer contact rows into `jumpyard.guest_profiles`.
   - Store email and phone as explicit structured fields plus masked/hash fields.
   - Avoid storing customer names, addresses, raw payloads, booking notes, access tokens, or secrets.
   - Be idempotent for repeated runs.
4. The write command must fail closed unless an explicit write-confirmation environment variable is set.
5. Use only the existing dev Aurora database and schema migration flow. Do not create or deploy AWS resources.
6. Verify Aurora contains imported rows for tickets and customer contact data.
7. Update source-of-truth docs with:
   - command names
   - migration result
   - validation result
   - query examples for AWS Query Editor
   - recommended next ticket

## Non-Goals

- Do not import gift cards yet.
- Do not change lookup to use Aurora first yet.
- Do not implement webhook intake.
- Do not schedule the job.
- Do not create or deploy AWS resources.
- Do not call Roller Live/production.
- Do not make Roller write calls.
- Do not change app UI.
- Do not implement SMS sending.
- Do not implement payment handling.
- Do not implement redemption.

## Acceptance Criteria

- Data API endpoint smoke checks pass for tickets, booking payments, and customers.
- `0002 related data sources` migration applies to dev Aurora.
- `npm --prefix infra run import:related-data:dev` dry-runs safely.
- `npm --prefix infra run import:related-data:dev:apply` writes only when `ROLLER_RELATED_IMPORT_ALLOW_WRITE` is set to the approved confirmation value.
- Aurora `jumpyard.roller_booking_tickets` contains imported ticket rows after apply.
- Aurora `jumpyard.guest_profiles` contains structured email/phone contact rows after apply.
- Payment import handles `0` records as a valid empty result.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- No app, asset, deliverable, production config, `.env`, or AWS resource files are changed.

## Manual Verification

After apply, use AWS Query Editor against database `jumpyard_cloud`:

```sql
select 'tickets' as table_name, count(*)::text as row_count
from jumpyard.roller_booking_tickets
union all
select 'payments', count(*)::text
from jumpyard.roller_booking_payments
union all
select 'guest_profiles', count(*)::text
from jumpyard.guest_profiles;
```

```sql
select b.booking_reference, t.ticket_id, t.product_id, t.booking_date
from jumpyard.roller_booking_tickets t
join jumpyard.roller_bookings b on b.roller_unique_id = t.roller_unique_id
order by b.booking_reference, t.ticket_id;
```

```sql
select roller_customer_id, email_masked, contact_number_masked, sms_ready
from jumpyard.guest_profiles
order by roller_customer_id;
```

## Automated Validation

Run:

- `node scripts/roller-data-api-smoke.js --path /data/tickets --start-date 2026-05-20 --end-date 2026-05-21`
- `node scripts/roller-data-api-smoke.js --path /data/bookingpayments --start-date 2026-05-20 --end-date 2026-05-21`
- `node scripts/roller-data-api-smoke.js --path /data/customers --start-date 2026-05-20 --end-date 2026-05-21`
- `npm --prefix infra run build`
- `npm --prefix infra run migrate:dev:status`
- `npm --prefix infra run migrate:dev`
- `npm --prefix infra run import:related-data:dev`
- `npm --prefix infra run import:related-data:dev:apply` without confirmation
- `npm --prefix infra run import:related-data:dev:apply` with explicit write confirmation
- `npm run validate`
