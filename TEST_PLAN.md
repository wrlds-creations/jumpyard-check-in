# Test Plan

Use this file to define validation for the current project or milestone.

## Automated Validation

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed | Passed on 2026-05-21 during T0023. |
| `npm run roller:env:check` | Confirm Roller env guard passes for local Playground config. | Passed | Passed with local `.env`. |
| `npm run roller:smoke` | Confirm Roller Playground auth works and one read-only request can run. | Passed | Passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19. |
| `npm run roller:seed:playground` | Plan deterministic Playground seed bookings without writes. | Passed | Passed on 2026-05-20; resolved six scenarios to child/variation product IDs. |
| `npm run roller:seed:playground:apply` without confirmation | Confirm seed writes fail closed unless explicitly confirmed. | Passed | Failed before writes without `ROLLER_SEED_ALLOW_WRITE`. |
| Guarded `npm run roller:seed:playground:apply` | Create deterministic Playground seed bookings. | Passed | Created booking references `5032210` through `5032215` in Playground on 2026-05-20. |
| T0008 seed readback | Confirm created seed bookings can be read by booking reference. | Passed | `GET /bookings/{bookingReference}` returned HTTP 200 for all six new references. |
| `node --check infra/lambda/lookup/index.js` | Confirm lookup Lambda JavaScript syntax. | Passed | Passed during T0009. |
| Local lookup handler smoke | Confirm lookup Lambda behavior before deploy. | Passed | Paid, pending, wrong-date, and not-found cases returned expected normalized responses. |
| Read-only booking detail check | Confirm known Playground booking lookup path. | Passed | `GET /bookings/5001370` returned HTTP 200 on 2026-05-19. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Passed | Passed on 2026-05-19. |
| `npm run infra:synth` | Synthesize JumpYard Cloud CloudFormation locally with example config. | Passed | Passed on 2026-05-19; does not deploy or require AWS credentials. |
| `npm --prefix infra audit` | Check newly added infra dependencies. | Warning | Reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; no dependency fix was applied in T0007. |
| `aws --version` | Confirm AWS CLI is installed for T0006 preflight. | Passed | Passed on 2026-05-19. |
| `aws sso login --profile wrlds-dev` | Refresh local AWS SSO credentials. | Passed | Login succeeded on 2026-05-19. |
| `aws sts get-caller-identity --profile wrlds-dev` | Confirm the active AWS identity before deploy. | Passed | Returned account `376129878018`. |
| `aws configure list --profile wrlds-dev` | Confirm active AWS profile and region before deploy. | Passed | Region `eu-north-1`. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Passed | Uses non-secret dev config. |
| `npm --prefix infra run diff:dev` | Review planned dev AWS resource creation before deploy. | Passed | Pre-deploy diff showed approved foundation resources; post-deploy diff showed no differences. |
| `npm --prefix infra run deploy:dev` | Deploy approved dev foundation. | Passed | First attempt failed on Aurora `16.3`; final deploy passed with Aurora `16.13`. |
| Placeholder API smoke | Confirm initial deployed placeholder API responded without Roller calls before T0009. | Passed | Historical T0006/T0007 check: `POST /v1/check-in/lookup` returned HTTP `501` before lookup implementation. |
| T0009 deployed lookup smoke | Confirm deployed lookup endpoint calls Roller server-side and returns normalized responses. | Passed | `5032210` => `ready`; `5032211` => `payment_required`; `5032212` with expected date `2026-05-21` => `wrong_date`; `999999999` => `not_found`. |
| T0010 phone lint | Confirm phone app lint passes after lookup wiring. | Passed | `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings. |
| T0010 phone build | Confirm phone app static export build passes after lookup wiring. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0010 lookup CORS preflight | Confirm browser requests can POST from the phone app to JumpYard Cloud. | Passed | `OPTIONS /v1/check-in/lookup` returned `204` with `access-control-allow-origin: *`. |
| T0010 local phone server | Confirm local phone app starts for manual flow testing. | Passed | `http://127.0.0.1:3000` returned HTTP `200`. |
| `node --check scripts/roller-data-api-smoke.js` | Confirm T0011 Data API smoke script syntax. | Passed | Passed on 2026-05-20. |
| `npm run roller:data:smoke` | Confirm local Playground credentials can access Roller Data API `/data/bookingitems`. | Passed | Returned 9 records for modified-date window `2026-05-20 -> 2026-05-21` and found all six T0008 seed booking references. |
| T0011 Data API production URL rejection | Confirm Data API smoke fails closed for live-looking Roller URL. | Passed | `ROLLER_BASE_URL=https://api.roller.app` was rejected before Data API calls. |
| `npm --prefix infra run build` | Confirm T0012 TypeScript importer compiles. | Passed | Passed on 2026-05-20. |
| T0012 bookingitems dry-run | Confirm Data API bookingitems importer normalizes records without Aurora writes. | Passed | Returned 9 records, 6 bookings, 9 booking items, and 0 skipped records. |
| T0012 bookingitems apply guard | Confirm importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_IMPORT_ALLOW_WRITE`. |
| T0012 AWS preflight | Confirm target account and region before dev Aurora write. | Passed | Account `376129878018`, region `eu-north-1`. |
| T0012 bookingitems dev apply | Import Data API bookingitems into dev Aurora. | Passed | Guarded apply matched 6 bookings and 9 booking items in Aurora. |
| T0012 idempotency check | Re-run guarded import against the same modified-date window. | Passed | Still matched 6 bookings and 9 booking items; no duplicate booking/item rows. |
| T0012 Aurora verification | Query dev Aurora for imported seed bookings and latest seed run. | Passed | `roller_bookings` has references `5032210` through `5032215`; latest `booking_seed_runs` status is `succeeded`. |
| T0013 product import dry-run | Confirm product importer reads Roller products without Aurora writes. | Passed | `npm --prefix infra run import:products:dev` found 96 top-level products and 491 flattened product/variation rows. |
| T0013 product import apply guard | Confirm product importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE`. |
| T0013 AWS preflight | Confirm target account and region before dev Aurora write. | Passed | Account `376129878018`, region `eu-north-1`. |
| T0013 product import dev apply | Cache Roller products and enrich booking items in dev Aurora. | Passed | Guarded apply matched 491 product cache rows and 9 booking item rows with product names. |
| T0013 Aurora verification | Query dev Aurora for enriched seed booking products. | Passed | Seed booking item rows now include names such as `Biljetter (260 kr)`, `SkyRider 1 åk`, `Hänglås`, and `Islatte`. |
| T0014 Data API tickets smoke | Confirm `/data/tickets` access and safe response shape. | Passed | Returned 6 records for modified-date window `2026-05-20 -> 2026-05-21`. |
| T0014 Data API bookingpayments smoke | Confirm `/data/bookingpayments` access and safe empty response behavior. | Passed | Returned 0 records for the seed window; endpoint access is valid. |
| T0014 Data API customers smoke | Confirm `/data/customers` access and contact-field shape. | Passed | Returned 6 records with `customerId`, `email`, and `contactNumber` fields. |
| T0014 migration status before apply | Confirm `0002 related data sources` is pending before apply. | Passed | `0001` applied, `0002` pending. |
| T0014 migration apply | Apply related data columns/indexes to dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied `0002 related data sources`. |
| T0014 related data dry-run | Confirm related Data API importer normalizes records without Aurora writes. | Passed | Returned 6 tickets, 0 payments, 6 customers, and 0 skipped records. |
| T0014 related data apply guard | Confirm importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_RELATED_IMPORT_ALLOW_WRITE`. |
| T0014 related data dev apply | Import related Data API sources into dev Aurora. | Passed | Guarded apply upserted 6 tickets, 0 payments, and 6 customers. |
| T0014 idempotency check | Re-run guarded import against the same modified-date window. | Passed | Re-run upserted the same 6 tickets and 6 customers without duplicate rows. |
| T0014 Aurora verification | Query dev Aurora for ticket, payment, and guest profile counts. | Passed | Counts: 6 tickets, 0 payments, 6 guest profiles; query output used masked contact values only. |
| `node --check infra/lambda/webhook/index.js` | Confirm T0015 webhook Lambda JavaScript syntax. | Passed | Passed on 2026-05-20. |
| T0015 local webhook handler smoke | Confirm fast-ack and retry classification before deploy. | Passed | Unauthorized and invalid JSON returned HTTP `200`; missing database config returned HTTP `500`. |
| T0015 deployed unauthorized webhook smoke | Confirm unauthorized webhooks are acknowledged and ignored. | Passed | `POST /v1/roller/webhooks/bookings` without token returned HTTP `200` and `ignored_unauthorized`. |
| T0015 deployed accepted webhook smoke | Confirm authorized webhook delivery is persisted. | Passed | Authorized event `t0015-smoke-booking-created-5032210` returned HTTP `200` and `accepted`. |
| T0015 deployed duplicate webhook smoke | Confirm webhook idempotency. | Passed | Repeating the same authorized event returned HTTP `200` and `duplicate`. |
| T0015 Aurora webhook query | Confirm deployed webhook smoke wrote metadata into Aurora. | Passed | `jumpyard.roller_webhook_events` contains event `t0015-smoke-booking-created-5032210` with status `received`. |
| T0015 post-deploy CDK diff | Confirm dev stack matches local T0015 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| `node --check infra/lambda/lookup/index.js` | Confirm T0016 lookup Lambda JavaScript syntax. | Passed | Passed on 2026-05-21. |
| T0016 local invalid JSON check | Confirm bad JSON is handled by the Lambda response instead of API Gateway failure. | Passed | Returned HTTP `400` with `invalid_json`. |
| T0016 local Aurora-first smoke | Confirm seeded bookings read from Aurora without Roller refresh. | Passed | `5032210`, `5032211`, and `5032212` returned from source `jumpyard_cloud`. |
| T0016 local live-refresh smoke | Confirm missing local booking refreshes from Roller and is then cached. | Passed | First `5001370` returned source `roller`; second `5001370` returned source `jumpyard_cloud`. |
| T0016 deployed lookup smoke | Confirm dev API uses Aurora-first behavior. | Passed | `5032210` ready, `5032211` payment required, `5032212` wrong date, `999999999` not found, and invalid JSON returned expected responses. |
| T0016 post-deploy CDK diff | Confirm dev stack matches local T0016 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| `node --check infra/lambda/webhook/index.js` | Confirm T0017 webhook Lambda JavaScript syntax. | Passed | Passed on 2026-05-21. |
| T0017 local webhook enrichment smoke | Confirm a new authorized webhook event refreshes Roller detail and updates Aurora. | Passed | Event `t0017-local-webhook-enrich-5032210-20260521094844` returned enrichment `processed`, booking `5032210`, 2 items, and 4 tickets. |
| T0017 local Aurora webhook query | Confirm local smoke event status changed after enrichment. | Passed | `jumpyard.roller_webhook_events` showed status `processed`, one enrichment attempt, and `processed_at`. |
| T0017 deployed webhook enrichment smoke | Confirm deployed webhook endpoint enriches through API Gateway/Lambda. | Passed | Event `t0017-deployed-webhook-enrich-5032210-20260521095241` returned enrichment `processed`, booking `5032210`, 2 items, and 4 tickets. |
| T0017 deployed Aurora webhook query | Confirm deployed smoke event status changed after enrichment. | Passed | `jumpyard.roller_webhook_events` showed status `processed`, one enrichment attempt, and `processed_at`. |
| T0017 post-deploy CDK diff | Confirm dev stack matches local T0017 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0018 webhook registration dry-run | Confirm Roller Playground webhook registration can be inspected without writes. | Passed | `npm --prefix infra run register:webhook:dev` found existing webhook id `238` and printed no secrets. |
| T0018 guarded webhook registration apply | Register the Roller Playground booking webhook against the dev endpoint. | Passed | Guarded apply registered webhook id `238` for booking `Created`, `Updated`, and `Cancelled` with `tickets=true`. |
| T0018 webhook Lambda syntax | Confirm real Roller header support is syntactically valid. | Passed | `node --check infra/lambda/webhook/index.js` passed. |
| T0018 infra build | Confirm registration script and Lambda changes compile. | Passed | `npm --prefix infra run build` passed. |
| T0018 dev webhook deploy | Deploy real Roller header support and event-type normalization. | Passed | `npm --prefix infra run deploy:dev` updated `WebhookHandler`. |
| T0018 real Roller delivery | Confirm an actual Roller Playground webhook reaches AWS and updates Aurora. | Passed | Booking `5032443` created a real `Created` event with status `processed` and one enrichment attempt. |
| T0018 post-deploy CDK diff | Confirm dev stack matches local T0018 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0019 phone lint | Confirm phone app lint passes after lookup polish. | Passed | `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings. |
| T0019 phone build | Confirm phone app build passes after lookup polish. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0019 API lookup check | Confirm webhook-created booking can be found via Aurora-first lookup. | Passed | `5032444` returned `found`, `payment_required`, source `jumpyard_cloud`, freshness `fresh`. |
| T0019 browser lookup check | Confirm local phone flow finds `5032444`. | Passed | Booking summary opened, showed `Obetald`, disabled `Betalning krävs`, and metadata confirmed `jumpyard_cloud` plus `fresh`. |
| `npm --prefix infra run migrate:dev:status` | Confirm pending/applied Aurora migrations for dev. | Passed | Showed `0001 initial schema: pending` before apply and `applied` after apply on 2026-05-20. |
| `npm --prefix infra run migrate:dev` | Apply pending Aurora migrations to dev. | Passed | Applied `0001 initial schema` to the approved dev Aurora cluster on 2026-05-20. |
| Aurora Data API schema query | Confirm expected `jumpyard` tables and indexes exist. | Passed | Verified 15 tables and 62 indexes in schema `jumpyard`. |

