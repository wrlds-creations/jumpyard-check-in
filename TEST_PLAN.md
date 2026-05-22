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
| `node --check scripts/roller-payment-discovery.js` | Confirm T0030 payment discovery script syntax. | Passed | Script parses before running Roller calls. |
| `npm run roller:payment:discover` | Confirm T0030 payment discovery dry-run path. | Passed | Loads local `.env`, validates Playground, reads products, selects product `1765836`, and creates no booking. |
| `npm run roller:payment:discover:apply-draft` without confirmation | Confirm T0030 draft write fails closed unless explicitly confirmed. | Passed | Failed before creating a draft without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE`. |
| Guarded T0030 draft apply | Confirm Roller Playground draft booking returns payment shape. | Passed | Direct guarded apply created draft unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; response returned HTTP `201`, total `260`, amount owing `260`, and a present `paymentJwt` without printing the raw JWT. |
| `node --check infra/lambda/booking/index.js` | Confirm T0031 booking Lambda JavaScript syntax. | Passed | Passed before deploy. |
| Local T0031 invalid draft smoke | Confirm request validation runs before AWS/Roller work. | Passed | Missing idempotency key returned HTTP `400` with `idempotency_key_required`. |
| `npm --prefix infra run build` | Confirm T0031 infra TypeScript compiles. | Passed | Passed before deploy. |
| `npm --prefix infra run synth:dev` | Synthesize the T0031 dev stack. | Passed | Uses non-secret `infra/config/dev.json`. |
| T0031 CDK diff | Confirm deploy scope. | Passed | Diff showed only `BookingHandler` Lambda code changing. CDK required temporary credentials exported from `wrlds-dev` because direct SSO profile resolution failed inside CDK. |
| T0031 dev deploy | Deploy booking Lambda implementation. | Passed | CloudFormation updated `jumpyard-check-in-dev-stack-booking` successfully. |
| T0031 deployed quote smoke | Confirm server-side quote works without creating booking. | Passed | `POST /v1/bookings/quote` returned HTTP `200`, total `260`, amount owing `260`, tax `14.72`, and `wroteBooking=false`. |
| T0031 deployed draft smoke | Confirm server-side draft creation and payment-session response. | Passed | `POST /v1/bookings/draft` returned HTTP `201`, draft unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, `jwtPartCount=3`, and payment config available; raw JWT was not printed. |
| T0031 post-deploy CDK diff | Confirm deployed stack matches local template. | Passed | CDK diff showed no differences after deploy. |
| `node --check scripts/roller-payment-package-poc.js` | Confirm T0032 payment package POC script syntax. | Passed | Passed during T0032 validation. |
| `npm run roller:payment:poc` | Confirm T0032 quote/default POC path without booking creation. | Passed | Returned quote HTTP `200`, total `260`, amount owing `260`, and status `blocked_prerequisites` with no draft booking created. |
| `npm run roller:payment:poc:apply-draft` without confirmation | Confirm T0032 draft mode fails closed. | Passed | Failed before creating a Playground draft without `ROLLER_PAYMENT_POC_ALLOW_DRAFT`. |
| `node --check infra/lambda/booking/index.js` | Confirm T0033 booking Lambda syntax. | Passed | Passed after availability/pre-payment changes. |
| `npm --prefix infra run build` | Confirm T0033 infra TypeScript compiles. | Passed | Passed after availability route and migration changes. |
| `npm --prefix infra run synth:dev` | Synthesize the T0033 dev stack. | Passed | Uses non-secret `infra/config/dev.json`. |
| `npm --prefix jumpyard-checkin-phone run lint` | Confirm phone lint passes after T0033 buy-entry changes. | Passed | Passed with the same pre-existing `<img>` warnings. |
| `npm --prefix jumpyard-checkin-phone run build` | Confirm phone app build passes after T0033 buy-entry changes. | Passed | Static export build passed. |
| T0033 deployed availability smoke | Confirm JumpYard Cloud reads Roller availability server-side. | Passed | `POST /v1/bookings/availability` returned HTTP `200` and available jump products for `2026-05-22`. |
| T0033 deployed quote/draft smoke | Confirm quote and draft work for the selected available slot. | Passed | Quote returned total `200`; draft returned HTTP `201`, `paymentJwtPresent=true`, and persisted pre-payment draft id `jypd_5d96dca81de8429eb4`. |
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
| T0036 infra build | Confirm Data API backfill orchestrator compiles. | Passed | `npm --prefix infra run build` passed. |
| T0036 backfill dry-run | Confirm the all-source backfill command reads a daily window without Aurora writes. | Passed | `npm --prefix infra run import:data-api-backfill:dev -- 2026-05-20 2026-05-21` passed with `apply=false`. |
| T0036 backfill apply guard | Confirm the all-source backfill command refuses writes without its top-level confirmation. | Passed | `npm --prefix infra run import:data-api-backfill:dev:apply -- 2026-05-20 2026-05-21` failed closed without `ROLLER_DATA_BACKFILL_ALLOW_WRITE`. |
| T0037 data-sync syntax | Confirm scheduled sync Lambda JavaScript syntax. | Passed | `node --check infra/lambda/data-sync/index.js` passed. |
| T0037 infra build | Confirm CDK TypeScript accepts the scheduled sync resources. | Passed | `npm --prefix infra run build` passed. |
| T0037 synth/diff/deploy | Confirm dev AWS contains the data-sync Lambda and EventBridge rule. | Passed | `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences. |
| T0037 manual Lambda smoke | Confirm the deployed Lambda can sync a small modified-date window. | Passed | Manual invoke for `2026-05-20 -> 2026-05-21` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, and 491 product rows; Aurora `booking_seed_runs` recorded status `succeeded`. |
| T0038 session Lambda syntax | Confirm check-in link code is syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed. |
| T0038 infra build | Confirm CDK accepts the link routes and dev-token secret. | Passed | `npm --prefix infra run build` passed. |
| T0038 synth/diff/deploy | Confirm dev AWS contains the check-in link routes and secret. | Passed | `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences. |
| T0038 deployed link smoke | Confirm protected link creation and public token resolution work. | Passed | Created a link without printing the raw token, resolved it to `session_started`, and verified the token row has `opened=true`, `consumed=false`, `active=true`. |
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
| T0024 phone lint | Confirm phone app lint passes after session-start wiring. | Passed | Passed with the same four pre-existing `<img>` warnings. |
| T0024 phone build | Confirm phone app build passes after session-start wiring. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0025 root validation | Confirm source-of-truth docs still validate after ready-for-staff wiring. | Passed | `npm run validate` passed on 2026-05-21. |
| T0025 phone lint | Confirm phone app lint passes after ready-for-staff wiring. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the same four pre-existing `<img>` warnings. |
| T0025 phone build | Confirm phone app build passes after ready-for-staff wiring. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |
| T0025 browser flow | Confirm paid booking reaches server-owned handoff screen. | Passed | Booking `5032210` reached `APP_CONFIRM` with handoff status `ready_for_staff` and code `JY6085`. |
| T0026 root validation | Confirm source-of-truth docs still validate after staff handoff wiring. | Passed | `npm run validate` passed on 2026-05-21. |
| T0026 session Lambda syntax | Confirm staff list/detail code is syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed. |
| T0026 infra build | Confirm CDK changes compile. | Passed | `npm --prefix infra run build` passed. |
| T0026 dev synth | Confirm dev stack includes staff routes. | Passed | `npm --prefix infra run synth:dev` passed. |
| T0026 admin lint | Confirm admin app lint passes after staff API wiring. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| T0026 admin build | Confirm admin static export builds. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| T0026 staff API smoke | Confirm deployed list/detail reads ready sessions from Aurora. | Passed | Staff list/detail returned booking `5032210`, session `jycs_mpfe3dum_7dc29b1b`, handoff code `JY6085`, 2 booking items, and 4 selected tickets. |
| T0027 redeem Lambda syntax | Confirm staff redeem route code is syntactically valid. | Passed | `node --check infra/lambda/redeem/index.js` passed locally before deploy. |
| T0027 admin lint | Confirm admin app lint passes after staff redeem action. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed locally. |
| T0027 admin build | Confirm admin static export builds after staff redeem action. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed locally. |
| T0027 infra build | Confirm CDK route change compiles. | Passed | `npm --prefix infra run build` passed locally. |
| T0027 dev synth | Confirm dev stack includes staff redeem route. | Passed | `npm --prefix infra run synth:dev` passed and included `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`. |
| T0027 dev deploy | Deploy the staff redeem route and Lambda code. | Passed | `npm --prefix infra run deploy:dev` updated the redeem Lambda and added the staff redeem API route. |
| T0027 post-deploy diff | Confirm dev stack matches local T0027 template. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| T0027 staff route guard smoke | Confirm staff redeem route rejects unsafe requests before DB/Roller work. | Passed | Local Lambda invocation returned `confirm_redeem_required` without confirmation and `redeem_token_required` without token. |
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
| T0025 phone handoff flow | Enter `5032210`, start check-in, complete safety, and confirm final screen. | Passed | Expected and observed: `APP_CONFIRM`, handoff status `ready_for_staff`, handoff code `JY6085`. |
| T0026 admin handoff view | Open the staff/admin app and inspect ready session `JY6085`. | Passed | Local browser verification at `http://127.0.0.1:3002/` showed `JY6085`, booking `5032210`, products, and tickets. |
| T0027 staff-confirmed redeem | Redeem a dedicated ready handoff through the new staff endpoint. | Passed | Booking `5032473`, session `jycs_mpfhz4jp_a4770adb`, handoff `JY3091` redeemed 1 ticket, marked session completed, and left the waiting list. |
| T0027 admin ready action | Open the admin app and inspect a ready handoff with redeem controls. | Passed | Browser verification showed booking `5032474`, handoff `JY7166`, token input, and disabled `Slutför` button until a code is entered. |
| T0038 Query Editor review | Inspect generated check-in token rows. | Passed | Deployed smoke confirmed the row exists by token hash only, with `opened_at` populated after token resolution. |

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
| Historical placeholder handlers | Unimplemented Lambda inline code returns `501` and does not call Roller. | Passed | Lookup, booking quote/draft, existing-booking add-product quote/draft, webhook, session, and redeem handlers are now implemented. |
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
| T0038 CDK deploy | Dev session link routes and dev-token secret are deployed. | Passed | Created `/jumpyard-check-in-dev/checkin-links/dev-token`, `POST /v1/check-in/session-links`, and `POST /v1/check-in/session-links/resolve`. |

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
| Phone ready-for-staff handoff | Phone marks a server-owned session ready for staff after safety attestation. | Passed | T0025 stores handoff status/code in phone state and shows code `JY6085`; no Roller redeem occurs. |
| Staff handoff list/detail | Staff can view sessions with `handoff_status='ready_for_staff'`. | Passed | T0026 added read-only dev staff endpoints and the admin app renders handoff `JY6085` without a redeem action. |

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

