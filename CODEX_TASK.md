# CODEX_TASK.md

## Ticket ID

T0013

## Goal

Cache Roller Playground product catalog data in dev Aurora and enrich existing booking item rows with product names.

## Dependencies

- T0012 completed, pushed, and merged to `main`.
- Dev Aurora schema from T0007 exists.
- T0012 imported `/data/bookingitems` rows into `jumpyard.roller_booking_items`.
- Roller REST `/products` access works in Playground.
- Local Roller credentials exist in `.env`.
- AWS SSO/profile `wrlds-dev` can access account `376129878018`, region `eu-north-1`.
- Do not commit `.env`.

## Current Status

Completed locally and applied to dev Aurora on branch `codex/t0013-product-catalog-cache`.

Validation result:

- `npm --prefix infra run build`: passed
- `npm --prefix infra run import:products:dev`: passed dry-run
- `npm --prefix infra run import:products:dev:apply`: failed closed without write confirmation
- AWS identity preflight: account `376129878018`
- AWS region preflight: `eu-north-1`
- guarded apply with `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS`: passed

Import result:

- Roller endpoint: `GET /products`
- Top-level products read: `96`
- Flattened product/variation rows cached: `491`
- `jumpyard.product_catalog_cache` rows matched after apply: `491`
- `jumpyard.roller_booking_items` rows enriched with product names: `9`
- Seed booking item product names now include `Biljetter (260 kr)`, `Antal`, `SkyRider 1 åk`, `Hänglås`, and `Islatte`.

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

1. Add a dev import command for Roller REST `/products`.
2. The importer must:
   - Load local Roller `.env` values without printing secrets.
   - Reuse the Playground-only guard.
   - Read the Roller product catalog through a safe read-only API call.
   - Flatten top-level products and child/variation products.
   - Upsert normalized product rows into `jumpyard.product_catalog_cache`.
   - Enrich existing `jumpyard.roller_booking_items` rows with `product_name`, `parent_product_name`, and `parent_product_id`.
   - Be idempotent for repeated runs.
   - Avoid storing raw Roller payloads by default.
   - Avoid printing customer names, emails, phone numbers, booking notes, access tokens, or secrets.
3. The write command must fail closed unless an explicit write-confirmation environment variable is set.
4. Use only the existing dev Aurora database and schema. Do not create or deploy AWS resources.
5. Verify existing T0012 seed booking item rows now show product names.
6. Update source-of-truth docs with:
   - command names
   - validation result
   - query examples for AWS Query Editor
   - recommended next ticket

## Non-Goals

- Do not import `/data/tickets` yet.
- Do not import `/data/bookingpayments` yet.
- Do not import guest/customer email or phone yet.
- Do not change lookup to use Aurora first yet.
- Do not implement webhook intake.
- Do not schedule the job.
- Do not create or deploy AWS resources.
- Do not call Roller Live/production.
- Do not make Roller write calls.
- Do not change app UI.

## Acceptance Criteria

- `npm --prefix infra run import:products:dev` dry-runs safely.
- `npm --prefix infra run import:products:dev:apply` writes only when `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE` is set to the approved confirmation value.
- Aurora `jumpyard.product_catalog_cache` contains cached product rows after apply.
- Aurora `jumpyard.roller_booking_items` contains product names for the T0012 seed rows after apply.
- `npm run validate` passes.
- `npm --prefix infra run build` passes.
- No app, asset, deliverable, production config, `.env`, or AWS resource files are changed.

## Manual Verification

After apply, use AWS Query Editor against database `jumpyard_cloud`:

```sql
select count(*) as product_cache_rows
from jumpyard.product_catalog_cache
where roller_env = 'playground'
  and venue_id = 'jumpyard-check-in-dev';
```

```sql
select b.booking_reference, i.product_id, i.product_name, i.parent_product_name, i.quantity
from jumpyard.roller_booking_items i
join jumpyard.roller_bookings b on b.roller_unique_id = i.roller_unique_id
where b.booking_reference in ('5032210','5032211','5032212','5032213','5032214','5032215')
order by b.booking_reference, i.booking_item_id;
```

## Automated Validation

Run:

- `npm --prefix infra run build`
- `npm --prefix infra run import:products:dev`
- `npm --prefix infra run import:products:dev:apply` without confirmation
- `npm --prefix infra run import:products:dev:apply` with explicit write confirmation
- `npm run validate`