## Manual Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Source-of-truth document review | A new Codex session can understand Sprint 1 scope and constraints without chat history. | Pending | Review root source-of-truth docs. |
| No app behavior change | Existing check-in app flow remains untouched. | Pending | Confirm changed files stay outside UI/app source. |
| JumpYard Cloud contract review | The contract explains phone API, Roller endpoints, data ownership, AWS target, and open questions. | Pending | Review `JUMPYARD_CLOUD_CONTRACT.md`. |
| T0010 phone paid-ready lookup | Enter `5032210` in the phone lookup step. | Pending | Expected: booking summary opens using JumpYard Cloud response. |
| T0010 phone pending-payment lookup | Enter `5032211` in the phone lookup step. | Pending | Expected: booking summary opens, payment status shows `Obetald` with payment icon, and the check-in CTA is blocked. |
| T0010 phone wrong-date lookup | Enter `5032212` in the phone lookup step. | Pending | Expected: wrong-date stop state with expected date `2026-05-21`. |
| T0010 phone not-found lookup | Enter `999999999` in the phone lookup step. | Pending | Expected: not-found stop state. |
| T0011 Data API smoke review | Review `npm run roller:data:smoke` output. | Passed | Output prints counts, shape, booking references, booking dates, and modified date range only; no secrets, tokens, customer names, emails, or phone numbers. |
| T0012 Query Editor review | Run the T0012 verification SQL in AWS Query Editor. | Pending | Expected: six seed bookings and nine booking item rows are visible in `jumpyard` schema. |
| T0013 Query Editor review | Run the T0013 product verification SQL in AWS Query Editor. | Pending | Expected: 491 product cache rows and product names on the nine seed booking item rows. |
| T0014 Query Editor review | Run the T0014 related data verification SQL in AWS Query Editor. | Pending | Expected: 6 tickets, 0 payments for the seed window, and 6 guest profiles with masked contact fields. |
| T0015 Query Editor review | Run the T0015 webhook verification SQL in AWS Query Editor. | Pending | Expected: smoke event `t0015-smoke-booking-created-5032210` is visible with status `received`. |
| T0016 Query Editor review | Run the T0016 lookup-refresh verification SQL in AWS Query Editor. | Pending | Expected: `5001370` exists in `roller_bookings` with `source_last_updated_by='roller_live_lookup'`. |
| T0017 Query Editor review | Run the T0017 webhook enrichment verification SQL in AWS Query Editor. | Pending | Expected: `t0017-deployed-webhook-enrich-5032210-20260521095241` is visible with status `processed`. |
| T0018 Query Editor review | Run the T0018 real webhook verification SQL in AWS Query Editor. | Pending | Expected: booking `5032443` is visible in `roller_webhook_events` with event type `Created` and status `processed`. |
| T0019 phone manual lookup | Enter `5032444` in the phone lookup step. | Passed | Expected and observed: booking summary opens, shows `Obetald`, keeps check-in CTA disabled. |