## T0024 Phone Session Start Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Paid booking start | Phone booking summary calls `POST /v1/check-in/sessions` before advancing. | Passed | Booking `5032210` advanced to add-ons only after session `jycs_mpfe3dum_7dc29b1b` was present. |
| Session state storage | Phone flow stores returned session id/status. | Passed | Browser state attributes showed `checkinSessionId=jycs_mpfe3dum_7dc29b1b` and status `ready_for_staff` from the resumed dev smoke session. |
| Unpaid booking block | Pending-payment booking cannot start phone session progress. | Passed | Booking `5032211` stayed on `APP_BOOKING`, CTA was disabled, and no session id was present. |
| No frontend secrets | Phone code does not contain Roller credentials or redeem token usage. | Passed | T0024 added only public JumpYard Cloud session calls. |

## T0025 Phone Ready-For-Staff Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Safety completion handoff | Phone calls `ready-for-staff` after safety attestation. | Passed | Booking `5032210` advanced from safety attestation to `APP_CONFIRM` after the endpoint returned. |
| Handoff state storage | Phone flow stores returned session and handoff state. | Passed | Browser state attributes showed `status=ready_for_staff`, `handoffStatus=ready_for_staff`, and handoff code `JY6085`. |
| Confirmation display | Final screen shows the server-owned code. | Passed | Screen displayed `JY6085` and QR payload `JY_HANDOFF:JY6085:jycs_mpfe3dum_7dc29b1b`. |
| No frontend redeem | Phone ready-for-staff does not call Roller or redeem tickets. | Passed | T0025 added only public JumpYard Cloud session handoff calls. |

