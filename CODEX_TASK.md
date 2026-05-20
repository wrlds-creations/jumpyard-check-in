# CODEX_TASK.md

## Ticket ID

T0012

## Goal

Import Roller Data API `/data/bookingitems` records into the existing dev Aurora booking index tables.

## Dependencies

- T0011 completed, pushed, and merged to `main`.
- Dev Aurora schema from T0007 exists.
- Roller Data API `/data/bookingitems` access works in Playground.
- Local Roller credentials exist in `.env`.
- AWS SSO/profile `wrlds-dev` can access account `376129878018`, region `eu-north-1`.
- Do not commit `.env`.

## Current Status

Completed locally and applied to dev Aurora on branch `codex/t0012-bookingitems-aurora-import`.

Validation result:

- `npm --prefix infra run build`: passed
- `npm --prefix infra run import:bookingitems:dev -- --start-date 2026-05-20 --end-date 2026-05-21`: passed dry-run
- `npm --prefix infra run import:bookingitems:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21`: failed closed without write confirmation
- AWS identity preflight: account `376129878018`
- AWS region preflight: `eu-north-1`
- guarded apply with `ROLLER_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS`: passed
- idempotency re-run against the same window: passed

Import result:

- Modified-date window: `2026-05-20 -> 2026-05-21`
- Data API records read: `9`
- `jumpyard.roller_bookings` matched after apply: `6`
- `jumpyard.roller_booking_items` matched after apply: `9`
- `jumpyard.booking_seed_runs` latest import status: `succeeded`
- Seed booking references visible in Aurora: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
- `.env.example`
- `infra/package.json`
- `infra/scripts/`

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

1. Add a dev import command for `/data/bookingitems`.
2. The importer must:
   - Load local Roller `.env` values without printing secrets.
   - Reuse the Playground-only guard.
   - Read `startDate`, `endDate`, `pageNumber`, and `pageSize`.
   - Fetch paginated Data API records.
   - Normalize booking-level data into `jumpyard.roller_bookings`.
   - Normalize booking item rows into `jumpyard.roller_booking_items`.
   - Track the run in `jumpyard.booking_seed_runs`.
   - Be idempotent for the same records.
   - Avoid storing raw Roller payloads by default.
   - Avoid printing customer names, emails, phone numbers, booking notes, access tokens, or secrets.
3. The write command must fail closed unless an explicit write-confirmation environment variable is set.
4. Use only the existing dev Aurora database and schema. Do not create or deploy AWS resources.
5. Run the importer against the T0008 seed modified-date window.
6. Verify Aurora contains imported rows for the known seed booking references.
7. Update source-of-truth docs with:
   - command names
   - validation result
   - query examples for AWS Query Editor
   - recommended next ticket

## Non-Goals

- Do not import `/data/tickets` yet.
- Do not import `/data/bookingpayments` yet.
- Do not import `/data/giftcards` yet.
- Do not change lookup to use Aurora first yet.
- Do not implement webhook intake.
- Do not schedule the job.
- Do not create or deploy AWS resources.
- Do not call Roller Live/production.
- Do not make Roller write calls.

## Acceptance Criteria

- `npm --prefix infra run import:bookingitems:dev` dry-runs safely.
- `npm --prefix infra run import:bookingitems:dev:apply` writes only when `ROLLER_IMPORT_ALLOW_WRITE` is set to the approved confirmation value.
- Aurora `jumpyard.roller_bookings` contains T0008 seed booking references after apply.
- Aurora `jumpyard.roller_booking_items` contains the imported booking item rows after apply.
- `jumpyard.booking_seed_runs` records the import run.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- No app, asset, deliverable, production config, `.env`, or AWS resource files are changed beyond docs/inventory.

## Manual Verification

After apply, use AWS Query Editor against database `jumpyard_cloud`:

```sql
select booking_reference, booking_status, payment_status, booking_date, total_cents
from jumpyard.roller_bookings
where booking_reference in ('5032210','5032211','5032212','5032213','5032214','5032215')
order by booking_reference;
```

```sql
select b.booking_reference, i.booking_item_id, i.product_id, i.quantity, i.booking_date, i.start_time, i.end_time
from jumpyard.roller_booking_items i
join jumpyard.roller_bookings b on b.roller_unique_id = i.roller_unique_id
where b.booking_reference in ('5032210','5032211','5032212','5032213','5032214','5032215')
order by b.booking_reference, i.booking_item_id;
```

## Automated Validation

Run:

- `node --check scripts/roller-data-api-smoke.js`
- `npm run roller:data:smoke`
- `npm --prefix infra run build`
- `npm --prefix infra run import:bookingitems:dev`
- `npm --prefix infra run import:bookingitems:dev:apply` with explicit write confirmation
- `npm run validate`