## Roller Playground Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Credential smoke test | `npm run roller:smoke` confirms whether local Playground credentials can obtain auth and read one harmless endpoint. | Passed | Local `.env` passes guard and `/products` returns HTTP 200. |
| Expected success case | Playground-looking config and valid credentials pass. | Passed | Uses ROLLER's `https://api.play.roller.app` Playground pattern. |
| Production URL rejection | Production/live-looking URL fails before token or read request. | Passed | Production/live-looking URL was rejected before auth/read call. |
| Missing credentials failure | Missing `ROLLER_CLIENT_ID` or `ROLLER_CLIENT_SECRET` fails with a helpful message. | Passed | Blank credentials were rejected without printing secrets. |
| Known booking lookup | `GET /bookings/5001370` returns the expected Playground booking summary. | Passed | Returned booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`. |
| Dev API paid-ready lookup | `POST /v1/check-in/lookup` returns normalized ready response for `5032210`. | Passed | Status `found`, `eligibility.reason=ready`, `canCheckIn=true`. |
| Dev API pending-payment lookup | `POST /v1/check-in/lookup` returns payment-required response for `5032211`. | Passed | Status `found`, `eligibility.reason=payment_required`, `canCheckIn=false`. |
| Dev API wrong-date lookup | `POST /v1/check-in/lookup` returns wrong-date response for `5032212` when expected date is `2026-05-21`. | Passed | Status `found`, `eligibility.reason=wrong_date`, `canCheckIn=false`. |
| Dev API not-found lookup | `POST /v1/check-in/lookup` returns stable not-found response for unknown reference. | Passed | HTTP `404`, status `not_found`, error code `booking_not_found`. |
| T0008 paid-ready seed | Booking `5032210` can be read and is paid. | Passed | Status `Paid`, amount owing `0`, total `610`. |
| T0008 pending-payment seed | Booking `5032211` can be read and is unpaid. | Passed | Status `PendingPayment`, amount owing `260`. |
| T0008 wrong-date seed | Booking `5032212` can be read and uses the next-day date scenario. | Passed | Status `PendingPayment`, amount owing `260`. |
| T0008 SkyRider/add-on seed | Booking `5032213` can be read with jump entry plus SkyRider. | Passed | Status `PendingPayment`, amount owing `300`. |
| T0008 linked add-on seeds | Bookings `5032214` and `5032215` can be read separately for future JumpYard Cloud linking. | Passed | Original amount owing `260`; add-on amount owing `92`. |
| Data API bookingitems smoke | `GET /data/bookingitems` returns paged records for a modified-date window. | Passed | First page shape: `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items`. |
| Real booking webhook delivery | Creating a Playground booking triggers the registered JumpYard Cloud webhook. | Passed | Roller sent the configured token in `x-roller-apikey`; booking `5032443` reached Aurora as `Created` and `processed`. |
| Webhook-created phone lookup | A manually created Playground booking can be found from the phone flow after webhook enrichment. | Passed | Booking `5032444` returned from `jumpyard_cloud` with freshness `fresh`. |

## JumpYard Cloud Contract Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Frontend boundary | Phone app contracts point to JumpYard Cloud, not Roller. | Documented | T0003 is docs-only; implementation pending. |
| Roller lookup contract | Existing booking lookup uses `GET /bookings/{uniqueId or bookingReference}` first and `GET /bookings` as fallback. | Documented | Playground read-only check passed for booking reference `5001370`. |
| Redeem contract | Check-in is modeled as ticket-level redemption via `POST /redemptions`. | Documented | No redeem call made in T0003. |
| Add-product contract | Separate linked add-on booking is the primary existing-booking add-product pattern for the pilot. | Documented | No write call made in T0003. |
| AWS target | Proposed AWS resources are listed without creating resources. | Documented | AWS metadata still required before T0004. |
| Booking index strategy | Daily Data API seed, booking webhook updates, and live REST confirmation are documented as separate responsibilities. | Documented | Implementation pending. |
| Playground test data | Test bookings are created by protected internal tooling, not public phone UI. | Documented | Implementation pending. |
| Booking index ingestion contract | Daily seed, webhook intake/enrichment, and live REST reconciliation are documented separately. | Documented | See `BOOKING_INDEX_INGESTION_CONTRACT.md`. |

## AWS Foundation Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| CDK metadata guard | Missing `-c config=...` fails with a helpful message. | Passed | Verified on 2026-05-19. |
| CDK example synth | `npm run infra:synth` produces a template using `infra/config/dev.example.json`. | Passed | Example config is not approved for deploy. |
| Placeholder handlers | Unimplemented Lambda inline code returns `501` and does not call Roller. | Passed | Booking handlers still use placeholder code. Lookup, webhook, and safe redeem planning are implemented. |
| No AWS creation | No `cdk deploy` is run and `AWS_RESOURCES.md` keeps inventory empty. | Passed | Required for T0004 only; T0006 intentionally deployed dev. |

## Booking Index Ingestion Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Daily seed contract review | Get bookings, Get tickets, Get payments, and Get customers are identified as the expected source set. | Documented | T0005 contract only. |
| Webhook contract review | Booking webhook is treated as a same-day signal with dedupe, normalized event state, and enrichment rules. | Documented | T0005 contract only. |
| Live refresh contract review | `GET /bookings/{id}` remains authoritative before check-in-critical writes. | Documented | T0005 contract only. |
| Attendance separation | Get attendance is excluded from expected-guest seed and reserved for actual arrival/redeem reconciliation. | Documented | T0005 contract only. |
| PII/raw payload review | Raw payload storage is deferred and normalized storage is preferred. | Documented | T0005 contract only. |
| Roadmap review | T0006 deploys AWS dev before schema, seed tooling, lookup endpoint, daily seed, and webhook implementation. | Documented | No AWS deploy in T0005. |

## AWS Dev Deploy Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity preflight | `aws sts get-caller-identity` returns the approved dev account id. | Passed | Returned account `376129878018`. |
| AWS region preflight | Active region matches the approved dev region. | Passed | Region `eu-north-1`. |
| WRLDS tag review | All required WRLDS tags are confirmed before deploy. | Passed | Confirmed from Bluetooth Hub dev setup and user input; written to `infra/config/dev.json`. |
| CDK diff review | `cdk diff` shows only approved T0004 foundation resources. | Passed | Pre-deploy diff matched scope; post-deploy diff shows no differences. |
| CDK deploy | Dev foundation resources are created and recorded in `AWS_RESOURCES.md`. | Passed | Stack `jumpyard-check-in-dev-stack` is `CREATE_COMPLETE`. |
| T0009 CDK diff before deploy | Planned dev deploy changes only the lookup Lambda code asset. | Passed | `npm --prefix infra run diff:dev` showed only `LookupHandler` code changing from inline placeholder to S3 asset. |
| T0009 CDK deploy | Dev lookup Lambda is updated. | Passed | `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup`. |
| T0009 CDK diff after deploy | Dev stack is in sync after deploy. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0015 CDK deploy | Dev webhook Lambda and dev token secret are in the approved stack. | Passed | `npm --prefix infra run deploy:dev` passed and reported no changes because the stack was already in sync. |
| T0016 CDK deploy | Dev lookup Lambda is updated with Aurora-first code. | Passed | `npm --prefix infra run deploy:dev` updated only `LookupHandler`. |
| T0017 CDK deploy | Dev webhook Lambda is updated with enrichment code. | Passed | `npm --prefix infra run deploy:dev` updated only `WebhookHandler`. |
| T0018 CDK deploy | Dev webhook Lambda is updated for real Roller header support. | Passed | `npm --prefix infra run deploy:dev` updated only `WebhookHandler`. |
| T0023 CDK deploy | Dev session Lambda and session API routes are deployed. | Passed | `npm --prefix infra run deploy:dev` created `jumpyard-check-in-dev-stack-session` and session routes. |

## Aurora Schema Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Migration status before apply | `0001 initial schema` is pending. | Passed | `npm --prefix infra run migrate:dev:status`. |
| Migration apply | `0001 initial schema` applies successfully and records a row in `jumpyard.schema_migrations`. | Passed | `npm --prefix infra run migrate:dev`. |
| Migration status after apply | `0001 initial schema` is applied. | Passed | Re-running status showed `applied`. |
| Migration idempotency | Re-running migration command does not reapply `0001`. | Passed | Second `npm --prefix infra run migrate:dev` showed `0001 initial schema: applied` and made no pending changes. |
| Table inventory | `jumpyard` schema contains the expected ingestion and operational tables. | Passed | Direct Aurora Data API query returned 15 tables. |
| Index inventory | Lookup, webhook, seed, idempotency, and audit indexes exist. | Passed | Direct Aurora Data API query returned 62 indexes. |
| Secret handling | Migration runner resolves the Aurora admin secret without printing secret values. | Passed | Output prints cluster target and migration status only. |

## Staff Handoff Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Staff handoff flow | Staff can use a server-owned handoff code/session status. | Not started | Future ticket; no redeem logic in `T0003`. |

## T0020 Redeem Planning Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Missing idempotency key | `POST /v1/check-in/redeem` returns HTTP `400` with `idempotency_key_required`. | Passed | Deployed endpoint returned HTTP `400` before Aurora or Roller work. |
| Duplicate ticket ids | Endpoint returns HTTP `400` with `duplicate_ticket_ids`. | Passed | Local request-shape smoke mirrors Roller uniqueness rule. |
| More than 10 tickets | Endpoint returns HTTP `400` with `too_many_tickets`. | Passed | Local request-shape smoke mirrors Roller max 10 rule. |
| Paid ready booking | Endpoint returns `planned` with ticket ids and writes check-in attempt/event audit rows. | Passed | Booking `5032210` returned `planned` with 4 tickets; Aurora attempt row status `planned`. |
| Unpaid booking | Endpoint returns HTTP `409` with `payment_required`. | Passed | Booking `5032211` returned `blocked`; Aurora attempt row status `blocked`. |
| Confirm redeem while write guard disabled | Endpoint returns HTTP `409` with `redeem_write_disabled`. | Passed | Booking `5032210` with `confirmRedeem=true` returned `blocked`; Aurora attempt row status `write_disabled`. |

## T0021 Controlled Redeem Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Confirm without token | `confirmRedeem=true` returns HTTP `403` before Roller writes. | Passed | Deployed endpoint returned `forbidden` with `redeem_token_required`. |
| Planning still works | `confirmRedeem=false` returns `planned` and does not write to Roller. | Passed | Booking `5032454` returned `planned`; booking `5032210` planning behavior also remained intact. |
| Final live refresh | Confirmed redeem refreshes `GET /bookings/{identifier}` and upserts Aurora before write. | Passed | Aurora `roller_bookings.source_last_updated_by='roller_redeem_final_refresh'` for booking `5032454`. |
| Controlled Playground redeem | Dedicated paid Playground booking returns `redeemed`. | Passed | Booking `5032454` redeemed ticket `5032454-21397335` through Roller Playground. |
| Local already-redeemed block | Reusing the redeemed ticket is blocked as `already_redeemed`. | Passed | Follow-up request returned HTTP `409`; ticket row has `redeem_status_last_seen='redeemed'`. |

## T0022 Handoff Design Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone secret boundary | Docs state that phone UI must not hold Roller credentials, Roller tokens, or the T0021 dev redeem token. | Documented | See `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `JUMPYARD_CLOUD_CONTRACT.md`. |
| Session handoff boundary | Docs state that phone can start/resume a JumpYard Cloud check-in session, while final redeem is staff/server-confirmed. | Documented | No implementation or AWS change in T0022. |
| Final redeem safety | Docs preserve T0021 final live Roller refresh, eligibility re-check, idempotency, and audit before any `POST /redemptions`. | Documented | Future T0023 should implement session skeleton without phone-direct redeem. |
| No code/resource changes | T0022 changes only source-of-truth docs and contract files. | Passed | T0022 modified docs/contract files only; older local asset changes remain outside the ticket. |

## T0023 Check-in Session Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Validated before deploy. |
| Session migration | `0003 checkin sessions` applies to dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied the migration. |
| Paid booking start | Booking `5032210` creates a server-owned session. | Passed | Created session `jycs_mpfe3dum_7dc29b1b`. |
| Repeat start | Repeating the same booking start resumes the active session. | Passed | Returned `session_resumed` for `jycs_mpfe3dum_7dc29b1b`. |
| Unpaid booking block | Booking `5032211` is rejected before session progress. | Passed | Returned `payment_required`. |
| Ready for staff | A started session can be marked ready for staff. | Passed | Session `jycs_mpfe3dum_7dc29b1b` received handoff code `JY6085`. |
| No Roller write | Session endpoints do not call Roller or redeem tickets. | Passed | The Lambda only reads/writes Aurora and event-log/idempotency rows. |