## T0026 Staff Handoff List/Detail Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff list endpoint | `GET /v1/staff/check-in/sessions` returns ready sessions. | Passed | Returned one active ready session for booking `5032210` with handoff code `JY6085`. |
| Staff detail endpoint | `GET /v1/staff/check-in/sessions/{checkinSessionId}` returns detail. | Passed | Returned booking summary, 2 product rows, 4 ticket rows, and selected-ticket markers for session `jycs_mpfe3dum_7dc29b1b`. |
| No contact PII | Staff endpoints avoid guest email and phone. | Passed | Response includes booking/session/product/ticket summaries only. |
| No Roller/redeem action | Staff list/detail is read-only. | Passed | T0026 endpoints only read Aurora; no Roller call or redeem route is called. |
| Admin browser check | Admin UI renders the dev staff API result. | Passed | Browser verification showed `JY6085`, booking `5032210`, `Produkter`, and `Biljetter`. |

## T0027 Staff-Confirmed Redeem Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff route requires confirmation | Missing `confirmRedeem=true` is rejected. | Passed | Local Lambda invocation returned HTTP `400` with `confirm_redeem_required`. |
| Staff route requires dev token | Confirmed request without token is rejected before DB/Roller work. | Passed | Local Lambda invocation returned HTTP `403` with `redeem_token_required`. |
| Staff route final refresh | Confirmed route reuses T0021 final Roller refresh before write. | Passed | Dedicated smoke booking `5032473` was redeemed through the deployed staff route, which delegates to the T0021 redeem path. |
| Staff route success | Successful route marks selected tickets redeemed and session completed. | Passed | Detail API returned `status='redeemed'`, `handoffStatus='completed'`, `completedAt`, and 1 redeemed ticket for `jycs_mpfhz4jp_a4770adb`. |
| Admin UI action | Admin detail shows a protected `Slutför` action and does not persist the temporary code. | Passed | Browser verification showed `JY7166`, a password input placeholder `Tillfällig dev-kod`, and `Slutför`; no token is stored in source or browser storage by the app code. |

