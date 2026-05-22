# CODEX_TASK.md

## Ticket ID
T0037

## Goal
Create the scheduled dev AWS Data API sync that keeps Aurora updated from Roller modified-date exports.

## Dependencies
- T0036 completed and merged.
- Dev AWS stack exists.
- Dev Aurora schema through `0005` exists.
- Roller Playground credentials are stored in AWS Secrets Manager.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- BOOKING_INDEX_INGESTION_CONTRACT.md
- JUMPYARD_CLOUD_CONTRACT.md
- AWS_RESOURCES.md
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/data-sync/index.js

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Package dependencies
- Aurora migrations
- Payment package/drop-in code
- Redeem business logic
- SMS provider integration
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a dev-only scheduled Data API sync Lambda.
   - It must read Roller config from AWS Secrets Manager and SSM.
   - It must fail closed unless Roller is configured for Playground.
   - It must fetch the previous daily modified-date window by default.
   - It must support manual invocation with explicit `startDate` and `endDate`.

2. Use the current normalized Aurora model.
   - Upsert `/data/bookingitems` into `jumpyard.roller_bookings` and `jumpyard.roller_booking_items`.
   - Upsert `/data/tickets` into `jumpyard.roller_booking_tickets`.
   - Upsert `/data/bookingpayments` into `jumpyard.roller_booking_payments`.
   - Upsert `/data/customers` into `jumpyard.guest_profiles`.
   - Refresh REST `/products` into `jumpyard.product_catalog_cache` for product-name enrichment.

3. Add an EventBridge schedule in the dev CDK stack.
   - Run the sync once per day outside business hours.
   - Record sync status in `jumpyard.booking_seed_runs`.
   - Do not add any public API route for the sync.

4. Preserve the data safety model.
   - Never print Roller credentials, access tokens, raw payloads, raw guest names, raw emails, raw phone numbers, or booking notes.
   - Do not store raw Roller payloads.
   - Do not call Roller write endpoints.

5. Update source-of-truth docs with:
   - New AWS resources.
   - Validation and deploy results.
   - Recommended next ticket: `T0038 SMS token/session link foundation`.

## Non-goals
- Do not send SMS.
- Do not build SMS links or tokens.
- Do not implement payment drop-in.
- Do not create or mutate Roller bookings.
- Do not redeem tickets.
- Do not change app UI.
- Do not create production resources.

## Acceptance criteria
- `infra/lambda/data-sync/index.js` exists and passes syntax validation.
- CDK synth includes a Lambda and EventBridge rule for scheduled dev Data API sync.
- Dev deploy succeeds.
- Manual Lambda smoke can sync a small modified-date window into Aurora.
- `jumpyard.booking_seed_runs` records a succeeded T0037 run.
- `npm run validate` passes.
- No app code was changed.

## Manual verification
In AWS Console:
- Open EventBridge and confirm rule `jumpyard-check-in-dev-data-api-daily-sync`.
- Open Lambda and confirm function `jumpyard-check-in-dev-stack-data-sync`.
- Open CloudWatch Logs for the data-sync Lambda and confirm the latest smoke invocation logs only safe counts.
- Open Aurora Query Editor and inspect `jumpyard.booking_seed_runs` for the latest `scheduled-data-api:*` run id.

## Automated validation
Run:
- `node --check infra/lambda/data-sync/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Manual Lambda invoke against a small modified-date window
- `npm run validate`
- `git diff --check`