## T0028 QR Handoff Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone QR payload | Confirmation QR uses `JY_HANDOFF:<handoffCode>:<checkinSessionId>`. | Passed | Phone QR component renders with the `qrcode` library and exposes `data-qr-value`; the card exposes `data-qr-payload` for verification. |
| Phone guest display | Guest sees the scannable QR plus short handoff code, not the full technical payload. | Passed | Full payload is no longer visible as text on the confirmation card. |
| Admin paste payload | Staff can paste a full `JY_HANDOFF` payload and open the exact session detail by `checkinSessionId`. | Passed | Manual paste path shares the same parser as scanner results. |
| Admin short code | Staff can type a short `JY####` handoff code and select a matching active waiting-list session. | Passed | Short code lookup stays local to the loaded active list. |
| Admin camera scanner | Staff can open a camera QR scanner, and scanning stops after success or close. | Pending camera device | Code uses existing `@zxing/browser`; real scanning requires camera permission on the staff device. |

## T0029 Phone Session Resume Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ready-for-staff resume | Searching for a booking with a resumed `ready_for_staff` session opens the QR confirmation screen directly. | Passed | Browser verification with booking `5032469` resumed fresh session `jycs_mpfm485d_f3717834` directly from search and opened `APP_CONFIRM` with handoff code `JY1721`. |
| Already redeemed resume | Starting check-in for a completed/redeemed booking shows already checked in. | Passed | Browser verification with redeemed booking `5032454` routed to `APP_PRESENT`, showed `Redan incheckad`, and set `data-already-checked-in=true`. |
| Guest-in-progress resume | Searching for a new/guest-in-progress paid booking keeps the booking summary and then continues the normal guest flow. | Pending browser verification | Paid lookup may start/store the session, but no skip is applied unless the session is ready/completed. |
| Root validation | Source-of-truth docs and AWS tags validate after T0029. | Passed | `npm run validate` passed on 2026-05-21. |
| Phone lint | Phone app lint passes after resume routing. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing `<img>` warnings. |
| Phone build | Phone app builds after resume routing. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |

## T0030 New Booking Payment Discovery Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Dry-run discovery | Discovery command validates config, reads products, and creates no booking. | Passed | `npm run roller:payment:discover` selected `Biljetter (260 kr)` id `1765836`. |
| Apply guard | Apply command refuses writes without explicit one-off confirmation. | Passed | `npm run roller:payment:discover:apply-draft` failed closed without the confirmation env var. |
| Guarded Playground draft | Explicit guarded write creates only a Playground draft booking and does not process payment. | Passed | Draft unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; amount owing `260`; `paymentJwtPresent=true`. |
| Secret/JWT handling | Output never prints client secret, access token, or raw payment JWT. | Passed | Script reports only safe response shape and JWT metadata. |
| Official docs review | Roller custom checkout path is documented before UI work. | Passed | Official Roller Payments docs require ROLLER authorization, public HTTPS domain allowlisting, and approved payment package access. |
| Root validation | Source-of-truth docs and workflow checks pass after T0030. | Passed | `npm run validate` passed on 2026-05-21. |

## T0032 Payment Package POC Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Script syntax | `node --check scripts/roller-payment-package-poc.js` passes. | Passed | Passed during T0032 validation. |
| Quote-only default | `npm run roller:payment:poc` calls JumpYard Cloud quote and creates no booking. | Passed | Returned quote HTTP `200`, total `260`, amount owing `260`, and status `blocked_prerequisites`. |
| Draft guard | `npm run roller:payment:poc:apply-draft` fails closed without confirmation. | Passed | Failed before creating a Playground draft without `ROLLER_PAYMENT_POC_ALLOW_DRAFT`. |
| Guarded draft | Explicit guarded apply creates at most one Playground draft via JumpYard Cloud. | Passed | Created draft unique id `a8644795-a29d-4302-8a37-056d525e7bd4`, returned `paymentJwtPresent=true`, and did not print the raw JWT. |
| Payment package readiness | Missing package URL, public HTTPS origin, and fake/test card details are reported as blockers. | Passed | Current blockers: approved payment package, public HTTPS allowlisted origin, and Roller fake/test card details. |
| Root validation | Source-of-truth docs and workflow checks pass after T0032. | Passed | `npm run validate` passed on 2026-05-22. |

## T0033 Phone Pre-Payment Flow Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Booking Lambda syntax | `node --check infra/lambda/booking/index.js` passes. | Passed | Passed after T0033 implementation. |
| Infra build/synth | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` pass. | Passed | Passed before dev deploy. |
| Dev migration/deploy | Migration `0004` applies and dev stack deploys only approved booking route/Lambda changes. | Passed | `npm --prefix infra run migrate:dev`, `npm --prefix infra run deploy:dev`, and post-deploy diff passed. |
| Availability smoke | Deployed `POST /v1/bookings/availability` returns normalized capacity for the next phone start times. | Passed | Returned available `Entré 60 min` at `10:00` for `2026-05-22`. |
| Quote/draft smoke | Deployed quote and draft endpoints work for an available product/time/quantity. | Passed | Quote total `200`; draft `045b9ed6-7541-4f33-9e61-bfbd5bf0f8a3`, `paymentJwtPresent=true`, raw JWT not printed. |
| Aurora persistence | Draft creation stores safe pre-payment metadata without raw `paymentJwt`. | Passed | Verified row `jypd_5d96dca81de8429eb4`; browser smoke row `jypd_f78fea81bea24fdea2` also persisted. |
| Phone browser smoke | Local phone buy-entry reaches payment-pending state after creating a draft. | Passed | Selected 60 min at 10:00, quantity 1, quoted `200 kr`, then showed `Betalning väntar`. |
| Phone lint/build | Phone lint and build pass after the buy-entry UI changes. | Passed | Lint passed with existing `<img>` warnings; build passed. |
| Root validation | Source-of-truth docs and workflow checks pass after T0033. | Passed | `npm run validate` and `git diff --check` passed on 2026-05-22. |

## T0034 Add-Product Draft Step 1 Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Booking Lambda syntax | `node --check infra/lambda/booking/index.js` passes. | Passed | Passed after T0034 implementation. |
| Infra build/synth | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` pass. | Passed | Passed before dev deploy. |
| Dev migration/deploy | Migration `0005` applies and dev stack deploys only approved booking Lambda changes. | Passed | First migration attempt exposed the runner's `DO $$` limitation; migration was rewritten without a block, then apply/deploy passed. |
| Add-product quote smoke | Deployed quote validates original booking and returns costs without creating a draft or link. | Passed | `POST /v1/bookings/5032210/add-products/quote` returned HTTP `200`, total `200`, amount owing `200`, and `wroteBooking=false`; link count stayed unchanged. |
| Add-product draft smoke | Deployed draft creates a separate Roller Playground draft and Aurora link. | Passed | Created draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, add-on group `jyao_2b05e40abbda4bad9a`, link `jyl_cf14c98651b4451aba`, and prepayment draft `jypd_2a5ad290e9c34eadaa`. |
| Aurora persistence | Add-product draft state is stored without raw `paymentJwt`. | Passed | `prepayment_booking_drafts.flow_type='add_product'`, `booking_links.link_type='add_product_draft'`, and the only JWT column is `payment_jwt_present`. |
| Root validation | Source-of-truth docs and workflow checks pass after T0034. | Passed | `npm run validate`, `node --check infra/lambda/booking/index.js`, `npm --prefix infra run migrate:dev:status`, and `git diff --check` passed on 2026-05-22. |

## T0035 Phone Add-Product UI Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone lint | Phone app lint passes after add-product UI wiring. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing `<img>` warnings. |
| Phone build | Phone app builds after add-product UI wiring. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |
| Socks quote smoke | Add-product quote supports a stock-only socks add-on without creating a draft. | Passed | Direct dev API quote for booking `5032210`, product `1765445`, quantity `1`, `requireAvailability=false` returned total `45`, amount owing `45`, and `wroteBooking=false`. |
| Browser add-product flow | Existing-booking phone flow can create a separate add-on draft and stop at payment pending. | Passed | Browser smoke with booking `5032443` added one socks item, quoted `45 kr`, created draft `jypd_740b8fc10ee446639b`, and showed `data-add-product-status="payment_pending"`. |
| Aurora persistence | Browser-created add-product draft is linked to the original booking. | Passed | Aurora row `jypd_740b8fc10ee446639b` has `flow_type='add_product'`, `status='payment_pending'`, original booking `5032443`, amount `4500`, `payment_jwt_present=true`, and `booking_links.link_type='add_product_draft'`. |
| Root validation | Source-of-truth docs and workflow checks pass after T0035. | Passed | `npm run validate` and `git diff --check` passed on 2026-05-22. |
